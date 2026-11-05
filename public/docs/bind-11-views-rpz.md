# Views, split horizon, RPZ and dynamic updates

This chapter covers the features that turn BIND from a simple zone server into a policy engine: views, split horizon, response policy zones, dynamic updates and a few modern capabilities worth knowing.

## Views are ordered policy scopes

A view combines:

- `match-clients` — which clients belong here;
- optional `match-destinations` — which local address was queried;
- recursion and cache policy;
- a set of zones.

```text
view "internal" {
    match-clients { 10.20.0.0/16; };
    recursion yes;
    allow-recursion { 10.20.0.0/16; };
    allow-query { 10.20.0.0/16; };
    allow-query-cache { 10.20.0.0/16; };

    zone "corp.example" {
        type primary;
        file "/etc/bind/zones/db.corp.example";
    };
};

view "external" {
    match-clients { any; };
    recursion no;
    allow-query { any; };

    zone "example.com" {
        type primary;
        file "/etc/bind/zones/db.example.com.external";
    };
};
```

Rules:

- Views are evaluated in order; the first match wins.
- A catch-all `match-clients { any; };` before a specific view makes the specific view unreachable.
- Every view needs its own zone data and DNSSEC state if answers differ.
- Test every client network, including IPv6 and NAT boundaries.
- Document which clients are expected to see which answer.

## Split-horizon safety

Split horizon means serving different answers to different clients. Common uses:

- internal names resolve to private addresses;
- external clients see only public services;
- internal clients can recurse; external clients cannot;
- a public zone is signed, while an internal view uses a different or unsigned zone.

Safety rules:

1. Keep internal and external zone files separate and reviewed independently.
2. Do not use the same SOA serial logic for both if they diverge; track versions per view.
3. Make the default view explicit and test the fallback.
4. Ensure DNSSEC signing matches the data each view serves.
5. Document which clients are expected to see which answer.
6. Monitor for unexpected view selection after network changes.

A view mistake can expose internal zones or hide public ones. Treat the view order as security policy.

## Response Policy Zones (RPZ)

RPZ is a DNS firewall. A policy zone can:

- block a name (NXDOMAIN);
- return a fixed address (sinkhole);
- rewrite a CNAME;
- apply policy based on client or response.

```text
options {
    response-policy { zone "rpz.example"; };
};

zone "rpz.example" {
    type primary;
    file "/etc/bind/zones/db.rpz.example";
};
```

Example policy zone:

```text
$ORIGIN rpz.example.
@   IN SOA ns1.example.com. hostmaster.example.com. ( 2026110501 3600 900 1209600 300 )
@   IN NS  ns1.example.com.

; Block a known-bad domain.
bad.example        CNAME .

; Redirect a test host to a local sinkhole.
sinkhole.example   A 192.0.2.250
```

RPZ requires recursion. A bad feed can break legitimate services, so:

- use observe-only mode and monitor hits before enforcing;
- document an emergency bypass;
- review feed changes;
- watch policy hit rates;
- understand the interaction with DNSSEC validation.

RPZ is not a general firewall and not a substitute for endpoint protection.

## Dynamic updates (RFC 2136)

Dynamic updates let a trusted client change zone data at runtime. Typical uses:

- DHCP registering forward and reverse records;
- service discovery;
- provisioning systems.

Enable with a key and a narrow policy:

```text
key "dhcp-key" {
    algorithm hmac-sha256;
    secret "BASE64-SECRET";
};

zone "dhcp.example.com" {
    type primary;
    file "/var/cache/bind/db.dhcp.example.com";
    update-policy {
        grant "dhcp-key" self *.dhcp.example.com. A AAAA PTR;
    };
};
```

Rules:

- Never use `allow-update { any; };`.
- Prefer `update-policy` over `allow-update`; it can restrict names and types.
- Use a dedicated key per client or site.
- The journal is part of the zone state; back it up.
- The on-disk master file may not reflect the current state while the journal is active.
- Do not copy a text zone over a running server without considering the journal.
- Verify forward and reverse records after updates.
- Monitor update rate and failures.

## Catalog zones

Catalog zones automate zone provisioning across a BIND fleet. A catalog zone lists member zones and their properties; primaries and secondaries create or remove zones from that list.

Benefits:

- large fleets become manageable;
- zone provisioning is consistent;
- secondary configuration is generated.

Risks:

- the catalog becomes a control plane;
- a mistake can create or remove many zones;
- transfers and updates must be authenticated;
- you need a known-good catalog backup and monitoring.

Restrict catalog transfers with TSIG, monitor changes and treat the catalog as production configuration.

## DNS cookies, EDE and serve-stale

- **DNS cookies** (RFC 7873) — a lightweight off-path spoofing defence and a way to distinguish legitimate clients.
- **EDE** (RFC 8914) — Extended DNS Error, structured error details for DNSSEC and policy failures.
- **QNAME minimisation** (RFC 7816) — send less of the name at each delegation step.
- **Serve-stale** — keep answers available during upstream failures, with a bounded stale TTL.
- **Prefetch** — refresh popular records before they expire.

These features improve resilience or privacy. They are not a substitute for correct delegation, DNSSEC validation, restricted recursion and patched software.

## DoT and DoH

DNS-over-TLS (port 853) and DNS-over-HTTPS (443) protect the transport between client and resolver.

- They do not replace DNSSEC: a malicious resolver can still return forged data.
- They move trust to the resolver you connect to.
- For authoritative servers, they add a web/TLS attack surface and operational complexity.
- If you deploy them, terminate TLS correctly, monitor certificate expiry, rate-limit and log deliberately.
- A reverse proxy may be a better security boundary than exposing BIND directly.

## Advanced feature review questions

Before enabling any of these, ask:

1. What problem does it solve that the basics do not?
2. Who can change the policy or feed?
3. How is it authenticated?
4. How is it monitored?
5. What is the rollback?
6. Does it change DNSSEC or view behaviour?
7. Can it hide a delegation or recursion mistake?

## Simulate it

- [Split horizon — views, match-clients and RPZ](#/sim/bind-split-horizon)
- [Dynamic update — TSIG, update-policy and the journal](#/sim/bind-dynamic-update)

## References and further reading

- [BIND 9 ARM — views](https://bind9.readthedocs.io/en/latest/reference.html#view-statement-grammar)
- [BIND 9 ARM — response policy zones](https://bind9.readthedocs.io/en/latest/reference.html#response-policy-zone-rpz)
- [BIND 9 ARM — dynamic updates](https://bind9.readthedocs.io/en/latest/reference.html#dynamic-update-policies)
- [RFC 2136 — Dynamic updates](https://www.rfc-editor.org/rfc/rfc2136)
- [RFC 3007 — Secure dynamic update](https://www.rfc-editor.org/rfc/rfc3007)
- [RFC 7873 — DNS cookies](https://www.rfc-editor.org/rfc/rfc7873)
- [RFC 8914 — Extended DNS Errors](https://www.rfc-editor.org/rfc/rfc8914)
- [RFC 8484 — DNS over HTTPS](https://www.rfc-editor.org/rfc/rfc8484)
- [RFC 7858 — DNS over TLS](https://www.rfc-editor.org/rfc/rfc7858)

Next: [Operating BIND: logs, metrics, reload and incidents](#/learn/bind-12-operations).
