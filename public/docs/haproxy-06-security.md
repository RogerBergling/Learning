# HAProxy security: TLS, headers, client certificates and exposure

HAProxy is often the public edge. A secure config is not just “TLS enabled”; it is a set of explicit trust decisions.

## TLS policy

- Use a valid certificate chain; monitor expiry and renewal.
- Set a modern minimum TLS version supported by your clients.
- Choose cipher policy deliberately.
- Do not rely on SNI matching as proof that a certificate covers the hostname.
- Test with the same HAProxy version and OpenSSL/BoringSSL build as production.

## Security headers

If HAProxy terminates TLS and owns the response:

```haproxy
http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains"
http-response set-header X-Content-Type-Options nosniff
http-response set-header Referrer-Policy strict-origin-when-cross-origin
http-response set-header Content-Security-Policy "default-src 'self'"
```

Only set HSTS when HTTPS is guaranteed; otherwise it can lock users out of a broken host. Verify headers at the client, not only in the config.

## Header trust

Clients can send `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP` and identity headers. If HAProxy forwards them unchanged, the app may trust attacker-controlled values.

- Strip or overwrite inbound forwarding headers at the edge.
- Ensure clients cannot reach the app server directly.
- Configure the app to trust only the proxy’s values.
- Handle proxy chains and IPv6 explicitly.

## Client certificates

```haproxy
bind :443 ssl crt /etc/haproxy/certs/edge.pem verify required ca-file /etc/haproxy/ca.pem
```

- `verify required` rejects clients without a valid certificate.
- A forwarded header is identity evidence only if verification actually happened.
- Test expired, revoked and unknown CAs.
- Do not use an unverified certificate field as authorization.

## Admin and observability exposure

The stats page and runtime socket can change server state and reveal operational details. Bind them to localhost or a protected admin network, restrict permissions and never expose them publicly.

Logs should not contain credentials, tokens, full cookies or sensitive query strings. Log the facts needed for diagnosis and audit.

## Default-deny and fallback

A broad `default_backend` can accidentally expose an internal service. Prefer explicit routes and a safe fallback. Test unknown host/path behavior.

## Failure paths

Test:

- missing/invalid certificate
- no healthy backend
- ACL miss
- upstream timeout
- client-certificate rejection
- header spoof attempt

A secure system fails closed and gives the user a clear, non-sensitive error.

## Simulate it

- [HAProxy security and trust boundaries](#/sim/haproxy-security)
- [TLS architectures](#/sim/haproxy-tls-sni)

Next: [Operations and upgrades](#/learn/haproxy-07-operations-upgrades).
