# Hardening BIND: a practical baseline

BIND is exposed to the internet by design. Harden it as a network service, a file system citizen and a secrets holder. This chapter is a baseline you can apply to a home lab or a public authoritative pair.

## The baseline

- Run a supported, patched BIND version.
- `version none;` and avoid unnecessary CHAOS responses.
- Explicit `listen-on` and `listen-on-v6`; firewall both families.
- Authoritative-only: `recursion no;`.
- Resolver: `allow-recursion`, `allow-query-cache`, cache and recursion limits.
- `allow-transfer { none; };` globally, then explicit secondary/TSIG ACLs.
- `update-policy` with narrow names/types and dedicated keys; never `allow-update { any; };`.
- `dnssec-validation auto;` on resolvers; a signing policy on authoritative zones.
- Protected `controls` and `statistics-channels`.
- Bounded logging and monitoring.
- RRL, cookies and RPZ where appropriate.
- Least-privilege service user and filesystem sandbox.
- A tested backup and rollback.

## Version disclosure

```text
options {
    version none;
};
```

`version none;` suppresses the `version.bind` CHAOS response. It does not make the server invisible; banners, behaviour and patches still matter. Do not rely on obscurity.

## Listeners and firewall

```text
listen-on port 53 { 127.0.0.1; 192.0.2.53; };
listen-on-v6 port 53 { ::1; 2001:db8::53; };
```

- Bind only the intended addresses.
- Firewall UDP and TCP 53 from the intended clients.
- Allow TCP/53 for transfers and large answers.
- Test IPv6 separately.
- Do not expose a home resolver to the internet.

A firewall is not an ACL substitute, and an ACL is not a firewall substitute. Use both.

## Recursion

```text
recursion no;   // authoritative-only
```

or:

```text
recursion yes;
allow-recursion { clients; };
allow-query-cache { clients; };
max-cache-size 512m;
max-recursion-queries 100;
max-recursion-depth 10;
```

- Never `allow-recursion { any; };` on a reachable server.
- Keep cache access as narrow as recursion.
- Use views if one server must serve both roles.
- Test from an untrusted network.

## Transfers and updates

```text
options {
    allow-transfer { none; };
    allow-update { none; };
};
```

Then opt in per zone:

```text
zone "example.com" {
    type primary;
    allow-transfer { 192.0.2.54; key "xfr-key"; };
};

zone "dhcp.example.com" {
    type primary;
    update-policy {
        grant "dhcp-key" self *.dhcp.example.com. A AAAA PTR;
    };
};
```

- Prefer TSIG over source-address trust.
- Use one key per peer or purpose.
- Rotate keys with overlap.
- Monitor transfer and update failures.

## DNSSEC

- Sign authoritative zones with a policy.
- Validate on resolvers.
- Monitor DS/DNSKEY match and RRSIG expiry.
- Keep the key directory private and backed up.
- Never disable validation globally to hide one broken zone.
- Test with `delv` and an external validator.

## Management plane

```text
controls {
    inet 127.0.0.1 port 953 allow { 127.0.0.1; } keys { "rndc-key"; };
};

statistics-channels {
    inet 127.0.0.1 port 8053 allow { 127.0.0.1; };
};
```

- Never expose `rndc` or statistics to the internet.
- Use a strong, dedicated key.
- Restrict by address and key.
- Log management access.
- Rotate keys.

## Rate limiting and RPZ

```text
rate-limit {
    responses-per-second 20;
    window 5;
    slip 2;
};

response-policy {
    zone "rpz.example";
};
```

- Tune RRL for legitimate traffic.
- Monitor drops.
- Use RPZ only with a reviewed feed and a bypass plan.
- RPZ requires recursion.
- Neither replaces a correct recursion ACL.

## Secrets and file permissions

TSIG secrets and DNSSEC private keys are credentials.

- TSIG files: `0600`, owned by the BIND user.
- Key directory: `0700`, no shared access unless required.
- Configuration: read-only for the service.
- Backups: encrypted, access-controlled and tested.
- Do not commit secrets to Git or bake them into images.
- Rotate on a schedule and after any suspected exposure.

## Service and host hardening

- Run as a dedicated non-root user.
- Use systemd sandboxing or an equivalent.
- Keep the configuration and zone directories read-only.
- Allow writes only to the cache/key/log directories.
- Use AppArmor/SELinux where available.
- Patch BIND and the OS promptly.
- Subscribe to ISC security announcements.
- Restrict SSH and management access to the DNS host.
- Do not run unrelated services on the same host.

## Logging and monitoring

- Log security, dnssec, transfer and update categories.
- Bound file size and retention.
- Protect log integrity.
- Alert on SERVFAIL, REFUSED, DNSSEC failures, transfer lag, disk full and signature expiry.
- Keep query logging off by default or short-lived.

## A hardening review checklist

- [ ] Supported BIND version and OS patches.
- [ ] `version none;`
- [ ] Explicit listeners, IPv4 and IPv6.
- [ ] Firewall UDP/TCP 53 and management ports.
- [ ] `recursion no;` or a narrow `allow-recursion`.
- [ ] `allow-transfer { none; };` plus explicit peers.
- [ ] `update-policy` only where required.
- [ ] DNSSEC validation or signing.
- [ ] Protected `controls` and `statistics-channels`.
- [ ] Bounded logging and monitoring.
- [ ] RRL/cookies/RPZ as appropriate.
- [ ] Secrets not world-readable.
- [ ] Backups and rollback tested.
- [ ] External recursion and DNSSEC checks.

## Simulate it

- [Open resolver — recursion exposure and amplification](#/sim/bind-open-resolver)
- [Split horizon — views, match-clients and RPZ](#/sim/bind-split-horizon)

## References and further reading

- [ISC BIND security advisories](https://www.isc.org/security-issues/)
- [BIND 9 ARM — security](https://bind9.readthedocs.io/en/latest/reference.html#security-considerations)
- [RFC 5358 — Preventing recursive-server abuse](https://www.rfc-editor.org/rfc/rfc5358)
- [RFC 7873 — DNS cookies](https://www.rfc-editor.org/rfc/rfc7873)
- [RFC 8945 — TSIG](https://www.rfc-editor.org/rfc/rfc8945)
- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks)

Next: [dig, delv and DNS troubleshooting](#/learn/bind-14-dig-troubleshooting).
