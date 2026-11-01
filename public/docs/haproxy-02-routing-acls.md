# Routing and ACLs: which backend wins?

An ACL is a named condition. `use_backend` rules are evaluated in order and the first match wins. Most HAProxy routing surprises are ordering problems.

## Rules are ordered

```haproxy
frontend web
  bind :443 ssl crt /etc/haproxy/certs/example.pem
  acl is_api   hdr(host) -i api.example.com
  acl is_site  hdr(host) -i www.example.com
  acl is_admin path_beg /admin

  use_backend api_servers  if is_api
  use_backend admin_servers if is_site is_admin
  use_backend web_servers  if is_site
  default_backend fallback_servers
```

- The API rule is evaluated before the generic site rule.
- `is_site is_admin` means both ACLs must match (AND).
- `default_backend` is used only if no `use_backend` matches.

A single broad rule before a specific one makes the specific one unreachable. Put security/narrow rules first.

## Common ACLs

| Condition | Example |
|---|---|
| Host | `acl is_site hdr(host) -i www.example.com` |
| Path | `acl is_api path_beg /api` |
| Method | `acl is_post method POST` |
| Source | `acl internal src 10.0.0.0/8` |
| TLS SNI (TCP context) | `acl is_shop req_ssl_sni -i shop.example.com` |
| TLS state (HTTP context) | `acl is_https ssl_fc` |

ACL matching is not authorization. An ACL that routes `/admin` does not prove the user is an admin. Enforce authorization in the app or a dedicated policy layer.

## `http-request` before backend selection

```haproxy
http-request deny if { path_beg /internal }
http-request set-header X-Forwarded-Proto https
http-request return status 301 hdr(Location) https://www.example.com if !is_https
```

These run before `use_backend`. A deny/return can answer immediately without a backend.

Use `http-request` for transport/edge concerns, not as a replacement for application authorization.

## Default backend and 503

```haproxy
default_backend fallback_servers
```

Without a default backend, a request that matches no rule gets **503 Service Unavailable** from HAProxy. That is a routing result, not necessarily an application crash.

A very broad default can accidentally publish an internal service. Prefer an explicit, safe fallback (maintenance page/404) or default-deny where appropriate.

## Simulating and testing

Test at least:

- correct Host/path → intended backend
- wrong Host → default/503
- `/api` vs `/apiary` (path prefix boundaries)
- `POST` vs `GET`
- internal vs external source
- HTTPS vs HTTP
- a missing default backend
- an earlier rule shadowing a later one

The Learning Lab simulator shows the matching ACL and backend selection without being a production config editor.

## Simulate it

- [ACL routing: first match and 503](#/sim/haproxy-acl-routing)
- [HTTPS request](#/sim/haproxy-https-request)

Next: [TLS architectures](#/learn/haproxy-03-tls-and-sni).
