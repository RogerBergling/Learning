# BIND mental model: names, zones, RRsets and resolution

DNS is a distributed, hierarchical database. BIND is one of the servers that can host parts of it, answer questions about them and, when configured to recurse, find answers owned by somebody else.

This chapter builds the model you need before touching `named.conf`. Every later chapter refers back to it.

> Everything in this track is simulated. No query is sent, no real zone is loaded and no credential is used. Addresses use RFC 5737 TEST-NET ranges and names use RFC 2606 documentation domains.

## Names are paths, not rows

A fully qualified domain name (FQDN) such as `www.example.com.` is a path from the root (`.`) through `com.` and `example.com.` to `www.example.com.`.

- The **trailing dot** means absolute. `www.example.com.` is complete.
- Without the dot, BIND treats a name as relative to the current `$ORIGIN`.
- `@` means the current origin in a zone file.

This is the first place a zone breaks. In a zone whose origin is `example.com.`, `mail` becomes `mail.example.com.`, while `mail.example.com` becomes `mail.example.com.example.com.` because the name is still relative. Write the final dot when you mean it.

## Zones and domains are different

A **domain** is a name in the hierarchy. A **zone** is the portion of the tree for which one authority is responsible.

`example.com.` can be a zone. `www.example.com.` is a name inside that zone. The zone apex owns the `SOA` and `NS` records that define the zone. Below a delegation, a child zone has its own apex, its own SOA and its own name servers.

A useful mental model:

```text
zone = zone file + delegation
```

The zone file says what exists inside. The parent’s `NS` records say who is allowed to answer for it. Both are required, and they can disagree.

## RRsets are the unit of data

All records at the same owner, class and type form a **resource record set** (RRset).

```text
www.example.com. 3600 IN A 192.0.2.80
www.example.com. 3600 IN A 192.0.2.81
```

Those two A records are one RRset. They are not a priority list. A client may use either address, and many clients race them.

This matters for three reasons:

1. DNSSEC signs RRsets, not individual records.
2. Caches store RRsets.
3. Changing one member of an RRset changes the whole set.

`CNAME` is special: it must be the only ordinary data at its owner, and it cannot exist at the apex because the apex already has `SOA` and `NS`. DNSSEC metadata such as `RRSIG` and `NSEC` may coexist with a CNAME; ordinary data may not.

## Authority versus recursion

There are two different jobs:

- An **authoritative server** answers from zone data it owns. The answer carries `AA=1`.
- A **recursive resolver** follows referrals from the root to the authoritative server, then caches the answer for its TTL.
- A **stub resolver** on a laptop, phone or container simply asks a recursive resolver and trusts the result.

BIND can do both jobs, but they are different security roles. An authoritative server should normally use `recursion no;`. A resolver should use `recursion yes;` with a narrow `allow-recursion` ACL. Mixing them without policy is how open resolvers are born.

A **forwarder** is a resolver that sends queries upstream instead of doing full recursion itself. Forwarding can centralize policy and egress, but it also moves trust to the upstream resolver.

## A recursive lookup, step by step

For `www.example.com A`, a resolver with an empty cache roughly does this:

1. Ask a root server. The root returns a referral to `com.` with NS records and glue.
2. Ask a `com.` server. It returns a referral to `example.com.` with NS records and glue for `ns1.example.com.`.
3. Ask `ns1.example.com.` directly. It returns the A RRset with `AA=1`.
4. Validate DNSSEC if the answer is signed and validation is enabled.
5. Cache the RRset for its TTL.
6. Return the answer to the stub with `RA=1` and, if validated, `AD=1`.

A referral is not an answer. The root and TLD servers usually do not own the final data.

## Caching, TTL and negative caching

Every answer may be cached for its TTL in seconds. A cache hit is served without contacting the authoritative server. That is why DNS is fast, and why a changed record can appear to “come back”.

Negative answers are cached too:

