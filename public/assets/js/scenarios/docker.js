import { add, del, ITEM, cfg } from './helpers.js';

export const dockerRun = {
  id: 'docker-run',
  title: 'Docker run — from image to a reachable container',
  topic: 'docker',
  layout: 'docker',
  category: 'docker-run',
  level: 'core',
  minutes: 9,
  tags: ['docker run', 'image', 'container', 'port', 'volume', 'logs', 'exec', 'lifecycle'],
  summary:
    'A developer starts a container with one command. Watch the CLI ask the Docker Engine to pull an image, create a container, attach storage and networking, then inspect it — and finally stop and remove it without deleting the data.',
  nodes: ['developer', 'daemon', 'registry', 'container', 'network', 'volume', 'deployment'],
  stores: ['local', 'docker', 'registry', 'container', 'volume', 'network'],
  nodeLabels: {
    developer: { name: 'Developer shell', sub: 'docker CLI' },
    daemon: { name: 'Docker Engine', sub: 'local Linux daemon' },
  },
  steps: [
    {
      from: 'developer', to: 'daemon', badge: 'docker run -d -p 8003:8080',
      detail:
        '`docker run` is a client command. The CLI reads your current context, sends an API request to the Docker Engine, and the Engine does the work.\n\nThe `-d` means detached: start the process in the background. `-p 8003:8080` maps host port 8003 to container port 8080. The container port must be the port the process actually listens on inside the container.',
      channel: 'cli',
      http: {
        req: `$ docker run -d \\\n    --name learning-lab \\\n    -p 8003:8080 \\\n    ghcr.io/rogerbergling/learning:latest`,
        res: `Unable to find image locally\ndocker: pulling from ghcr.io/rogerbergling/learning...\n<container id>`,
      },
      tags: ['CLI → daemon', 'published port', 'detached'],
    },
    {
      from: 'daemon', to: 'registry', badge: 'pull layers', channel: 'registry',
      detail:
        'The Engine checks its local image store. If the tag is missing, it authenticates to GHCR if needed and pulls the manifest and layers. A **tag** is a human pointer; the registry also returns a content-addressed **digest**.\n\nIf the package is private, the pull may use credentials from `docker login ghcr.io`. That is a separate permission from GitHub repository access.',
      http: {
        req: `GET /v2/rogerbergling/learning/manifests/latest\nAuthorization: Bearer <registry token>\nAccept: application/vnd.oci.image.index.v1+json`,
        res: `HTTP/1.1 200 OK\nDocker-Content-Digest: sha256:…\nContent-Type: application/vnd.oci.image.index.v1+json`,
      },
      vault: [add('registry', ITEM.image({ id: 'img', name: 'GHCR image :latest', meta: 'tag → digest' }))],
      tags: ['registry', 'manifest', 'digest'],
    },
    {
      from: 'registry', to: 'daemon', badge: 'layers stored locally', channel: 'registry',
      detail:
        'The image is stored as a set of immutable layers plus metadata. Layers are shared between images, which is why a second pull is usually much faster.\n\nThe Engine now has an image it can create a container from. “Image” and “container” are not the same thing: the image is the recipe; the container is a running instance.',
      vault: [
        add('docker', ITEM.image({ id: 'img', name: 'Local image', meta: 'same digest as the registry' })),
        add('docker', ITEM.layer({ id: 'layer1', name: 'Base layer', meta: 'read-only filesystem diff' })),
      ],
      tags: ['layers', 'local image store'],
    },
    {
      from: 'daemon', to: 'container', badge: 'create + start', channel: 'engine',
      detail:
        'The Engine creates a writable container layer on top of the image and starts the configured entrypoint. The container gets its own process namespace, filesystem view, network namespace and resource limits.\n\n`docker run` is really `create` followed by `start`; that distinction matters when you debug a container that exits immediately.',
      vault: [add('container', ITEM.container({ id: 'app', name: 'learning-lab', meta: 'running · detached' }))],
      tags: ['create', 'start', 'isolated process'],
    },
    {
      from: 'container', to: 'network', badge: 'bridge network', channel: 'network',
      detail:
        'By default the container is attached to a bridge network. Docker assigns an internal IP and, for user-defined networks, a DNS name. The published host port is a forwarding rule, not the process listening directly on the host.\n\nInside the container the application still listens on `8080`; the host sees `8003`. Keep those two numbers separate in your head.',
      vault: [add('network', ITEM.network({ id: 'bridge', name: 'Bridge network', meta: '8003 → 8080' }))],
      tags: ['port mapping', 'bridge', 'DNS'],
    },
    {
      from: 'container', to: 'volume', badge: 'mount data', channel: 'network',
      detail:
        'A named volume is the right place for data that must survive a container replacement. The container filesystem is disposable; volumes and bind mounts are how you separate state from the process.\n\nUse a bind mount when you deliberately want a host path visible in the container. Use a named volume for database and application state that Docker should manage.',
      vault: [add('volume', ITEM.volume({ id: 'data', name: 'learning-lab data', meta: 'survives docker rm' }))],
      tags: ['volume', 'persistence', 'state'],
    },
    {
      from: 'developer', to: 'container', badge: 'docker logs -f', channel: 'cli',
      detail:
        '`docker logs` reads the process stdout/stderr captured by the Engine. It does not read the host system log. If the application writes to its own log file inside the container instead of stdout, `docker logs` may look empty.\n\nFollow logs while reproducing a problem; then use `--tail` and timestamps so you can correlate with the reverse proxy or browser.',
      http: {
        req: 'docker logs --tail 100 -f learning-lab',
        res: `2026-11-01T09:00:01Z listening on :8080\n2026-11-01T09:00:02Z ready`,
      },
      tags: ['stdout', 'logs', 'debug'],
    },
    {
      from: 'developer', to: 'container', badge: 'docker exec -it … sh', channel: 'engine',
      detail:
        '`docker exec` starts another process inside an already-running container. It is for inspection and short-lived debugging, not for installing a permanent fix; a rebuilt container will lose changes to its writable layer.\n\nIf the image has no shell (common in distroless/minimal images), use `docker debug`, an ephemeral debug container or copy out the files you need.',
      tags: ['exec', 'inspect', 'ephemeral'],
    },
    {
      from: 'developer', to: 'daemon', badge: 'stop + rm', channel: 'cli',
      detail:
        'Stopping sends a signal and gives the process time to exit. Removing the container deletes its writable layer and network attachment, but keeps the image and named volumes.\n\nUse `docker rm -f` only when you deliberately want to skip the graceful stop. It is not a normal deployment step.',
      vault: [del('container', 'app')],
      tags: ['stop', 'remove', 'volume survives'],
    },
    {
      from: 'daemon', to: 'volume', badge: 'data still there', channel: 'network',
      detail:
        'The container is gone; the named volume remains. Starting a new container with the same volume reconnects the state.\n\nThis is the mental model to keep: replace the process, keep the data. A volume is not a backup — back up the data inside it with the database’s own tools.',
      tags: ['persistence', 'replacement', 'backup'],
    },
  ],
  notes: [
    'The CLI is not the engine. `docker context ls` tells you which Engine you are talking to; this matters on laptops, remote Docker hosts and CI runners.',
    'A published port is not an authentication control. If the container listens on `0.0.0.0:8003`, the host firewall and network decide who can reach it.',
    'Use `docker inspect` for the real container state; `docker ps` only shows running containers by default.',
    'Never put secrets in `docker run -e` in a shared shell history. Use an env file with tight permissions, a secret manager or Docker secrets where appropriate.',
  ],
  config: [
    cfg('Container launch — what each flag means', [
      '`-d`: detached mode; the container runs in the background and the CLI returns.',
      '`--name learning-lab`: a stable local name, useful for logs/exec/inspect. Names must be unique among containers.',
      '`-p 8003:8080`: publish host port 8003 to container port 8080. Bind to `127.0.0.1` explicitly when the service should stay local.',
      '`ghcr.io/rogerbergling/learning:latest`: an image reference. `latest` is a moving tag; pin a version or digest for repeatability.',
      'Use `-v name:/path` for a named volume and `--mount type=bind,...` for an explicit bind mount.',
    ]),
    cfg('Useful lifecycle commands', [
      '`docker ps -a` shows running and stopped containers. `docker ps` shows only running ones.',
      '`docker inspect <name>` shows mounts, network settings, image digest, health, restart count and environment.',
      '`docker stop` sends SIGTERM, waits, then SIGKILL after the timeout. `docker rm` deletes the container layer.',
      '`docker image ls --digests` shows the local image digest. `docker image prune` removes dangling images only.',
    ]),
  ],
  pitfalls: [
    'Publishing host port 8003 but the application listening on 8080 inside the container, then blaming Docker.',
    'Binding a database or admin port to `0.0.0.0` on a laptop with an untrusted network.',
    'Using `latest` for production and assuming the host runs the same bits you tested.',
    'Storing state only in the container writable layer, then losing it on `docker rm`.',
    'Assuming `docker logs` sees application log files written inside the container. Send logs to stdout/stderr instead.',
  ],
  productionChecks: [
    'Pin the image by version tag plus digest (or a signed digest) and record what was deployed.',
    'Set memory/CPU limits, a restart policy, a healthcheck and a non-root user.',
    'Publish only the ports that must be reachable; bind to localhost or a private interface where possible.',
    'Verify `/version.json` and the container health after every replacement.',
  ],
};

