# Docker Compose: the whole file, line by line

Compose is a declarative description of a project: services, networks, volumes and the settings that connect them. It is not a separate runtime; `docker compose` talks to the same Docker Engine as `docker run`.

## A real `compose.yaml`

```yaml
name: learning-lab

services:
  learning-lab:
    image: ghcr.io/rogerbergling/learning:latest
    container_name: learning-lab
    mem_limit: 100m
    mem_reservation: 32m
    memswap_limit: 100m      # same as mem_limit = no swap
    ports:
      - "8003:8080"
    restart: unless-stopped
    pull_policy: always
```

## Top-level keys

| Key | Meaning |
|---|---|
| `name` | Compose project name. Prefixes resources such as `learning-lab_default`. |
| `services` | The containers and their desired state. |
| `volumes` | Named volumes declared for the project. |
| `networks` | Networks declared for the project. |
| `secrets` / `configs` | Optional mechanisms for sensitive files and config objects. |

## Service keys

### `image`

```yaml
image: ghcr.io/rogerbergling/learning:latest
```

The image to run. `latest` is convenient for demos but mutable. A version tag or digest is safer for deployment. If `image` is present and `build` is absent, Compose does not build.

### `build`

```yaml
build:
  context: .
  dockerfile: Dockerfile
  args:
    APP_VERSION: 1.1.0
```

Builds an image instead of pulling one. `context` is sent to the builder; `args` are build-time values, not secrets. Do not put secrets in build args.

### `container_name`

```yaml
container_name: learning-lab
```

A fixed name. Useful for scripts and predictable logs, but it prevents scaling this service to multiple replicas and can collide with another project.

### `ports`

```yaml
ports:
  - "8003:8080"
```

`host:container`. Bind to `127.0.0.1:8003:8080` for local-only access. The container process must listen on `8080` (or on `0.0.0.0`) for the mapping to work.

### `volumes`

```yaml
volumes:
  - appdata:/var/lib/app
  - ./config:/etc/app:ro
```

Named volume (`appdata`) or bind mount (`./config`). `:ro` makes the mount read-only. State belongs in a volume, not the writable container layer.

### `environment` and `env_file`

```yaml
environment:
  LOG_LEVEL: info
env_file:
  - .env
```

`environment` sets literal values. `env_file` reads a file. `.env` in the project directory is also used for interpolation. Do not commit secret env files; provide `.env.example`.

Precedence for interpolation is roughly shell environment, `.env`, then the default in the file. `docker compose config` shows the resolved result.

### `depends_on`

```yaml
depends_on:
  db:
    condition: service_healthy
```

Controls start order. Plain `depends_on` does not mean the dependency is ready. Use a healthcheck plus `condition: service_healthy` when readiness matters.

### `restart`

```yaml
restart: unless-stopped
```

| Value | Behavior |
|---|---|
| `no` | No automatic restart |
| `always` | Restart on exit and daemon/boot |
| `on-failure` | Restart only on non-zero exit |
| `unless-stopped` | Restart unless explicitly stopped |

A restart policy repeats a failure loop; it does not fix the failure.

### `pull_policy`

```yaml
pull_policy: always
```

Asks Compose to pull before creating/starting a container. It does **not** update a running container by itself. It also does not force a pull when the local digest already matches the remote tag.

### Resource limits

```yaml
mem_limit: 100m
mem_reservation: 32m
memswap_limit: 100m
```

- `mem_limit`: hard memory ceiling; exceeding it can cause an OOM kill.
- `mem_reservation`: soft reservation/scheduling hint, not a guarantee.
- `memswap_limit`: total memory plus swap; equal to `mem_limit` means no swap.
- CPU limits can be expressed with `cpus`, `cpu_shares`, `cpu_quota` depending on Compose version.

Set limits deliberately and monitor OOM kills. A limit can turn a memory leak into a crash loop.

### `healthcheck`

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/version.json"]
  interval: 30s
  timeout: 3s
  retries: 3
  start_period: 5s
```

Healthchecks can also be defined in the Dockerfile. Compose can override them. Use a real endpoint that proves the app is serving.

### `user`, `read_only`, capabilities

```yaml
user: "10001:10001"
read_only: true
tmpfs:
  - /tmp
cap_drop:
  - ALL
security_opt:
  - no-new-privileges:true
```

These are runtime hardening controls. They belong in Compose if the deployment uses Compose. Verify with `docker inspect` because a platform may override them.

### `labels`

```yaml
labels:
  - "com.example.component=learning-lab"
```

Metadata for tools and operators. Docker itself does not assign meaning to labels; they are for discovery, ownership, policy and inventory.

### `profiles`

```yaml
profiles: ["debug"]
```

Profiles make a service opt-in. `docker compose up -d` starts only services without a profile (plus explicitly selected profiles). `docker compose --profile debug up -d` includes the debug service.

Profiles are useful for optional debug tools or admin interfaces. They are not a security boundary on their own.

### Why no Docker socket or automatic updater

This project intentionally does **not** mount `/var/run/docker.sock` and does not include an automatic in-place updater. Socket access gives a process control over every container and is effectively root-equivalent on the Docker host.

Updates are explicit:

```bash
docker compose pull
docker compose up -d --force-recreate
```

Review the new image/digest and verify `/version.json`. If you need automation, use a CI/CD pipeline with explicit approval and a pinned digest, not a container that can control the Docker daemon.

## Commands

```bash
docker compose config              # validate and print resolved config
docker compose up -d               # start services
docker compose ps
docker compose logs -f learning-lab
docker compose exec learning-lab sh
docker compose pull
docker compose up -d --force-recreate
docker compose down                # keep named volumes
docker compose down -v             # delete named volumes: destructive
```

`docker compose up -d --force-recreate` is often used after a pull. Verify the running digest/version stamp; “up” alone is not proof.

## Global settings and values

| Setting | Value in the example | Meaning |
|---|---|---|
| Memory limit | `100m` | Hard cap; OOM kill above it |
| Memory reservation | `32m` | Soft scheduling hint |
| Swap limit | `100m` | Same as memory → no swap |
| Restart policy | `unless-stopped` | Keep running across crashes/boot |
| Pull policy | `always` | Pull before create/start |
| Published port | `8003:8080` | Host 8003 → container 8080 |

## Simulate it

- [Compose services, network, volume and explicit updates](#/sim/docker-compose)
- [GHCR update flow](#/sim/docker-ghcr)

Next: [Operations, debugging and security](#/learn/docker-06-operations-security).
