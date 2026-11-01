# Tags, releases and GHCR delivery

A tag is a name for a commit. A GitHub release is metadata around a tag. A GHCR image is a built artifact. Keeping those three distinct is what makes a release verifiable.

## Tags

```bash
git tag -a v1.1.0 -m "Learning Lab 1.1.0"
git show v1.1.0
git push origin v1.1.0
```

- **Lightweight tag**: just a ref to a commit.
- **Annotated tag**: an object with tagger, date, message and optional signature.
- **Signed tag**: an annotated tag signed with a configured key.

A tag is local until pushed. `git push --tags` pushes every tag; explicit individual tag pushes are easier to review.

Never move a release tag after consumers have pulled it. Publish a new version instead.

## Semantic versions

Use a version that communicates compatibility:

```text
vMAJOR.MINOR.PATCH
v1.1.0
```

- **MAJOR**: incompatible change
- **MINOR**: backward-compatible feature
- **PATCH**: backward-compatible fix

Pre-release/build metadata (`-rc.1`, `+build.7`) is useful but keep a predictable release tag for deployment.

## GitHub releases

```bash
gh release create v1.1.0 --generate-notes
gh release upload v1.1.0 dist/app.tar.gz
```

A release can contain notes, binaries, checksums and the image digest. It does not create a new commit or a new image by itself.

Good release notes include:

- what changed
- upgrade/migration steps
- the GHCR digest or immutable image tag
- known issues and rollback instructions

## GHCR workflow

```yaml
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

The workflow trigger is part of the release contract. A tag-triggered build only runs when the tag matches `v*` (or whatever filter you chose). A manual dispatch must run against the intended ref.

## Version stamp

Build the version into the artifact:

```text
version.json
{
  "version": "1.1.0",
  "imageTag": "v1.1.0",
  "commit": "c4d8cf5",
  "buildDate": "2026-11-01T08:00:00Z"
}
```

The deployment page displays it; `/version.json` exposes it. Compare it with the image digest you intended to deploy.

## Pull and verify

```bash
docker pull ghcr.io/owner/repo:v1.1.0
docker inspect ghcr.io/owner/repo:v1.1.0 --format '{{index .RepoDigests 0}}'
```

On the deployment host:

```bash
docker compose pull
docker compose up -d --force-recreate
curl -fsS http://127.0.0.1:8003/version.json
```

If the version stamp is old:

1. Did the workflow run for the right commit/tag?
2. Did it push the intended image path/digest?
3. Did the host pull successfully, with credentials if private?
4. Was the container recreated, not merely restarted?
5. Is a proxy/browser cache serving an old page?

## Package visibility and repository rename

- Public image: anonymous pull may work.
- Private image: the host needs `read:packages` credentials.
- A package must be linked/visible to the repository for `GITHUB_TOKEN` pushes.
- If the repository is renamed, `${{ github.repository }}` publishes under the new image path. The old GHCR package is not automatically renamed. Update `compose.yaml`, deployment manifests and pull commands; keep the old package for rollback until verified.

## Rollback

The safest rollback is to a known digest:

```bash
docker compose pull   # or docker pull image@sha256:...
docker compose up -d --force-recreate
```

Keep the previous digest and release notes. A tag can be moved or deleted; a digest is immutable. Test rollback before you need it.

## Simulate it

- [Release tag to verified deployment](#/sim/git-release-ghcr)
- [GHCR delivery and update loop](#/sim/docker-ghcr)

Next: [Git glossary](#/learn/git-glossary).
