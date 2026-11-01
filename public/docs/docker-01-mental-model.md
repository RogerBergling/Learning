# Docker mental model

Docker is not a virtual machine and it is not a single program. It is a client/server system for building and running **OCI containers**: isolated processes that share the host Linux kernel but have their own filesystem view, network namespace, process namespace and resource limits.

If you remember one sentence:

> An image is a read-only recipe; a container is a running process created from it; the daemon does the work; a registry stores images.

## The four objects

| Object | What it is | Where it lives |
|---|---|---|
| **CLI** (`docker`) | The client you type commands into | Your local machine |
| **Docker Engine / daemon** | The service that builds, pulls, creates and runs containers | Usually a Linux host, local or remote |
| **Image** | Immutable filesystem layers plus metadata (entrypoint, env, exposed ports) | Daemon’s image store and a registry |
| **Container** | A running or stopped instance of an image, with a writable layer and namespaces | The daemon |

`docker run` does not execute the process on your shell’s behalf. The CLI sends an API request to a **daemon** via a Unix socket (usually `/var/run/docker.sock`) or TCP/TLS. The daemon pulls the image, creates the container and starts the process.

Check which daemon you are talking to:

```bash
docker context ls
docker info
```

`docker context ls` matters on laptops with Docker Desktop, remote Docker hosts, and CI runners. A command can be correct and still hit the wrong engine.

## Image, tag and digest

An image reference has three useful parts:

```text
ghcr.io/rogerbergling/learning:1.1.0
^^^^^^^^^^^^^^^^^^^^^^^^^^ ^ ^^^^^
registry                   | tag
                           repository
```

- A **tag** is a mutable pointer. `latest` is just a tag, not a promise about freshness.
- A **digest** (`sha256:…`) identifies exact content. Tags can move; digests cannot.
- A **layer** is a content-addressed filesystem diff. Layers are shared between images.
- A **manifest** describes which layers and config belong to a platform-specific image.
- A **multi-arch image** is an index pointing at platform-specific manifests.

For anything you deploy, record the digest you tested. `latest` is acceptable for a personal lab and a bad idea for a production rollback story.

## Container vs virtual machine

| | Container | Virtual machine |
|---|---|---|
| Kernel | Shared with host | Own kernel |
| Startup | Milliseconds to seconds | Seconds to minutes |
| Isolation | Namespaces + cgroups + capabilities | Hardware virtualization |
| Image size | Application + userland | Full OS |
| Security boundary | Stronger than a plain process, weaker than a VM | Strong hypervisor boundary |

Containers are **not** a security boundary equivalent to a VM. A kernel exploit or a privileged container can affect the host. Treat `--privileged` and mounting `/var/run/docker.sock` as host-level trust.

## The lifecycle in one line

```text
build/pull image → create container → start process → use → stop → remove container
                                      image and volumes may remain
```

A stopped container is not an image. Its writable layer still exists until you remove it. Named volumes outlive containers by design.

## What persists, what disappears

| Change | Survives container removal? |
|---|---|
| Writable layer edits (`exec`, app writes) | No |
| Image layer | Yes, until the image is deleted |
| Named volume | Yes, until explicitly removed |
| Bind mount on the host | Yes, because it is a host path |
| Environment variables in `docker run` | No, unless recreated |
| Compose service definition | Yes, in the file |

This is why databases use volumes and why “it worked until I recreated the container” is usually a state-location mistake.

## The daemon is powerful

The Docker daemon can create containers that mount host directories, access devices and modify the host network. Anyone who can talk to the daemon can often become root through a container.

Security consequences:

- Do not expose the daemon TCP socket without TLS and authentication.
- Do not mount the Docker socket into an application container casually.
- Watchtower with the socket is convenient but host-level privilege.
- Use rootless Docker or a non-root user where the deployment allows it.

## Common first commands

```bash
docker version
docker info
docker pull nginx:alpine
docker run --rm -d -p 8080:80 --name web nginx:alpine
docker ps
docker logs --tail 50 web
docker exec -it web sh
docker stop web
docker rm web
```

Read what each flag means in [the container lifecycle chapter](#/learn/docker-03-containers-lifecycle).

## Where Docker fits in this lab

- [Run from image to container](#/sim/docker-run) — pull, create, port, volume, logs and removal.
- [Build an image](#/sim/docker-build) — context, Dockerfile, layers and GHCR.
- [Compose the stack](#/sim/docker-compose) — services, network, volume and resources.

Next: [Images, layers and builds](#/learn/docker-02-images-and-builds).