export const dockerBuild = {
  id: 'docker-build',
  title: 'Docker build — Dockerfile, context, layers and cache',
  topic: 'docker',
  layout: 'docker',
  category: 'docker-build',
  level: 'core',
  minutes: 11,
  tags: ['Dockerfile', 'build context', '.dockerignore', 'layers', 'cache', 'multi-stage', 'GHCR'],
  summary:
    'A Dockerfile is a recipe, but the build context and layer cache decide what actually gets sent and rebuilt. Build an image, invalidate a layer, see why .dockerignore matters, then push the result to GHCR.',
  nodes: ['developer', 'project', 'daemon', 'registry', 'deployment', 'container'],
  stores: ['local', 'docker', 'registry', 'deployment'],
  nodeLabels: {
    project: { name: 'Build context', sub: 'Dockerfile · source · .dockerignore' },
    daemon: { name: 'BuildKit engine', sub: 'build · cache · export' },
  },
  steps: [
    {
      from: 'developer', to: 'project', badge: 'edit Dockerfile', channel: 'cli',
      detail:
        'A Dockerfile is an ordered build recipe. `FROM` chooses a base image, `WORKDIR` sets the working directory, `COPY` brings files from the build context, `RUN` executes build steps, and `CMD`/`ENTRYPOINT` define the default process.\n\nThe build context is everything sent to the Engine, not just the files referenced by `COPY`. `.dockerignore` controls what is excluded.',
      vault: [add('local', ITEM.dockerfile({ id: 'dockerfile', name: 'Dockerfile', meta: 'FROM · WORKDIR · COPY · RUN · CMD' }))],
      tags: ['Dockerfile', 'instructions', 'build context'],
    },
    {
      from: 'project', to: 'daemon', badge: 'docker build -t app:1.1.0 .', channel: 'engine',
      detail:
        'The trailing `.` is the build context. Sending a huge context (including `node_modules`, `.git` or local secrets) makes every build slower and can leak files into layers.\n\nBuildKit reads the Dockerfile, resolves the base image and starts executing instructions in order. The first changed instruction invalidates that layer and every later layer.',
      http: {
        req: `$ docker build -t ghcr.io/rogerbergling/learning:1.1.0 .\n# context sent to the daemon/BuildKit`,
        res: `[+] Building 4.2s (8/8) FINISHED\n => [1/4] FROM docker.io/library/python:3.12-alpine\n => [2/4] COPY public ./public\n => exporting to image`,
      },
      tags: ['build context', 'BuildKit', 'tag'],
    },
    {
      from: 'daemon', to: 'daemon', badge: 'layers + cache', channel: 'internal',
      detail:
        'Each instruction produces a content-addressed layer or metadata. Layers are cached by their inputs: base image, instruction text, copied files and build args. Changing a source file after `COPY . .` invalidates that layer and everything after it.\n\nOrder instructions from least to most frequently changed. Copy dependency manifests and install dependencies before copying the rest of the source.',
      vault: [
        add('docker', ITEM.layer({ id: 'base', name: 'Base layer', meta: 'python:3.12-alpine' })),
        add('docker', ITEM.layer({ id: 'app', name: 'Application layer', meta: 'COPY public' })),
        add('docker', ITEM.image({ id: 'img', name: 'Built image', meta: 'tag app:1.1.0' })),
      ],
      tags: ['layer cache', 'instruction order', 'content-addressed'],
    },
    {
      from: 'daemon', to: 'project', badge: '.dockerignore check', channel: 'engine',
      detail:
        '`.dockerignore` is a security and performance boundary. It should exclude `.git`, `.env`, keys, credentials, `node_modules`, build output and local caches.\n\nIt is not the same as `.gitignore`. A file can be intentionally tracked in Git but still excluded from the image build context.',
      tags: ['.dockerignore', 'secrets', 'context size'],
    },
    {
      from: 'daemon', to: 'registry', badge: 'push app:1.1.0', channel: 'registry',
      detail:
        'Pushing uploads the image manifest and missing layers. The registry stores them by digest; the tag `1.1.0` is a mutable pointer to that manifest.\n\nThe workflow must authenticate with a token that has `write:packages` for GHCR. The image name must match the repository/package you are allowed to publish to.',
      http: {
        req: `POST /v2/rogerbergling/learning/blobs/uploads/\nAuthorization: Bearer <write:packages token>`,
        res: `HTTP/1.1 201 Created\nDocker-Content-Digest: sha256:…\nLocation: /v2/.../blobs/...`,
      },
      vault: [add('registry', ITEM.image({ id: 'img', name: 'Published image', meta: 'tag 1.1.0 · digest recorded' }))],
      tags: ['push', 'tag', 'digest', 'GHCR'],
    },
    {
      from: 'registry', to: 'deployment', badge: 'pull on another host', channel: 'registry',
      detail:
        'The deployment host pulls the tag or, better, the digest. A tag can move between builds; a digest identifies exact content. If you compare the local tag and the running digest, you can prove the host is running the build you tested.\n\nThe server may need `docker login ghcr.io` if the package is private, and the package must be visible to that identity.',
      vault: [add('deployment', ITEM.image({ id: 'img', name: 'Deployed image', meta: 'same digest as registry' }))],
      tags: ['pull', 'digest', 'deployment'],
    },
    {
      from: 'deployment', to: 'container', badge: 'run the new image', channel: 'engine',
      detail:
        'A new container is created from the new image. If you reuse a container name, remove the old container first or let Compose recreate it.\n\nRecord the image digest and the version endpoint after startup. “It is running” is not proof that it is the intended build.',
      vault: [add('container', ITEM.container({ id: 'app', name: 'learning-lab', meta: 'new image digest' }))],
      tags: ['deploy', 'recreate', 'verification'],
    },
    {
      from: 'deployment', to: 'developer', badge: 'GET /version.json', channel: 'deploy',
      detail:
        'The version stamp closes the loop: it carries the package version, image tag, Git commit and build time baked into the image. Compare it with the digest/tag you intended to deploy.\n\nIf the values did not change, the old container is still running or the server did not pull the new image.',
      http: {
        req: 'GET /version.json HTTP/1.1\nHost: learning.example.com',
        res: `HTTP/1.1 200 OK\n\n{"version":"1.1.0","imageTag":"1.1.0","commit":"c4d8cf5","buildDate":"2026-11-01T08:00:00Z"}`,
      },
      tags: ['version stamp', 'prove the update', 'digest'],
    },
  ],
  notes: [
    'Build context is not the same as the working directory from which you run the command. The last argument to `docker build` selects it.',
    'Build args are visible in image history; do not use them for secrets. Use BuildKit secret mounts or runtime secret injection instead.',
    'A multi-stage build keeps compilers and build dependencies out of the final image. Smaller images mean fewer vulnerabilities and faster pulls.',
    'A cached layer is not a guarantee of reproducibility. Pin base images and dependencies when you need repeatable builds.',
  ],
  config: [
    cfg('Dockerfile reading order', [
      '`FROM`: pin a digest for production; use a minimal base image.',
      '`WORKDIR`, `COPY`, `RUN`: dependencies before source so the dependency layer stays cached.',
      '`USER`: switch to a non-root user before the final `CMD` where possible.',
      '`EXPOSE`: documentation only; it does not publish a host port.',
      '`ENTRYPOINT` vs `CMD`: entrypoint is the executable; CMD supplies default arguments and can be overridden.',
    ]),
    cfg('.dockerignore checklist', [
      '`.git`, `.github`, `.env`, `.env.*` and private keys.',
      '`node_modules`, `.venv`, `__pycache__`, build output, coverage and logs.',
      '`Dockerfile`, `docker-compose*.yml` if they should not be copied into the runtime image.',
      'Never rely on `.gitignore` to protect the build context; it is a separate file.',
    ]),
    cfg('GHCR push commands', [
      '`docker login ghcr.io` with a token that has `write:packages` for the target package.',
      '`docker tag local-image ghcr.io/OWNER/IMAGE:1.1.0`.',
      '`docker push ghcr.io/OWNER/IMAGE:1.1.0` and record the digest from the output.',
      'Prefer immutable version tags plus the digest over a production `latest` tag.',
    ]),
  ],
  pitfalls: [
    'A huge build context because `.dockerignore` is missing or incomplete.',
    'Copying source before installing dependencies, so every source edit invalidates the dependency cache.',
    'Putting secrets in `ARG` or `ENV`; they remain in image history or metadata.',
    'Using `latest` in production and being unable to reproduce the tested build.',
    'Publishing a package with the wrong repository link or insufficient `write:packages` permission.',
  ],
  productionChecks: [
    'Pin base images and runtime dependencies; scan the final image.',
    'Build with a minimal context and a multi-stage Dockerfile.',
    'Publish an immutable version tag and record the digest.',
    'Verify `/version.json` and the image digest on the deployment host.',
  ],
};

