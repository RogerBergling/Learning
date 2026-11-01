# Operations and upgrades: validate, reload, observe

HAProxy configuration is production code. Change it through version control, validation, a controlled reload and a rollback plan.

> This Learning Lab track has **no active debug console and no config editor**. Use the official HAProxy binary, your normal deployment pipeline and the actual runtime state.

## Validate

```bash
haproxy -c -f /etc/haproxy/haproxy.cfg
```

Use the exact binary/version that will serve traffic. A syntax check is necessary but not sufficient:

- certificates must exist and parse
- DNS/hostnames must resolve
- listen ports must be free
- upstream servers must be reachable
- ACLs must match intended requests
- the runtime socket must be available

## Reload

Reload behavior depends on the service manager and HAProxy version. Preserve listening sockets where supported, drain old workers and watch for connection errors during the change window.

Have a previous config and a tested rollback command. A reload of an invalid config can leave you serving nothing.

## Version upgrades

HAProxy 2.8 → 3.x has breaking changes. Check:

- removed `program`/mailers sections
- duplicate-name enforcement
- dynamic server `enabled` behavior
- renamed OCSP tuning directives
- default balance changes (3.3 roundrobin → random)
- Runtime API/stats behavior

Read the release notes for the exact branch and test the config with that binary. Do not assume a config from 2.6 is valid on 3.4.

## Observe after the change

Compare against baseline:

- 4xx/5xx rate
- connection errors
- queue depth
- response-time percentiles
- server health/weight
- TLS errors

A green process status is not proof that routing is unchanged. Check a few real request paths and negative cases.

## Change record

Record:

- commit/config version
- target HAProxy version
- validation command and output
- certificate/DNS/port checks
- reload/rollback procedure
- post-change metrics and owner

## Simulate it

- [Validate, reload and observe](#/sim/haproxy-upgrade)
- [Health and failure paths](#/sim/haproxy-health)

Next: [HAProxy glossary](#/learn/haproxy-glossary).
