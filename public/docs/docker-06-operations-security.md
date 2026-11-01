# Operations, debugging, cleanup and hardening

A running container is not the same as a healthy service. This chapter is the operational loop: observe first, change deliberately, and clean up without deleting state.

## Diagnose in order

```text
state → logs → exec → inspect → resources → events → cleanup
```

### 1. State

```bash
docker ps -a
docker compose ps
```

Check status, exit code, restart count, health and ports. A restart loop is a symptom, not a diagnosis.

### 2. Logs

```bash
docker logs --tail 100 --timestamps learning-lab
docker compose logs -f learning-lab
```

Only stdout/stderr is captured. If the app writes to a file inside the container, configure it to log to stdout/stderr or collect that file explicitly.

### 3. Exec

```bash
docker exec -it learning-lab sh
# inside:
id
env
getent hosts db
curl -fsS localhost:8080/version.json
```

Use exec for observation. Changes to the writable layer are discarded when the container is recreated. If the image has no shell, use a debug container.

### 4. Inspect

```bash
docker inspect learning-lab
docker inspect --format '{{.State.Health.Status}}' learning-lab
docker inspect --format '{{.Image}}' learning-lab
docker inspect --format '{{json .Mounts}}' learning-lab
```

`inspect` is the source of truth for image digest, mounts, networks, environment, restart count and health. Compare the running digest with the registry digest.

### 5. Resources

```bash
docker stats --no-stream
docker system df -v
```

Look for memory near the limit, CPU saturation, block I/O and disk pressure. A container OOM-killed at its memory limit may show only a restart.

### 6. Events

```bash
docker events --filter container=learning-lab
```

Shows create/start/die/health/network events. Useful when an updater or orchestrator recreates containers unexpectedly.

## Cleanup

```bash
docker image prune          # dangling images only
docker builder prune        # unused build cache
docker system df -v         # inspect before deleting
docker system prune         # stopped containers, unused networks, dangling images
docker system prune --volumes   # also unused volumes: data-loss risk
```

Rules:

- Volumes are data, not cache. Do not include them in a reflex prune.
- `-a` broadens the target set; read the confirmation and know what it removes.
- Removing an image does not delete volumes.
- Removing a container deletes its writable layer but not named volumes.
- Prune is not a backup strategy.

## Logging and daemon configuration

Docker daemon settings usually live in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
```

- `log-opts` prevents unbounded container logs from filling the host disk.
- `live-restore` can keep containers running during daemon restarts (with limitations).
- Storage driver, data-root and default address pools affect capacity and networking.
- Validate with `dockerd --validate --config-file /etc/docker/daemon.json`; restart the daemon deliberately.

A production host often ships logs to a central system instead of relying on local JSON files.

## Runtime hardening

| Control | How | Why |
|---|---|---|
| Non-root user | `USER app` in image / `user:` in Compose | Limits process privilege |
| Read-only root | `--read-only` / `read_only: true` | Prevents image-layer writes |
| Drop capabilities | `--cap-drop ALL`, add only needed | Reduces kernel attack surface |
| No privilege escalation | `no-new-privileges` | Blocks setuid escalation |
| Resource limits | memory, CPU, PIDs | Contains runaway processes |
| Narrow mounts | specific paths, `:ro` | Limits host exposure |
| TLS/registry auth | scoped tokens | Protects image supply chain |
| Secrets | runtime injection/secret manager | Keeps secrets out of layers and logs |

Do not use `--privileged` to fix permission errors. Do not mount `/var/run/docker.sock` into an application container; it is host-level control.

## Image supply chain

- Pull from a trusted registry and pin digests.
- Scan images in CI; treat critical findings as a gate.
- Sign images and verify signatures before deployment where supported.
- Keep build secrets out of build args and layers.
- Record the digest you deployed.
- Keep old images for rollback, then prune deliberately.

## Health and availability

- Use a healthcheck that exercises the actual service path.
- Verify `/version.json` after every deployment.
- Alert on restart loops, unhealthy status, OOM kills, disk pressure and certificate expiry.
- Test rollback to the previous digest.
- Use a restart policy plus monitoring; one does not replace the other.

## Incident checklist

1. Capture `docker ps -a`, logs, inspect output and events before changing anything.
2. Confirm the running image digest and version stamp.
3. Check resource limits, disk and OOM events.
4. Check network/port/DNS from inside and outside.
5. Fix forward with a new image or roll back to a known digest.
6. Record what changed and add a regression check.
7. Clean up only objects you have classified as disposable.

## Simulate it

- [Docker operations: logs, exec, inspect and prune](#/sim/docker-ops)
- [Docker security: root, capabilities and limits](#/sim/docker-security)

Next: [GHCR and the update loop](#/learn/docker-07-ghcr-and-updates).
