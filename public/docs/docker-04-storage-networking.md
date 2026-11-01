# Storage, networking and ports

State and connectivity are the two places where container designs usually break. The rules are simple once the host/container boundary is clear.

## Storage choices

| Type | Syntax | Managed by | Use for |
|---|---|---|---|
| Named volume | `-v appdata:/var/lib/app` | Docker | Database and application state |
| Bind mount | `-v /srv/app:/var/lib/app` | You/host | Config, source in development, host integration |
| Anonymous volume | `-v /var/lib/app` | Docker, random name | Rarely useful; easy to lose track of |
| tmpfs | `--tmpfs /run` | Memory | Ephemeral writable paths, secrets, caches |
| Container layer | none | Container | Disposable writes only |

### Named volumes

```bash
docker volume create appdata
docker run -d --name app -v appdata:/var/lib/app app:1.1.0
docker volume inspect appdata
```

A named volume survives `docker rm`. It is still not a backup: use the application’s dump/backup tooling.

### Bind mounts

```bash
docker run --rm -v "$PWD/site:/usr/share/nginx/html:ro" nginx:alpine
```

A bind mount exposes a host path exactly as it is. On Linux, container UID/GID mapping determines permission problems. `:ro` prevents writes.

### tmpfs

```bash
docker run --read-only --tmpfs /tmp --tmpfs /run app:1.1.0
```

Good for hardening a read-only root filesystem. Data disappears with the container and is not persisted.

## Volume or bind? A decision guide

- **State that must survive and be managed by Docker:** named volume.
- **Development source code / config shipped from the host:** bind mount, usually read-only.
- **Machine-specific secret file:** prefer a secret mechanism or a tightly scoped read-only bind mount; never bake it into the image.
- **Caches:** tmpfs or volume depending on whether you want reuse.
- **Nothing important:** container layer is fine.

## Networking model

```text
host
 ├── published port 8003 ──▶ container:8080
 ├── bridge network (default)
 │    ├── app  (172.18.0.2)
 │    └── db   (172.18.0.3)   app resolves "db" by name
```

- The host talks to a container through a published port or through its own network.
- Containers on the same user-defined network talk to each other by **service/container DNS name** and the **container port**.
- The container port is not automatically visible on the host. `EXPOSE` documents it; `-p` publishes it.
- A process listening on `127.0.0.1` inside the container is not reachable from another container even if the port is published. It must bind `0.0.0.0` (or the container interface) to accept external traffic.

## Ports

```bash
docker run -d -p 8003:8080 app:1.1.0
docker port app
```

Mapping `8003:8080`:

- Host: `8003` (all interfaces unless you specify one).
- Container: `8080`.
- Safer: `-p 127.0.0.1:8003:8080` for local-only access.
- If `8003` is already in use, Docker fails to start the container.

A reverse proxy on the host or another container often terminates TLS and forwards to the app. In that case the app port should not be published publicly at all; only the proxy port should be.

## User-defined networks

```yaml
services:
  app:
    image: app:1.1.0
    networks: [backend]
  db:
    image: postgres:16-alpine
    networks: [backend]

networks:
  backend:
    driver: bridge
```

With Compose, the service name is the DNS name. `app` can connect to `db:5432`. You do not need to know container IPs.

Default bridge versus user-defined bridge:

- The default bridge has no automatic DNS between containers.
- A user-defined network provides service-name resolution and better isolation.

## Compose storage and networking

```yaml
services:
  app:
    image: ghcr.io/owner/app:1.1.0
    ports:
      - "127.0.0.1:8003:8080"
    volumes:
      - appdata:/var/lib/app
    networks: [edge, backend]

  db:
    image: postgres:16-alpine
    volumes:
      - dbdata:/var/lib/postgresql/data
    networks: [backend]

volumes:
  appdata:
  dbdata:

networks:
  edge:
  backend:
```

`docker compose down` keeps named volumes by default. `docker compose down -v` deletes them. Treat `-v` as a data-loss command.

## Host versus container point of view

| Question | Host answer | Container answer |
|---|---|---|
| Where is the app? | `127.0.0.1:8003` (published) | `app:8080` (service name) |
| Where is the database? | not necessarily published | `db:5432` |
| Who can connect? | host firewall + bind address | network membership + app bind address |
| Where is data? | volume mount path | mounted path inside container |

## Security checklist

- Publish only the ports that must be reachable.
- Bind to loopback where possible.
- Use a user-defined network and service DNS rather than host networking.
- Do not mount the Docker socket unless the container is trusted at host level.
- Keep secrets out of images and Compose files.
- Back up named volumes with database-aware tools.
- Use `:ro` for bind-mounted configuration that the container should not modify.

## Simulate it

- [Docker run: ports, bridge and volume](#/sim/docker-run)
- [Compose: network, volume and services](#/sim/docker-compose)

Next: [Docker Compose, line by line](#/learn/docker-05-compose).