export const dockerCompose = {
  id: 'docker-compose',
  title: 'Docker Compose — services, network, volume and resources',
  topic: 'docker',
  layout: 'docker',
  category: 'compose',
  level: 'core',
  minutes: 12,
  tags: ['compose.yaml', 'services', 'ports', 'volumes', 'networks', 'pull', 'recreate', 'security'],
  summary:
    'Read one real compose.yaml file line by line. See how Compose creates services, a shared network, a named volume and resource limits, then update explicitly without mounting the Docker socket.',
  nodes: ['developer', 'project', 'daemon', 'container', 'network', 'volume', 'deployment'],
  stores: ['local', 'docker', 'container', 'network', 'volume', 'deployment'],
  nodeLabels: {
    project: { name: 'compose.yaml', sub: 'declarative desired state' },
    daemon: { name: 'Docker Compose', sub: 'project · network · services' },
  },
  steps: [
    {
      from: 'developer', to: 'project', badge: 'edit compose.yaml', channel: 'cli',
      detail:
        'Compose is a declarative description. You do not tell Docker each individual create/start command; you describe services, networks and volumes, then Compose reconciles the project.\n\n`name:` at the top sets the project name. It prefixes resources such as `learning-lab_default` and groups containers in `docker compose ls`.',
      vault: [add('local', ITEM.compose({
        id: 'compose',
        name: 'compose.yaml',
        meta: 'services · network · volume · profiles',
        value: `name: learning-lab

services:
  learning-lab:
    image: ghcr.io/rogerbergling/learning:latest
    container_name: learning-lab
    mem_limit: 100m
    mem_reservation: 32m
    memswap_limit: 100m
    ports:
      - "8003:8080"
    restart: unless-stopped
    pull_policy: always
`,
      }))],
      tags: ['compose project', 'declarative', 'name'],
    },
    {
      from: 'project', to: 'daemon', badge: 'docker compose up -d', channel: 'cli',
      detail:
        'Compose parses the file, checks the project name and creates the missing network, volume, containers and image if necessary. `-d` means detached.\n\nIf `image:` is present, Compose uses that image. If `build:` is present, it builds first. `pull_policy: always` asks Compose to pull before starting; it does not make an already-running container change image by itself.',
      http: {
        req: `$ docker compose up -d\n[+] Running 3/3\n ✔ Network learning-lab_default  Created\n ✔ Container learning-lab        Started`,
      },
      tags: ['up', 'detached', 'reconcile'],
    },
    {
      from: 'daemon', to: 'network', badge: 'create project network', channel: 'network',
      detail:
        'Compose creates a project-scoped network by default. Every service joins it and can reach every other service by service name. `app` can resolve `db` without hard-coded IP addresses.\n\nThe network is internal to the Docker host; publishing a port is a separate explicit decision.',
      vault: [add('network', ITEM.network({ id: 'default', name: 'learning-lab_default', meta: 'bridge · service DNS' }))],
      tags: ['project network', 'DNS', 'isolation'],
    },
    {
      from: 'daemon', to: 'container', badge: 'create learning-lab', channel: 'engine',
      detail:
        'The main service maps the host port `8003` to container port `8080`. Its memory limits (`mem_limit`, `mem_reservation`, `memswap_limit`) enforce a hard ceiling and a soft reservation; setting swap equal to memory prevents swapping.\n\n`container_name` is optional. It makes the name predictable, but it also prevents scaling that service to multiple replicas.',
      vault: [
        add('container', ITEM.container({
          id: 'app',
          name: 'learning-lab',
          meta: '8003→8080 · 100m · no swap',
          value: 'container learning-lab',
        })),
        add('volume', ITEM.volume({ id: 'data', name: 'learning-lab data', meta: 'only if declared' })),
      ],
      tags: ['ports', 'memory limits', 'container_name'],
    },
    {
      from: 'developer', to: 'registry', badge: 'docker compose pull', channel: 'registry',
      detail:
        'The update is explicit: `docker compose pull` asks the registry for the manifest and layers referenced by the image tag. It does not replace the running container yet.\n\nThis project deliberately does not mount the Docker socket into an updater. Socket access is root-equivalent on the Docker host; a controlled pull is safer and auditable.',
      vault: [add('deployment', ITEM.image({ id: 'pulled', name: 'Pulled image', meta: 'new tag/digest · not running yet' }))],
      tags: ['pull', 'registry', 'no Docker socket'],
    },
    {
      from: 'registry', to: 'daemon', badge: 'new digest stored locally', channel: 'registry',
      detail:
        'The Engine stores the new image content by digest. The old container is still running the old digest until it is recreated.\n\nRecord the registry digest and compare it with `docker inspect` after recreation. A tag is a moving pointer; the digest is the evidence.',
      tags: ['digest', 'local image', 'verification'],
    },
    {
      from: 'daemon', to: 'container', badge: 'up -d --force-recreate', channel: 'deploy',
      detail:
        '`docker compose up -d --force-recreate` replaces the container from the new image. Named volumes and the network are preserved, but the old writable layer is discarded.\n\nAfter recreation, verify `/version.json`, health status, logs and the running image digest. “Running” is not proof that the intended build is live.',
      tags: ['recreate', 'volumes', 'version stamp'],
    },
    {
      from: 'developer', to: 'daemon', badge: 'docker compose ps / logs', channel: 'cli',
      detail:
        '`docker compose ps` shows the project containers and their state. `docker compose logs -f` follows service logs. `docker compose config` prints the fully resolved file, including defaults and environment interpolation.\n\nUse Compose commands from the directory containing `compose.yaml`, or pass `-f` explicitly so you do not operate on a different project.',
      tags: ['ps', 'logs', 'config', 'project directory'],
    },
    {
      from: 'developer', to: 'project', badge: 'compose down', channel: 'cli',
      detail:
        '`docker compose down` stops and removes the project containers and network. It keeps named volumes unless you add `-v`.\n\n`down -v` deletes the named volumes too. That is destructive; treat it as a data-loss command, not routine cleanup.',
      vault: [del('container', 'app'), del('network', 'default')],
      tags: ['down', 'volumes', 'destructive'],
    },
  ],
  notes: [
    '`compose.yaml` is the modern filename; `docker-compose.yml` is common in older projects. The v2 CLI uses `docker compose` (space), not the legacy `docker-compose` binary.',
    'Environment variable interpolation happens before the file reaches Docker. Precedence is shell environment, `.env`, then the file default; use `docker compose config` to see the result.',
    '`depends_on` controls start order, not application readiness. Use a healthcheck plus a dependency condition when the app truly needs the database ready.',
    'Watchtower with the Docker socket is a high-privilege design. For enterprise deployments, prefer CI-driven pull/recreate or a managed platform.',
    'Resource limits are per container, not per Compose project. Set them deliberately and monitor OOM kills.',
  ],
  config: [
    cfg('The provided compose.yaml, line by line', [
      '`name: learning-lab` — Compose project name; prefixes networks and volumes.',
      '`services:` — the containers and their configuration.',
      '`image: ghcr.io/rogerbergling/learning:latest` — run this published image. A digest is safer than `latest`.',
      '`container_name: learning-lab` — predictable container name; blocks scaling this service.',
      '`mem_limit: 100m` — hard memory ceiling; the container is OOM-killed if it exceeds it.',
      '`mem_reservation: 32m` — soft reservation for scheduling; not a guarantee of free memory on a busy host.',
      '`memswap_limit: 100m` — same as memory means no swap; choose deliberately for latency-sensitive services.',
      '`ports: "8003:8080"` — host port 8003 to container port 8080. Bind `127.0.0.1:8003:8080` for local-only access.',
      '`restart: unless-stopped` — restart on crash and boot, except when an operator deliberately stopped it.',
      '`pull_policy: always` — pull before starting; use a pinned tag/digest for reproducible deployments.',
      '`labels` — Watchtower discovery and scope; these labels have no meaning to Docker itself.',
      '`profiles: ["auto-update"]` — Watchtower starts only when the profile is enabled.',
      '`volumes: /var/run/docker.sock` — control of the Docker daemon; treat as root-equivalent.',
      '`command: --interval 3600 --label-enable --scope learning --cleanup` — poll hourly, only labeled containers in this scope, clean old images.',
    ]),
    cfg('Commands you will use', [
      '`docker compose config` — validate and print the resolved file.',
      '`docker compose up -d` — create/start the default profile.',
      '`docker compose --profile auto-update up -d` — include Watchtower.',
      '`docker compose ps` / `logs -f` / `exec app sh` — inspect runtime state.',
      '`docker compose down` — stop/remove containers and network, keep named volumes.',
      '`docker compose down -v` — also delete named volumes; destructive.',
    ]),
  ],
  pitfalls: [
    'Using `depends_on` as if it guarantees the database is ready.',
    'Publishing ports on all interfaces and exposing a local service to the LAN.',
    'Setting `memswap_limit` below `mem_limit`, which confuses the memory/swap behavior.',
    'Running `docker compose down -v` and deleting the database volume.',
    'Mounting the Docker socket into Watchtower on a host where you would not give that process root.',
    'Thinking `pull_policy: always` updates a running container without recreating it.',
  ],
  productionChecks: [
    'Pin the image by digest and verify the running digest/version stamp.',
    'Keep state in named volumes or external managed storage; back it up.',
    'Set memory/CPU limits and a healthcheck.',
    'Run Watchtower only if you accept its host-level privilege; prefer controlled deployment.',
  ],
};

