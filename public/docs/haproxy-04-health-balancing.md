# Health checks, balancing and failure behaviour

A backend is a pool of servers with a balance policy and health state. Healthy routing depends on correct checks, realistic `rise`/`fall`, and a plan for running out of servers.

## Health checks

```haproxy
backend app_servers
  balance roundrobin
  option httpchk GET /health
  default-server check inter 2s rise 2 fall 3
  server web1 10.0.0.11:8080 check
  server web2 10.0.0.12:8080 check
```

| Option | Meaning |
|---|---|
| `check` | Enable active health checks for the server |
| `inter` | Interval between checks |
| `rise` | Consecutive successes needed to mark UP |
| `fall` | Consecutive failures needed to mark DOWN |
| `httpchk` | HTTP request used for the check |
| `timeout check` | Timeout for a health check |

A TCP check can succeed while the application is unhealthy. Prefer an HTTP readiness endpoint when the app supports one. A health endpoint should prove what the proxy needs, not the full user journey.

## Balancing

| Algorithm | Best for |
|---|---|
| `roundrobin` | Similar servers, short requests |
| `leastconn` | Long-lived or uneven requests |
| `source` | Sticky by source IP (with caveats) |
| `random` | Large pools / simple distribution (3.3 default change) |
| `uri` / `hdr` | Cache-aware or host-aware pools |

Balance is not health; a down server is skipped, but an overloaded healthy server still receives traffic.

## Backup servers

```haproxy
server web1 10.0.0.11:8080 check
server web2 10.0.0.12:8080 check
server web3 10.0.0.13:8080 check backup
```

A backup server is used only when all normal servers are unavailable. It is failover capacity, not extra normal capacity.

## 502, 503 and 504

| Status | Usual meaning |
|---|---|
| **502 Bad Gateway** | HAProxy connected but got an invalid/empty upstream response |
| **503 Service Unavailable** | No backend/server eligible, or explicitly returned |
| **504 Gateway Timeout** | Upstream response timed out |

Do not treat all 5xx as the same failure. Read the HAProxy log and backend state.

## Retries and redispatch

```haproxy
retries 3
option redispatch
```

Retries can hide transient failures and increase load. Retrying a non-idempotent POST can duplicate a side effect. Decide by request semantics, not convenience.

## Capacity and failure testing

- Test one server down; verify the pool remains within latency/capacity targets.
- Test all normal servers down; verify backup or 503 behavior.
- Test slow health checks and flapping.
- Test recovery: does a server return at the intended rate?
- Alert on DOWN servers, no healthy servers, queue depth and 5xx.

## Simulate it

- [Health checks and the 503 path](#/sim/haproxy-health)
- [Timeouts and logs](#/sim/haproxy-timeouts)

Next: [Timeouts and logging](#/learn/haproxy-05-timeouts-logging).