- **NXDOMAIN** — the name does not exist.
- **NODATA** — the name exists, but the requested type does not.
- The negative TTL is controlled by the SOA minimum (and the negative-caching rules of the resolver).

TTL is a trade-off:

- Long TTLs reduce query volume and improve resilience.
- Short TTLs make changes and rollbacks faster.
- A planned migration should lower the TTL at least one old-TTL period before the change, then raise it after the new data is stable.

A short TTL is not a substitute for a tested change. It only shortens the stale window.

## Header flags you must recognise

| Flag | Meaning | Trap |
|---|---|---|
| `QR` | Response | A query has QR=0 |
| `AA` | Authoritative answer | The server owns the zone, not necessarily validated |
| `RD` | Recursion desired | A request, not a permission |
| `RA` | Recursion available | The server offers recursion; the ACL may still refuse |
| `AD` | Authenticated data | Only meaningful from a resolver you trust |
| `CD` | Checking disabled | Diagnosis only; not a production workaround |
| `TC` | Truncated | Retry over TCP or with a larger EDNS buffer |

The `AD` bit is not a property of the zone. It is set by a validating resolver after it has built a chain of trust to a configured trust anchor. If your resolver does not validate, `AD` means nothing.

## EDNS, UDP and TCP

Classic DNS uses UDP port 53 for most queries and TCP port 53 for large answers, zone transfers and fallback after truncation. EDNS(0) adds options and larger UDP payload sizes without changing the base protocol.

Relevant EDNS ideas:

- **DO** — DNSSEC OK; the client wants DNSSEC records if present.
- **UDP payload size** — how large a UDP response the client can accept.
- **DNS cookies** — a lightweight off-path spoofing defence.
- **EDE** — Extended DNS Error, structured error details for failures.

Do not block TCP/53. A firewall that allows only UDP breaks AXFR/IXFR and can make large answers fail in confusing ways.

## The home-user view

At home, the router often acts as a DHCP server and DNS forwarder. It may hand out its own address to clients, then forward to the ISP resolver. That is simple, but it hides:

- who actually resolves and caches;
- whether DNSSEC is validated;
- which upstream sees every query;
- why local names do not resolve.

Running BIND at home gives you control, but you still need to decide which component is authoritative for the LAN, which one caches and which upstream is trusted. The [home lab simulation](#/sim/bind-home-lab) walks through that decision.

## The advanced-admin view

For a public authoritative service, the important questions are different:

- Is the parent delegation correct and are all NS answering?
- Is glue present and synchronized?
- Is the zone signed, and does the parent DS match the current KSK?
- Are transfers restricted and authenticated?
- Is recursion disabled or tightly scoped?
- Are queries, transfers and DNSSEC failures observable?

DNS is a small protocol with a large operational surface. Most incidents are not “BIND crashed”; they are delegation, TTL, serial, DNSSEC or ACL mistakes.

## Simulate it

- [Recursive query — stub, cache, root, TLD and authoritative](#/sim/bind-recursive-query)
- [Authoritative answers — AA, NXDOMAIN and NODATA](#/sim/bind-authoritative-answer)

## References and further reading

- [RFC 1034 — Domain names: concepts and facilities](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 1035 — Domain names: implementation and specification](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2181 — Clarifications to the DNS specification](https://www.rfc-editor.org/rfc/rfc2181)
- [RFC 2308 — Negative caching of DNS queries](https://www.rfc-editor.org/rfc/rfc2308)
- [RFC 6891 — Extension Mechanisms for DNS (EDNS(0))](https://www.rfc-editor.org/rfc/rfc6891)
- [RFC 8499 — DNS terminology](https://www.rfc-editor.org/rfc/rfc8499)
- [BIND 9 Administrator Reference Manual](https://bind9.readthedocs.io/en/latest/)

Next: [How BIND is built and where its files live](#/learn/bind-02-architecture).