export const dockerOps = {
  id: 'docker-ops',
  title: 'Docker operations — logs, exec, stats and cleanup',
  topic: 'docker',
  layout: 'docker',
  category: 'docker-run',
  level: 'advanced',
  minutes: 10,
  tags: ['docker logs', 'docker exec', 'docker inspect', 'stats', 'events', 'prune', 'disk'],
  summary:
    'A container is running but something is wrong. Use the operation tools in the right order: state, logs, process, inspect, resources, events, then cleanup — without deleting evidence or data by accident.',
  nodes: ['developer', 'daemon', 'container', 'volume', 'network'],
  stores: ['local', 'docker', 'container', 'volume', 'network'],
  initial: {
    docker: [ITEM.image({ id: 'old', name: 'Old image', meta: 'dangling · safe to prune' })],
    container: [ITEM.container({ id: 'app', name: 'learning-lab', meta: 'running · unhealthy' })],
  },
  steps: [
    {
      from: 'developer', to: 'daemon', badge: 'docker ps -a', channel: 'cli',
      detail:
        'Start with state, not guesses. `docker ps` shows running containers; `docker ps -a` also shows exited ones. Check status, exit code, ports and names.\n\nA container that restarts in a loop is usually failing immediately at startup; look at logs and the exit code before changing anything.',
      http: {
        req: 'docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
        res: `NAMES          STATUS                     PORTS\nlearning-lab   Up 2 minutes (unhealthy)   0.0.0.0:8003->8080/tcp`,
      },
      tags: ['state', 'exit code', 'ports'],
    },
    {
      from: 'daemon', to: 'container', badge: 'docker logs --tail 100', channel: 'engine',
      detail:
        'Logs are the first diagnostic for application failures. `--tail` limits output; `--timestamps` correlates with proxy/browser errors. `-f` follows live.\n\nRemember that only stdout/stderr is captured. A process writing to a file inside the container will not appear here unless the app also logs to stdout.',
      http: {
        req: 'docker logs --tail 100 --timestamps learning-lab',
        res: `2026-11-01T09:00:01.123Z starting\n2026-11-01T09:00:02.456Z ERROR database connection refused`,
      },
      tags: ['stdout', 'logs', 'first failure'],
    },
    {
      from: 'developer', to: 'container', badge: 'docker exec -it sh', channel: 'engine',
      detail:
        'Exec into the running container to inspect its view of the filesystem, environment, DNS and process list. This is observation, not a fix: changes to the writable layer disappear when the container is recreated.\n\nCheck `env`, `ls`, `ps`, `curl`/`wget` and `getent hosts` from inside. If the image has no shell, use an ephemeral debug container instead.',
      tags: ['exec', 'inside view', 'DNS', 'process'],
    },
    {
      from: 'developer', to: 'daemon', badge: 'docker inspect', channel: 'cli',
      detail:
        '`docker inspect` is the source of truth for mounts, image digest, network addresses, health state, restart count, environment and resource limits. Use `--format` or pipe to `jq` for readable output.\n\nCompare the running image digest with the registry digest; that is how you prove the deployed build.',
      http: {
        req: 'docker inspect learning-lab --format "{{.State.Health.Status}} {{.Image}}"',
        res: 'unhealthy sha256:…',
      },
      tags: ['inspect', 'digest', 'health', 'mounts'],
    },
    {
      from: 'daemon', to: 'container', badge: 'docker stats --no-stream', channel: 'engine',
      detail:
        '`docker stats` shows live CPU, memory, network and block I/O. Use `--no-stream` for a snapshot. A high memory value near the limit explains OOM kills; a CPU spike may be normal startup.\n\nUse the host’s monitoring for long-term trends; Docker stats is a quick live view.',
      tags: ['cpu', 'memory', 'oom', 'limits'],
    },
    {
      from: 'daemon', to: 'container', badge: 'docker events', channel: 'engine',
      detail:
        '`docker events` streams Engine events: create, start, die, health status changes, network connect/disconnect. Filter by container and time window to see what happened around an incident.\n\nIt is read-only and very useful when a container is being recreated by Watchtower or an orchestrator.',
      tags: ['events', 'timeline', 'watchtower'],
    },
    {
      from: 'developer', to: 'daemon', badge: 'docker system df', channel: 'cli',
      detail:
        'Before pruning, understand what is using space: images, containers, volumes and build cache are separate categories. `docker system df -v` shows detail.\n\nVolumes are data. Do not include them in a broad prune unless you have verified they are disposable.',
      http: {
        req: 'docker system df',
        res: `TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE\nImages          12        4         2.1GB     1.4GB\nContainers      5         1         120MB     90MB\nVolumes         3         1         400MB     0B`,
      },
      tags: ['disk', 'prune', 'volumes'],
    },
    {
      from: 'daemon', to: 'daemon', badge: 'prune unused objects', channel: 'internal',
      detail:
        '`docker image prune` removes dangling images. `docker system prune` removes stopped containers, unused networks and dangling images; add `--volumes` only when you truly want to delete unused volumes.\n\nBuild cache can be large; `docker builder prune` is often the safest first cleanup. Read the command output and use `-a` deliberately.',
      vault: [del('docker', 'old')],
      tags: ['prune', 'disk', 'safe order'],
    },
    {
      from: 'container', to: 'network', badge: 'connectivity check', channel: 'network',
      detail:
        'When the app is running but unreachable, test each boundary: inside the container, from another container on the same network, from the host to the published port, then through the proxy/firewall.\n\n`getent hosts db`, `curl localhost:8080`, `docker port` and `ss -ltnp` on the host distinguish DNS, bind address and firewall problems.',
      tags: ['network', 'ports', 'firewall', 'DNS'],
    },
  ],
  notes: [
    'Diagnose in order: state → logs → exec → inspect → resources → events → cleanup. Changing things before capturing evidence often hides the cause.',
    'Containers are disposable; named volumes are not. Be explicit about which one a command affects.',
    '`docker system prune -a --volumes` is a host-wide data-loss command. Avoid it as a reflex.',
    'If a container is being recreated constantly, check restart policy, healthcheck and Watchtower before editing the image.',
  ],
  config: [
    cfg('Diagnostic command order', [
      '`docker ps -a` — state, exit code, restart count.',
      '`docker logs --tail 100 --timestamps` — application output.',
      '`docker exec -it … sh` — inside filesystem, env, DNS and processes.',
      '`docker inspect` — image digest, mounts, health, network, limits.',
      '`docker stats --no-stream` and `docker events` — resources and timeline.',
      '`docker system df -v` — space; then prune only unused categories.',
    ]),
    cfg('Cleanup safety', [
      '`docker image prune` — dangling images only.',
      '`docker builder prune` — unused build cache.',
      '`docker system prune` — stopped containers, unused networks, dangling images; not volumes by default.',
      '`docker system prune --volumes` — also unused volumes; explicit data-loss risk.',
      'Never prune volumes on a host whose state you have not classified.',
    ]),
  ],
  pitfalls: [
    'Restarting before reading logs and the exit code.',
    'Using `docker exec` changes as a permanent fix; they vanish at the next recreate.',
    'Pruning volumes because the disk is full, then discovering the database was there.',
    'Comparing a tag instead of the running image digest.',
    'Ignoring healthcheck status and assuming “Up” means healthy.',
  ],
  productionChecks: [
    'Centralize logs instead of relying on local `docker logs` forever.',
    'Alert on restart loops, unhealthy status, OOM kills and disk pressure.',
    'Classify state: disposable container layer vs named volume vs external database.',
    'Test restore and cleanup procedures before an incident.',
  ],
};

