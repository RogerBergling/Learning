# Images, layers, Dockerfiles and build context

An image is built from a **Dockerfile** and a **build context**. Getting those two right explains most of Docker build performance and many accidental secret leaks.

## The build context

The final argument to `docker build` is the context:

```bash
docker build -t app:1.1.0 .
```

The dot is not “the Dockerfile location”; it is the directory tree sent to the builder. A context containing `node_modules`, `.git` or local secrets is slower to send, larger in cache and more dangerous.

`.dockerignore` controls what is excluded:

```text
.git
.github
.env
.env.*
!/.env.example
node_modules
.next
dist
coverage
*.log
*.pem
*.key
id_ed25519
```

`.dockerignore` is separate from `.gitignore`. A file can be tracked in Git and still excluded from the image build context. It is also not a security scanner: Docker only excludes files that match the rules.

## A small, readable Dockerfile

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 app
USER app

EXPOSE 8080
CMD ["python3", "-m", "http.server", "8080"]
```

What each instruction does:

| Instruction | Meaning |
|---|---|
| `FROM` | Base image; pin a digest for reproducible production builds |
| `ENV` | Runtime environment baked into the image metadata |
| `WORKDIR` | Working directory for later instructions and the process |
| `COPY` | Copy from build context into the image |
| `RUN` | Execute a build step and capture the resulting layer |
| `USER` | Default runtime user for the image |
| `EXPOSE` | Documentation of the intended container port; it does **not** publish a port |
| `CMD` | Default command/arguments; can be overridden at `docker run` |
| `ENTRYPOINT` | Executable that receives `CMD` as arguments |

## Layers and cache

Each instruction creates a layer or metadata. The cache key includes the instruction, its inputs and (for `COPY`/`ADD`) the content of the copied files.

```dockerfile
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY . .
```

Dependencies stay cached until `requirements.txt` changes. If you reverse the order:

```dockerfile
COPY . .
RUN pip install -r requirements.txt
```

every source edit invalidates the dependency install layer. That is the most common slow-build mistake.

Cache is an optimization, not a reproducibility guarantee. Pin base images and dependency lockfiles when the build must be repeatable.

## Multi-stage builds

Use a build stage for compilers and a runtime stage for the artifact:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
```

The final image does not need Node, the source or the package cache. Smaller images mean fewer packages to scan and pull.

## Build arguments and secrets

Build args are visible in image history and should not hold secrets:

```dockerfile
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
```

That is fine for a version label. Do not do this:

```dockerfile
ARG DATABASE_PASSWORD=...   # wrong: visible in history/build metadata
```

Use a BuildKit secret mount or inject the secret at runtime from a secret manager. If a secret was ever baked into a layer, deleting it in a later layer does not remove the earlier layer.

## Tags, digests and registries

```bash
docker build -t ghcr.io/owner/app:1.1.0 .
docker push ghcr.io/owner/app:1.1.0
docker inspect ghcr.io/owner/app:1.1.0 --format '{{index .RepoDigests 0}}'
```

- The tag is for humans and release tooling.
- The digest is for verification and rollback.
- A private GHCR package needs authenticated pulls; a public package allows anonymous pulls.
- A workflow with `GITHUB_TOKEN` needs `packages: write` and a package linked/visible to the repository.

## Build checklist

Before publishing:

- `.dockerignore` excludes `.git`, `.env`, keys, dependencies and build output.
- The base image is pinned and maintained.
- Dependencies are installed before copying the source.
- The build does not need secrets.
- The runtime user is non-root.
- The final image contains only what the process needs.
- The image is tagged with a version and the digest is recorded.

## Simulate it

- [Docker build: Dockerfile, context and layers](#/sim/docker-build)
- [GHCR delivery](#/sim/docker-ghcr)

Next: [Container lifecycle](#/learn/docker-03-containers-lifecycle).
