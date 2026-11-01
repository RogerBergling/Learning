# GHCR, tags, digests and the update loop

GitHub Container Registry (`ghcr.io`) stores OCI images and links them to a GitHub account and repository. It is a registry, not a deployment platform: the deployment host still has to pull and recreate the container.

## Image reference

```text
ghcr.io/rogerbergling/learning:1.1.0
^       ^            ^        ^
registry namespace    image    tag
```

The lowercase path is part of the package identity. If the repository is renamed, a workflow using `${{ github.repository }}` starts publishing to a new image path. The old GHCR package is not automatically renamed; update every consumer.

## Authentication and permissions

| Action | Required permission |
|---|---|
| Pull a private package | `read:packages` |
| Push a package | `write:packages` |
| Delete a package/version | `delete:packages` + admin |

Inside GitHub Actions, a repository-linked package can use the built-in `GITHUB_TOKEN`:

```yaml
permissions:
  contents: read
  packages: write
```

Outside Actions, use a personal access token or a GitHub App token with the minimum scope. Never put a token in a URL or a committed `.env`.

If a push returns 403 even though the token has `write:packages`, check:

- Is the package linked to this repository?
- Does the repository have Actions access to the package?
- Did the package previously belong to another repository/namespace?
- Is the image name lowercase and exactly the intended package?

## Build and push workflow

A minimal workflow:

```yaml
name: Publish image
on:
  push:
    branches: [main]
    tags: ["v*"]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v6
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=sha
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          provenance: true
          sbom: true
```

The workflow should also stamp build metadata into the image so the running app can prove its version. In this lab, `/version.json` contains the package version, image tag, commit and build time.

## Tag, digest and `latest`

- A **tag** is a mutable name. Pushing `1.1.0` again can replace what that tag points to.
- A **digest** is the immutable content identity.
- `latest` is a conventional tag, not proof of freshness.
- Multi-arch images have an index digest plus platform digests.

Verify the running digest:

```bash
docker inspect learning-lab --format '{{.Image}}'
docker image inspect ghcr.io/owner/repo:1.1.0 --format '{{index .RepoDigests 0}}'
```

A deployment is reproducible when you can name the digest you expect and compare it with the running container.

## Package visibility and linking

A package has its own visibility and access settings. A public GitHub repository does **not** automatically make its GHCR image public.

- Private package: deployment host must authenticate with `read:packages`.
- Public package: anonymous pull is possible, if package policy allows it.
- Linked repository: Actions in that repository can be granted package access.
- Unlinked package: pushes from a workflow can receive 403.

The package settings page shows visibility, linked repository and Actions access.

## Compose pull and update

```yaml
services:
  learning-lab:
    image: ghcr.io/rogerbergling/learning:latest
    pull_policy: always
    restart: unless-stopped
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
      - "com.centurylinklabs.watchtower.scope=learning"
```

`pull_policy: always` pulls before create/start. It does not replace a currently running container just because the registry has a new digest.

To update explicitly:

```bash
docker compose pull
docker compose up -d --force-recreate
curl -fsS http://127.0.0.1:8003/version.json
```

## Watchtower

Watchtower polls the registry on an interval, compares the remote tag/digest with the running container and recreates when it changes. It is convenient but requires:

- the Docker socket (host-level privilege)
- registry credentials for a private package
- a correctly scoped label/scope
- a rollback plan when an automatic update breaks the service

It is deliberately opt-in here via a Compose profile. In a regulated environment, prefer a CI/CD deployment with approval and immutable digests.

## The update loop, end to end

```text
commit → CI build → push version tag + digest → record digest
      → server pulls → recreate container → healthcheck
      → GET /version.json → compare version/commit/build date
```

If the version stamp did not change:

1. Check the workflow ran for the intended commit/tag.
2. Check the package path and tag/digest.
3. Check the server pulled successfully.
4. Check the container was recreated, not just restarted.
5. Check the browser/proxy cache.
6. Check you are looking at the intended host and container.

## Repository rename checklist

- Update the workflow image name if it is hardcoded (this repo uses `${{ github.repository }}`).
- Publish a new image under the new name.
- Update `compose.yaml`, deployment manifests and pull commands.
- Make the new package visible/accessible to the pulling identity.
- Keep the old package until rollback is no longer needed; it will not receive new `latest` pushes.
- Verify `/version.json` on the running host.

## Simulate it

- [GHCR delivery and Watchtower](#/sim/docker-ghcr)
- [Release tag to verified deployment](#/sim/git-release-ghcr)

Next: [Docker glossary](#/learn/docker-glossary).