export const dockerSecurity = {
  id: 'docker-security',
  title: 'Docker security — root, capabilities, read-only and limits',
  topic: 'docker',
  layout: 'docker',
  category: 'docker-run',
  level: 'advanced',
  minutes: 11,
  tags: ['non-root', 'read-only', 'cap-drop', 'no-new-privileges', 'memory limit', 'secrets', 'supply chain'],
  summary:
    'A container is isolated, not automatically secure. Build a non-root image, drop capabilities, use a read-only root filesystem, constrain resources and separate secrets from the image and the command line.',
  nodes: ['developer', 'project', 'daemon', 'container', 'volume', 'registry', 'deployment'],
  stores: ['local', 'docker', 'container', 'volume', 'registry', 'deployment'],
  nodeLabels: {
    container: { name: 'Hardened container', sub: 'non-root · caps dropped · read-only' },
  },
  steps: [
    {
      from: 'developer', to: 'project', badge: 'inspect Dockerfile', channel: 'cli',
      detail:
        'Start with the image. Does it run as root? Does it include a shell, compiler or package manager it does not need? Are build secrets copied into a layer?\n\nA smaller image with less tooling is not automatically secure, but it reduces the attack surface and the number of things you must patch.',
      vault: [add('local', ITEM.dockerfile({ id: 'dockerfile', name: 'Dockerfile', meta: 'USER · COPY · secrets' }))],
      tags: ['image surface', 'root', 'secrets'],
    },
    {
      from: 'project', to: 'daemon', badge: 'build non-root image', channel: 'engine',
      detail:
        'Create a dedicated user and switch to it before the final command. If the app needs to write, give it a specific writable directory or volume rather than making the whole filesystem writable.\n\n`USER app` is a default; a runtime `--user` can override it, so verify the running process UID in `docker inspect` or `docker exec id`.',
      vault: [add('docker', ITEM.image({ id: 'image', name: 'Hardened image', meta: 'USER app · pinned digest' }))],
      tags: ['non-root', 'USER', 'least privilege'],
    },
    {
      from: 'daemon', to: 'container', badge: '--read-only --cap-drop ALL', channel: 'engine',
      detail:
        'Dropping all Linux capabilities removes the default set of privileged operations. A read-only root filesystem prevents the process from modifying its image layer. `--security-opt no-new-privileges` blocks privilege escalation through setuid binaries.\n\nThen add back only what is truly needed, such as a writable volume or a specific capability.',
      vault: [add('container', ITEM.container({ id: 'app', name: 'Hardened container', meta: 'non-root · read-only · caps dropped' }))],
      tags: ['cap-drop', 'read-only', 'no-new-privileges'],
    },
    {
      from: 'container', to: 'volume', badge: 'only state is writable', channel: 'network',
      detail:
        'If the app must write, isolate that path. A named volume with the narrowest permissions is better than `--privileged` or a broad bind mount of the host.\n\nAvoid mounting `/var/run/docker.sock` into application containers. It is control of the Docker daemon, which is effectively root on the host.',
      vault: [add('volume', ITEM.volume({ id: 'state', name: 'Writable state', meta: 'narrow mount' }))],
      tags: ['writable path', 'docker.sock', 'host risk'],
    },
    {
      from: 'developer', to: 'daemon', badge: '--memory 100m --pids-limit 100', channel: 'cli',
      detail:
        'Resource limits contain a runaway process and make capacity predictable. Memory, CPU, PID count and file descriptors are separate controls.\n\nA hard memory limit can cause an OOM kill. Test the application under load and monitor it; a limit is not a substitute for fixing a leak.',
      tags: ['memory', 'cpu', 'pids', 'oom'],
    },
    {
      from: 'daemon', to: 'registry', badge: 'pull trusted digest', channel: 'registry',
      detail:
        'Pull from a trusted registry and verify the digest. Tags can move; a digest identifies exact content. If you use a private GHCR package, authenticate with the narrowest token and do not embed the token in an image or a Compose file.\n\nImage scanning is a gate, not a guarantee. It cannot see your runtime secrets or configuration mistakes.',
      vault: [add('registry', ITEM.image({ id: 'trusted', name: 'Trusted image', meta: 'pinned digest' }))],
      tags: ['trusted registry', 'digest', 'scanning'],
    },
    {
      from: 'container', to: 'container', badge: 'secret exposure review', channel: 'internal',
      detail:
        'Secrets do not belong in `ENV`, build args, image layers or a committed Compose file. Environment variables can leak through inspect, logs and crash dumps. Use a secret manager, Docker secrets where appropriate, or a runtime injection mechanism.\n\nRotate a secret if it was ever in an image or Git history; deleting the line does not delete the old artifact.',
      tags: ['secrets', 'env', 'history', 'rotation'],
    },
    {
      from: 'deployment', to: 'container', badge: 'verify runtime identity', channel: 'deploy',
      detail:
        'After deployment, verify the actual UID, capabilities, read-only flag, limits, mounts and image digest. `docker inspect` and `docker exec id` show the truth; the Compose file only describes intent.\n\nA platform may override parts of your configuration. Check the runtime, not only the manifest.',
      http: {
        req: 'docker inspect learning-lab --format "{{.Config.User}} {{.HostConfig.ReadonlyRootfs}}"',
        res: 'app true',
      },
      tags: ['runtime verification', 'inspect', 'drift'],
    },
  ],
  notes: [
    'Containers share the host kernel. Kernel isolation is not a security boundary equivalent to a full VM for every workload.',
    'Do not run application containers with `--privileged`, and do not mount the Docker socket into them.',
    'A read-only root filesystem often requires explicit writable tmpfs/volume paths; plan them.',
    'Resource limits and healthchecks protect availability; they do not protect confidentiality.',
    'A signed or scanned image still needs correct runtime configuration and secret handling.',
  ],
  config: [
    cfg('Runtime hardening flags', [
      '`--user 1000:1000` — run as a non-root UID/GID.',
      '`--read-only` — read-only root filesystem; add `--tmpfs /tmp` or a volume for required writes.',
      '`--cap-drop ALL --cap-add …` — start from zero capabilities and add only what is needed.',
      '`--security-opt no-new-privileges` — block setuid/setgid escalation.',
      '`--memory 100m --pids-limit 100` — resource containment.',
      '`--publish 127.0.0.1:8003:8080` — bind to localhost when public exposure is not intended.',
    ]),
    cfg('Secrets checklist', [
      'No secrets in Dockerfile `ENV`, `ARG`, `COPY` or image layers.',
      'No secrets in a committed compose.yaml or `.env` file.',
      'Use runtime secret injection, a secret manager or a dedicated secrets file with restrictive permissions.',
      'Rotate anything that was ever committed, logged or copied into an image.',
    ]),
  ],
  pitfalls: [
    'Assuming a container is a VM and therefore isolated from the host kernel.',
    'Running as root because it “just works”, then adding `--privileged` to fix a permission error.',
    'Mounting the Docker socket into an app container or Watchtower without accepting root-equivalent risk.',
    'Putting secrets in build args and thinking deleting them from the Dockerfile removes them from history.',
    'Setting a memory limit without monitoring OOM kills and application behavior.',
  ],
  productionChecks: [
    'Run non-root with a read-only root filesystem and dropped capabilities.',
    'Pin and verify image digests; scan and sign images in the pipeline.',
    'Inject secrets at runtime; never bake them into the image or commit them.',
    'Monitor OOM kills, restarts, health and resource pressure.',
  ],
};

