# Docker glossary

Terms used throughout the Docker track, in plain language.

## A–C

**Add / COPY** — Dockerfile instructions that bring files from the build context into the image. Prefer `COPY` unless you specifically need `ADD` behavior such as local tar extraction.

**Anonymous volume** — A volume created without an explicit name. Harder to track and back up; prefer named volumes for state.

**Bind mount** — A host path mounted into a container. Changes are visible on both sides. Use `:ro` when the container should not modify it.

**Bridge network** — The default container network model on a Linux host. User-defined bridge networks provide automatic DNS between services.

**Build context** — The directory tree sent to the builder. `.dockerignore` controls what is excluded.

**BuildKit** — The modern Docker build engine, with better caching, concurrency, secret mounts and multi-platform support.

**cgroup (control group)** — Linux kernel mechanism used to limit and account for CPU, memory, PIDs and I/O.

**CLI** — The `docker` client. It sends requests to a daemon; it does not run containers itself.

**Compose** — A declarative tool for defining services, networks and volumes in `compose.yaml` and managing them as a project.

**Container** — An isolated process (or group of processes) created from an image, with its own filesystem view, network namespace and resource controls.

**Container layer** — The writable layer added on top of the read-only image layers. Lost when the container is removed.

**Container registry** — A service that stores and serves image manifests and layers, e.g. GHCR.

## D–H

**Daemon / Docker Engine** — The background service that builds, pulls, creates, starts and monitors containers.

**Digest** — A content-addressed identifier such as `sha256:…`. Immutable; the right thing to record for deployment verification.

**Docker Desktop** — A desktop application bundling a Linux VM/engine, CLI and optional Kubernetes. Common on macOS/Windows.

**Docker Hub** — Docker’s public registry. Rate limits and trust settings differ from GHCR.

**Dockerfile** — The ordered build recipe.

**Entrypoint** — The executable a container runs. `CMD` supplies default arguments.

**Environment variable** — Key/value configuration passed to a process. Visible in `docker inspect`; not a secret store.

**Expose** — Documents a container port. It does not publish it to the host.

**GHCR** — GitHub Container Registry at `ghcr.io`.

**Healthcheck** — A command or endpoint the Engine periodically tests to report container health.

## I–P

**Image** — Immutable filesystem layers plus metadata used to create containers.

**Image layer** — A content-addressed filesystem diff. Shared between images and cached locally.

**Kernel namespace** — Linux isolation mechanism for processes, mounts, network, users, hostnames and IPC.

**Manifest** — Registry metadata describing the layers/config for an image and platform.

**Multi-stage build** — A Dockerfile with multiple `FROM` stages, letting the final image copy only the built artifact.

**Named volume** — Docker-managed persistent storage with a name. Survives container removal.

**OCI** — Open Container Initiative; the image/runtime standards Docker implements.

**Overlay filesystem** — A union filesystem used by many container storage drivers to combine image layers with a writable layer.

**Port mapping** — `host:container` publication of a container port. The process must listen on the container port and an appropriate interface.

**`pull_policy`** — Compose setting controlling when an image is pulled before create/start.

## R–Z

**Registry** — Stores and distributes images. Examples: GHCR, Docker Hub, a private registry.

**Restart policy** — Engine/Compose behavior after a container exits (`no`, `always`, `on-failure`, `unless-stopped`).

**Rootless Docker** — Running the daemon and containers without root, reducing host-level risk.

**Runtime** — The component that creates and runs containers from images, e.g. containerd/runc or Docker Engine.

**Service** — A Compose abstraction for one or more containers defined by an image/build plus configuration.

**Tag** — A mutable human-readable pointer to an image manifest. `latest` is a tag, not a guarantee.

**tmpfs** — A memory-backed filesystem; data disappears when the container stops. Useful for read-only root filesystems.

**Volume** — Persistent storage managed by Docker. Named volumes are the default choice for state.

**Writable layer** — The per-container filesystem layer that sits above the image; deleted with the container.

## See also

- [Docker mental model](#/learn/docker-01-mental-model)
- [Docker operations and security](#/learn/docker-06-operations-security)
- [GHCR and updates](#/learn/docker-07-ghcr-and-updates)
- [Git glossary](#/learn/git-glossary)
