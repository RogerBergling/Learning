# Container lifecycle: run, inspect, stop, remove

The everyday Docker workflow is a loop:

```text
run/pull → ps → logs → exec/inspect → stop/remove
```

This chapter covers the commands and the state transitions they cause.

## `docker run` is create + start

```bash
docker run -d \
  --name learning-lab \
  -p 127.0.0.1:8003:8080 \
  --restart unless-stopped \
  ghcr.io/rogerbergling/learning:latest
```

| Flag | Meaning |
|---|---|
| `-d` | Detached; return after starting |
| `--name` | Stable container name (unique among local containers) |
| `-p 127.0.0.1:8003:8080` | Publish host port 8003 on loopback to container port 8080 |
| `--restart unless-stopped` | Restart on failure/boot unless deliberately stopped |
| `-e NAME=value` | Environment variable (visible in inspect; not a secret store) |
| `-v name:/path` | Named volume |
| `--mount type=bind,src=/host/path,dst=/container/path` | Explicit bind mount |
| `--rm` | Remove the container automatically when it exits |

Ports have two meanings:

- **Container port**: the port the process listens on inside the container.
- **Host port**: the published port on the Docker host.

The mapping syntax is `host:container`. `127.0.0.1` is a good default for services that should not be exposed to the LAN.

## State

```bash
docker ps          # running
docker ps -a       # running + stopped
docker inspect NAME
```

Look at:

- status and exit code
- restart count
- image digest
- mounts
- network addresses and published ports
- environment
- health status
- resource limits

A container that is “Up” can still be unhealthy. A container that restarts every few seconds is usually failing during startup; read the logs before changing the image.

## Logs

```bash
docker logs --tail 100 --timestamps learning-lab
docker logs -f learning-lab
```

Docker captures the process’s stdout/stderr. If the app writes only to an internal file, `docker logs` may be empty.

Logging best practice for containers: log to stdout/stderr, let the platform collect it, and rotate at the daemon or platform layer. A log file inside the writable layer is lost on recreation.

## Exec

```bash
docker exec -it learning-lab sh
```

`exec` starts an additional process inside a running container. It is excellent for inspecting DNS, environment, files and processes. It is not a deployment mechanism: changes to the writable layer disappear at the next recreate.

If the image has no shell (distroless/minimal), use a separate debug container or copy files out. Do not add a shell to a production image just to debug one incident.

## Stop and remove

```bash
docker stop learning-lab
docker rm learning-lab
```

- `stop` sends SIGTERM by default, waits, then SIGKILL after the timeout. Configure the correct signal and grace period for your app.
- `rm` deletes the stopped container and its writable layer.
- `rm -f` skips graceful stop.
- Named volumes are **not** removed by `docker rm`; use `docker volume rm` deliberately.
- The image remains after the container is removed.

## Restart policy vs process supervision

| Setting | Behavior |
|---|---|
| `no` | Never restart automatically (default) |
| `on-failure` | Restart after a non-zero exit, optionally with a max retry |
| `always` | Restart on exit and on daemon restart |
| `unless-stopped` | Restart unless the operator explicitly stopped it |

A restart policy does not fix a crash loop. It only repeats it. Use healthchecks, logs and a correct startup order.

## Healthchecks

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD [ "python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/version.json', timeout=2).read()" ]
```

The healthcheck answers “is the process able to serve?” It is not a readiness guarantee for every dependency, but it is better than checking only “container is running”. Inspect it with:

```bash
docker inspect --format '{{.State.Health.Status}}' learning-lab
```

## Environment and entrypoint

```dockerfile
ENTRYPOINT ["python3", "-m", "http.server"]
CMD ["8080"]
```

- `ENTRYPOINT` is the executable.
- `CMD` is the default argument list. `docker run image 9090` replaces `CMD`.
- `docker run --entrypoint sh image` replaces the entrypoint for debugging.
- Prefer exec-form (`["executable","arg"]`) over shell-form for correct signal handling.

## Common failure patterns

| Symptom | First check |
|---|---|
| Exits immediately | `docker logs`, exit code, command/entrypoint |
| Port not reachable | process bind address, `docker port`, host firewall |
| Permission denied | UID/GID, volume ownership, capabilities |
| Container keeps restarting | restart policy + failing command/dependency |
| Works, then loses data | state was written to writable layer instead of a volume |
| “No such container” after restart | it was removed or recreated by Compose or an orchestrator |

## Simulate it

- [Docker run: image to reachable container](#/sim/docker-run)
- [Docker operations: logs, exec and cleanup](#/sim/docker-ops)

Next: [Storage, networking and ports](#/learn/docker-04-storage-networking).
