# HAProxy mental model: proxies, frontends, backends and rules

HAProxy is a reverse proxy and load balancer. A connection arrives at a **bind**, is handled by a **frontend**, is routed to a **backend**, and the backend selects a **server**. The configuration is a set of sections; the request path is the story.

> This Learning Lab track teaches the model and simulates the flows. It deliberately has **no live config editor and no active debug console**. Validate real configs with `haproxy -c -f` on the exact production version.

## The request pipeline

```text
client
  │  TCP / TLS
  ▼
frontend  (bind, mode, TLS, http-request rules, ACLs)
  │  use_backend / default_backend
  ▼
backend   (balance, servers, health checks, timeouts)
  │
  ▼
server    (application)
  │
  ▼
response back through the frontend
```

The frontend decides **which backend**. The backend decides **which server**. Keeping those two decisions separate makes debugging much easier.

## The main sections

| Section | Purpose |
|---|---|
| `global` | Process-wide settings: logging, chroot, user/group, stats socket, maxconn |
| `defaults` | Default mode, timeouts, logging and options inherited by later sections |
| `frontend` | Listening side: binds, TLS, request rules, ACLs and backend selection |
| `backend` | Server pool, balance algorithm, health checks, retries and options |
| `listen` | A combined frontend + backend (older/simple style) |
| `resolvers` / `peers` | DNS resolution and stick-table replication |
| `cache` / `ring` / `http-errors` / `mailers` / `program` | Specialised features; some changed or were removed across versions |

A minimal HTTP example:

```haproxy
global
  log stdout format raw local0
  maxconn 2000

defaults
  mode http
  timeout connect 5s
  timeout client  30s
  timeout server  30s

frontend web
  bind :80
  default_backend app_servers

backend app_servers
  balance roundrobin
  server web1 10.0.0.11:8080 check
  server web2 10.0.0.12:8080 check
```

## `mode http` vs `mode tcp`

| Mode | HAProxy sees | Can do |
|---|---|---|
| `http` | Methods, Host, path, headers, cookies | HTTP ACLs, header rewriting, HTTP health checks |
| `tcp` | Byte stream and connection metadata (including TLS SNI in a TCP frontend) | TCP routing, TLS passthrough, SNI routing |

You cannot use `hdr(host)` or `path_beg` in a pure TCP frontend: those bytes are encrypted or are not HTTP yet.

## Frontend rules execute in order

- `http-request` rules can deny, return a response, set/remove headers or redirect.
- ACLs are named conditions.
- `use_backend` selects a backend when its conditions match.
- `default_backend` is the fallback.

The first matching `use_backend` wins. A broad rule before a narrow one shadows the narrow one.

## Backend servers and health

```haproxy
backend app_servers
  balance leastconn
  option httpchk GET /health
  default-server check inter 2s rise 2 fall 3
  server web1 10.0.0.11:8080 check
  server web2 10.0.0.12:8080 check backup
```

- `check` enables active health checks.
- `rise`/`fall` control how many successes/failures change state.
- `backup` is failover capacity, not normal capacity.
- `retries` and `option redispatch` change failure behavior; consider idempotency.

## Config-as-code principles

1. Keep the config in version control.
2. Validate with the exact target HAProxy binary.
3. Test TLS, DNS, ports and upstream health separately from syntax.
4. Reload gracefully with a documented rollback.
5. Watch logs, queues, 5xx and latency after the change.

A browser parser or the Learning Lab simulator is not `haproxy -c`.

## Simulate it

- [HTTPS request: frontend → ACL → backend → server](#/sim/haproxy-https-request)
- [ACL routing and 503](#/sim/haproxy-acl-routing)

Next: [Routing and ACLs](#/learn/haproxy-02-routing-acls).