export const dockerGhcr = {
  id: 'docker-ghcr',
  title: 'GHCR delivery — tag, push, pull and verify',
  topic: 'docker',
  layout: 'docker',
  category: 'compose',
  level: 'advanced',
  minutes: 10,
  tags: ['GHCR', 'tags', 'digest', 'package visibility', 'Watchtower', 'version.json', 'pull'],
  summary:
    'Take a local image through GHCR to the deployment host. See why a tag can lie, how a digest proves identity, what Watchtower actually polls, and how /version.json closes the update loop.',
  nodes: ['developer', 'project', 'daemon', 'registry', 'deployment', 'container', 'watchtower'],
  stores: ['local', 'docker', 'registry', 'deployment', 'container'],
  steps: [
    {
      from: 'developer', to: 'project', badge: 'tag the build', channel: 'cli',
      detail:
        'A local image can have several names. Tag it with the version you intend to deploy and, for releases, a semantic version. `latest` is convenient for humans but is a moving pointer; production should record the digest.\n\nUse a naming convention that includes the repository and environment, e.g. `ghcr.io/owner/learning:1.1.0`.',
      vault: [add('local', ITEM.tag({ id: 'release', name: 'Release tag', tag: 'v1.1.0', meta: 'points at this commit/build' }))],
      tags: ['tag', 'semver', 'latest'],
    },
    {
      from: 'project', to: 'daemon', badge: 'build reproducibility', channel: 'engine',
      detail:
        'The build should be traceable to source: base image, build args, dependency lockfile and commit. A version tag without a commit/build record is a label, not evidence.\n\nThe app’s `/version.json` embeds the package version, image tag, commit and build time at build time.',
      vault: [add('docker', ITEM.image({ id: 'img', name: 'Release image', meta: 'v1.1.0 · c4d8cf5' }))],
      tags: ['build metadata', 'traceability'],
    },
    {
      from: 'daemon', to: 'registry', badge: 'docker push ghcr.io/...', channel: 'registry',
      detail:
        'The registry receives the manifest and layers. It returns a digest. Save that digest in the deployment record/CI output. The tag can be moved later, but the digest cannot.\n\nA GHCR push needs `write:packages` and a package linked to the repository. If the package was created elsewhere and is not linked, even a valid token can receive 403.',
      http: {
        req: `docker push ghcr.io/rogerbergling/learning:1.1.0`,
        res: `1.1.0: digest: sha256:… size: 1234`,
      },
      vault: [add('registry', ITEM.image({ id: 'img', name: 'GHCR 1.1.0', meta: 'digest sha256:…' }))],
      tags: ['push', 'digest', 'write:packages'],
    },
    {
      from: 'registry', to: 'registry', badge: 'tag and digest', channel: 'internal',
      detail:
        'The registry stores content by digest. A tag is a separate mutable mapping. Two deployments that both say `latest` may be running different bytes; two deployments pinned to the same digest are the same content.\n\nFor verification, compare the running container’s image digest with the digest you published. The version stamp is a human-friendly secondary check.',
      tags: ['mutable tag', 'immutable digest', 'verification'],
    },
    {
      from: 'deployment', to: 'registry', badge: 'docker pull / compose pull', channel: 'registry',
      detail:
        'The deployment host authenticates if required and pulls the image manifest and layers. `pull_policy: always` in Compose asks for a pull before create/start, but it will not replace a running container by itself.\n\nIf the package is private, configure registry credentials on the host without committing them. A `docker login` on the host is local state.',
      vault: [add('deployment', ITEM.image({ id: 'img', name: 'Pulled image', meta: 'digest matches GHCR' }))],
      tags: ['pull', 'auth', 'private package'],
    },
    {
      from: 'deployment', to: 'container', badge: 'recreate container', channel: 'deploy',
      detail:
        'A new image does not change a running container. Compose/Watchtower must stop the old container and create a new one from the new image. The named volume and network are preserved.\n\nAfter recreation, the old image remains on disk until pruned; that is useful for rollback but consumes space.',
      vault: [add('container', ITEM.container({ id: 'app', name: 'Deployed container', meta: 'new digest · healthy' }))],
      tags: ['recreate', 'rollback', 'disk'],
    },
    {
      from: 'container', to: 'developer', badge: 'GET /version.json', channel: 'deploy',
      detail:
        'The version endpoint should show the new version, image tag, commit and build date. If it still shows the old values, you have not completed the flow: check the pulled digest, container recreation and browser/proxy cache.\n\nThis is the operational proof that “pull newest” actually reached users.',
      http: {
        req: 'GET /version.json HTTP/1.1\nHost: learning.example.com',
        res: `{"version":"1.1.0","imageTag":"1.1.0","commit":"c4d8cf5","buildDate":"2026-11-01T08:00:00Z"}`,
      },
      tags: ['version stamp', 'proof', 'cache'],
    },
    {
      from: 'registry', to: 'watchtower', badge: 'poll tagged image', channel: 'registry',
      detail:
        'Watchtower checks the registry for the label/scope it manages. It compares the remote digest with the running digest; if it changed, it schedules a pull and recreate.\n\nA private package needs the host to be authenticated. If the poll fails, Watchtower may log an error and keep the old container.',
      tags: ['watchtower', 'poll', 'digest', 'scope'],
    },
    {
      from: 'watchtower', to: 'container', badge: 'replace with newer digest', channel: 'deploy',
      detail:
        'The updater recreates the container from the newer digest. This is convenient but high trust: it mounts the Docker socket and can control every container on the host.\n\nFor enterprise or regulated environments, use CI/CD with explicit approval and an immutable digest instead of an automatic updater.',
      tags: ['automation', 'privilege', 'approval'],
    },
  ],
  notes: [
    'GHCR package visibility is separate from GitHub repository visibility. A public repo can still have a private package.',
    'Tags are mutable. If you need to prove the running build, record the digest from `docker inspect` and the version stamp.',
    'The image name follows the repository name when the workflow uses `${{ github.repository }}`. Renaming a repository does not rename the existing GHCR package; update consumers and republish.',
    '`latest` is fine for a demo, but production deployments should pin a version or digest.',
  ],
  config: [
    cfg('GHCR reference', [
      'Image: `ghcr.io/OWNER/REPOSITORY:TAG`; lowercase components.',
      'Push permissions: `write:packages`; pull permissions: `read:packages` for private packages.',
      'Package settings: visibility, linked repository, Actions access.',
      'Tags: branch, semver and SHA; keep an immutable release tag plus digest.',
      'Pull verification: `docker inspect image --format "{{index .RepoDigests 0}}"`.',
    ]),
    cfg('Version and update flow', [
      'Build passes `APP_VERSION`, `IMAGE_TAG`, `GIT_SHA` and `BUILD_DATE` into the image.',
      'The image writes `/version.json`; the home page/footer displays it.',
      'Deployment pulls the intended digest and recreates the container.',
      'The operator checks `/version.json`, health and logs.',
      'If the version did not change, inspect the running image digest and the host’s pull policy.',
    ]),
  ],
  pitfalls: [
    'Assuming a new `latest` tag updates running containers automatically.',
    'Comparing only tags; a tag is not a digest.',
    'Forgetting `docker login` for a private package on the deployment host.',
    'Renaming the repository and continuing to pull the old GHCR package path.',
    'Letting Watchtower update a host without understanding its Docker-socket privilege.',
  ],
  productionChecks: [
    'Publish an immutable version tag and record the digest.',
    'Sign/scan the image and enforce the result before deployment.',
    'Deploy by digest or approved release tag; verify `/version.json` and health.',
    'Retain the previous image for rollback and prune deliberately.',
  ],
};
