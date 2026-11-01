# HAProxy glossary

Terms used throughout the HAProxy track.

## A–C

**ACL** — A named condition used by `use_backend`, `http-request`, `tcp-request` and other rules. Matching is ordered; it is not authorization by itself.

**backend** — A pool of servers plus balance policy, health checks, retries and options. The frontend chooses the backend; the backend chooses a server.

**balance** — Algorithm for selecting a server (`roundrobin`, `leastconn`, `source`, `random`, etc.).

**bind** — The address/port (and TLS certificate) a frontend listens on.

**check** — Enables active health checks for a server.

**client certificate** — A certificate presented by the client. Verification must be configured explicitly; an unverified header is not identity.

**connect timeout** — Maximum time to establish an upstream connection.

**crt** — Certificate (and chain/key) file used by a TLS bind; exact syntax depends on HAProxy version/build.

## D–H

**default_backend** — Backend used when no `use_backend` rule matches. Without one, unmatched requests get 503.

**defaults** — Default mode, timeouts, logging and options inherited by later sections.

**DOWN** — Server health state after `fall` consecutive failed checks.

**fall** — Number of consecutive failed checks required to mark a server DOWN.

**frontend** — The listening side: binds, TLS, request rules, ACLs and backend selection.

**global** — Process-wide settings such as logging, user/group, chroot, maxconn and stats socket.

**health check** — Active probe of a server. A TCP check can pass while the HTTP application is broken.

**HSTS** — HTTP Strict Transport Security header telling browsers to use HTTPS. Only enable when HTTPS is guaranteed.

## I–P

**inter** — Health-check interval.

**leastconn** — Balance algorithm selecting the server with the fewest active connections.

**listen** — Combined frontend + backend section.

**maxconn** — Connection limit (global or frontend/server context depending on placement).

**mode http / mode tcp** — Protocol awareness. HTTP allows header/path ACLs; TCP only sees connection/byte/TLS metadata such as SNI.

**option httplog** — Adds HTTP details to request logs.

**option redispatch** — Allows retrying a request on another server after a failure.

**SNI** — TLS Server Name Indication: the hostname in the ClientHello. Available in TCP mode; not the same as the HTTP Host header.

**stats socket** — Runtime/admin socket for state and control. Treat as privileged.

## Q–Z

**retries** — Number of retry attempts after a failure; beware non-idempotent requests.

**rise** — Consecutive successful checks required to mark a server UP.

**roundrobin** — Balance requests across servers in rotation.

**server** — Upstream address/port with health, weight and optional backup role.

**stick table** — In-memory state keyed by client/request attributes, used for persistence/rate tracking. Plan expiry and replication.

**TLS passthrough** — HAProxy forwards encrypted traffic without terminating it; HTTP headers are not visible.

**TLS termination** — HAProxy completes TLS and forwards HTTP; it can inspect and modify requests/responses.

**timeout queue** — Maximum wait for a server connection slot.

**UP** — Server health state after `rise` consecutive successful checks.

**use_backend** — Frontend rule selecting a backend when ACL conditions match.

**X-Forwarded-For / X-Forwarded-Proto** — Headers describing the original client/scheme. Trust only from a controlled proxy path, and overwrite client-supplied values.

## See also

- [Mental model](#/learn/haproxy-01-mental-model)
- [Routing and ACLs](#/learn/haproxy-02-routing-acls)
- [Security](#/learn/haproxy-06-security)
- [Operations](#/learn/haproxy-07-operations-upgrades)
