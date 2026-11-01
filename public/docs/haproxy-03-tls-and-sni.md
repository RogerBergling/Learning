# TLS architectures: termination, passthrough and SNI

HAProxy can terminate TLS, pass it through, or do both in a layered design. Each mode changes what HAProxy can see and control.

## TLS termination

```haproxy
frontend https_in
  bind :443 ssl crt /etc/haproxy/certs/example.pem
  mode http
  default_backend app_servers
```

- HAProxy presents the certificate, completes the TLS handshake and sees HTTP.
- It can apply Host/path/method ACLs, add security headers, inspect cookies and route by URL.
- The app receives HTTP; forwarding headers must be configured and trusted.

Certificate requirements:

- valid chain (leaf + intermediates)
- hostname coverage (CN/SAN)
- current validity and renewal ownership
- private key permissions
- deliberate TLS minimum/cipher policy

SNI matching does not prove certificate coverage. Those are separate checks.

## TLS passthrough

```haproxy
frontend tls_edge
  bind :443
  mode tcp
  tcp-request inspect-delay 5s
  tcp-request content accept if { req_ssl_hello_type 1 }
  acl is_shop req_ssl_sni -i shop.example.com
  use_backend shop_tls if is_shop

backend shop_tls
  mode tcp
  server shop1 10.0.0.21:443 check
```

- HAProxy does not terminate TLS. It cannot read the HTTP Host header, path, cookies or request body.
- It can route on SNI and connection metadata.
- The backend terminates TLS and must have the right certificate.
- HTTP health checks are not possible unless another component terminates TLS.

Use passthrough when end-to-end encryption or application-controlled certificates are required.

## Hybrid: TCP edge + loopback terminator

A common architecture:

```text
client :443
   │  TCP mode, SNI inspection
   ├── backend A (passthrough)
   └── loopback 127.0.0.1:8443
           │ TLS termination + HTTP mode
           └── backend B
```

The loopback frontend is internal; do not expose it publicly. It can add HTTP security headers and route by Host/path after TLS is terminated. The TCP edge remains the public boundary.

## Forwarded headers and trust

If HAProxy terminates TLS, the app may need to know the original scheme/client. Set headers at the trusted proxy:

```haproxy
http-request set-header X-Forwarded-Proto https
http-request set-header X-Forwarded-For %[src]
```

Rules:

- Strip or overwrite client-supplied forwarding headers at the edge.
- Ensure clients cannot bypass HAProxy and reach the app directly.
- Configure the app to trust only the proxy’s header values.
- Decide how to handle IPv4/IPv6 and proxy chains.

## Security headers

Security headers belong at the layer that owns the response. If HAProxy terminates TLS:

```haproxy
http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains"
http-response set-header X-Content-Type-Options nosniff
http-response set-header Referrer-Policy strict-origin-when-cross-origin
```

HSTS should only be enabled when HTTPS is guaranteed; otherwise it can lock users out of a misconfigured host.

## Operational checks

- Certificate expiry and chain validity are monitored.
- TLS minimum/cipher policy matches the organization.
- SNI/certificate coverage is tested for every hostname.
- Internal terminators are bound to loopback/private interfaces.
- Forwarded headers are overwritten, not trusted from clients.
- Passthrough backends are reachable and terminate TLS correctly.

## Simulate it

- [TLS termination and SNI passthrough](#/sim/haproxy-tls-sni)
- [HAProxy security](#/sim/haproxy-security)

Next: [Health checks and balancing](#/learn/haproxy-04-health-balancing).
