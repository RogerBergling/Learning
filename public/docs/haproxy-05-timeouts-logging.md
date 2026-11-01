# Timeouts, logging and request diagnosis

HAProxy has several timeout budgets. “The site is slow” is not a diagnosis; identify which phase consumed the budget.

## Timeout map

| Timeout | Bounds |
|---|---|
| `timeout connect` | Establishing the upstream TCP connection |
| `timeout client` | Client-side inactivity |
| `timeout server` | Upstream-side inactivity |
| `timeout queue` | Waiting for a server connection slot |
| `timeout http-request` | Completing the HTTP request headers |
| `timeout check` | Health-check response |

```haproxy
defaults
  mode http
  timeout connect 5s
  timeout client  30s
  timeout server  30s
  timeout queue   30s
  timeout http-request 10s
```

A request can fail at any phase. A slow upload may hit `timeout client`; a full pool may hit `timeout queue`; a dead upstream may hit `timeout connect`; an unresponsive app may hit `timeout server`.

## Status codes

- **502 Bad Gateway** — connected, but the upstream response was invalid or the connection failed after selection.
- **503 Service Unavailable** — no backend/server eligible.
- **504 Gateway Timeout** — upstream did not respond within the server timeout.

The status alone is not enough. Check backend/server, timers and the application log.

## Request logs

A useful HTTP log includes:

- client address
- frontend, backend and server
- status code
- request/response timers
- queue time
- bytes
- request ID if configured

```haproxy
global
  log stdout format raw local0
defaults
  option httplog
  option dontlognull
```

Correlate with the app using a request ID or timestamps. Do not log tokens, cookies, authorization headers or sensitive query strings.

## Stats and runtime state

The stats page/socket exposes:

- server health and weight
- active connections
- queue depth
- response-time percentiles
- error counters

Treat the runtime socket as an admin control plane. Bind it to localhost or a protected admin network.

## Diagnostic order

1. Read the HAProxy status and log.
2. Identify frontend/backend/server selection.
3. Check queue/connect/response timers.
4. Check server health and backend capacity.
5. Check the application’s own logs/traces.
6. Change configuration only after identifying the phase.

## Simulate it

- [Timeouts and the 504 path](#/sim/haproxy-timeouts)
- [Health checks and 503](#/sim/haproxy-health)

Next: [HAProxy security](#/learn/haproxy-06-security).
