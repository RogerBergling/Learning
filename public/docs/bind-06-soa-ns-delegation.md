# SOA, NS, TTL and delegation

The SOA and NS records are the operational contract of a zone. They decide how secondaries replicate, how long negative answers live, who is authoritative and how the parent hands off trust.

## The SOA fields

```text
@ IN SOA ns1.example.com. hostmaster.example.com. (
    2026110502 ; serial
    3600       ; refresh
    900        ; retry
    1209600    ; expire
    300 )      ; minimum / negative TTL
```

| Field | Meaning | Practical note |
|---|---|---|
| `MNAME` | Primary name server | Should normally be an apex NS |
| `RNAME` | Responsible mailbox in DNS-name form | `hostmaster.example.com.` not `hostmaster@example.com` |
| `SERIAL` | Zone version | Must increase on every publish |
| `REFRESH` | How often a secondary checks the primary | 1h–12h is common |
| `RETRY` | How long a secondary waits after a failed check | 5m–1h |
| `EXPIRE` | How long a secondary keeps serving without the primary | 1–4 weeks |
| `MINIMUM` | Negative-caching TTL (and historical default TTL) | 5m–1h is common |

There is no universal correct timer set. The relationship matters more than the individual values:

- `RETRY` should be shorter than `REFRESH`, but not a tight loop.
- `EXPIRE` must be longer than `REFRESH + RETRY`, with margin for jitter. If it is shorter, a secondary can stop answering during a normal refresh window.
- `MINIMUM` controls how long NXDOMAIN/NODATA can be cached. A large value makes a typo live longer.

## Serial strategy

The serial is a 32-bit number. It must increase for secondaries to notice a change.

Common strategies:

| Strategy | Example | Use |
|---|---|---|
| Date + counter | `2026110501` | Human-readable; up to 99 publishes/day |
| Epoch seconds | `1767225600` | Monotonic, no daily reset |
| Simple counter | `1042` | Small, controlled zones |

Rules:

- Never go backwards.
- Never let the value wrap.
- Do not rely on a file timestamp; secondaries compare the serial.
- Record the serial in the change ticket.

If you use `YYYYMMDDnn`, remember that `2026110501` is not a date parser input; it is just a number.

## TTL strategy and safe migrations

TTL controls how long the world may keep an old answer.

For a planned change:

1. Lower the TTL at least one old-TTL period before the change.
2. Wait for the old TTL to expire in caches that matter.
3. Make the change.
4. Verify from multiple resolvers and authoritative servers.
5. Raise the TTL after the new answer is stable.

For rollback, the old TTL also applies. A short TTL shortens the stale window; it does not replace a tested rollback.

## Apex NS and redundancy

```text
@ IN NS ns1.example.com.
@ IN NS ns2.example.net.
```

- Publish at least two NS records on independent infrastructure.
- A single NS is a single point of failure even if the server is reliable.
- In-bailiwick NS targets need glue A/AAAA in the same zone.
- Out-of-bailiwick targets need their own authoritative resolution.
- Parent delegation NS and child apex NS should match.

A mismatch is a classic “works from one resolver but not another” problem. Resolvers cache different delegations at different times.

## The zone cut

A delegation is an NS RRset at the child name in the parent:

```text
; parent example.com zone
child       IN NS ns1.child.example.com.
child       IN NS ns2.other.example.net.
ns1.child   IN A  192.0.2.100   ; glue, because ns1 is inside child
```

The parent remains authoritative above the cut. It is not authoritative for ordinary data at or below the child apex, except glue and DS.

`ns1.child.example.com.` is **in-bailiwick**: resolving it would require the child, which requires ns1. Glue breaks the loop.

`ns2.other.example.net.` is **out-of-bailiwick** and does not need glue in this parent.

## Glue rules

- Glue is needed only for NS targets inside the delegated child.
- Glue is authoritative data in the parent, not the child, even though it names a child host.
- Keep glue synchronized with the child’s A/AAAA records.
- Do not put arbitrary records below a delegation in the parent.
- Wrong glue is worse than missing glue: it can send resolvers to the wrong host.

Missing glue produces SERVFAIL or timeouts. Wrong glue produces intermittent failures that depend on cache state.

## DS: the DNSSEC hand-off

A DS record in the parent commits to a DNSKEY in the child:

```text
child.example.com. 86400 IN DS 12345 13 2 ABCDEF...
```

The chain:

```text
root trust anchor
  → root DNSKEY
  → com DS
  → com DNSKEY
  → example.com DS
  → example.com DNSKEY
  → www.example.com A + RRSIG
```

- A missing DS means an **insecure** delegation. The child may be signed, but validators do not use the signature.
- A wrong DS means **bogus**. Every signed answer under the child fails validation until the DS is fixed.
- A DS is a digest, not the child public key.

## Changing a delegation safely

1. Confirm the child NS servers answer authoritatively for the child apex.
2. Publish the child apex NS set before changing the parent.
3. If DNSSEC is involved, publish the child DNSKEY before the new DS.
4. Publish the new DS alongside the old one.
5. Wait for the old DS TTL and resolver caches.
6. Switch signing, verify, then retire the old DS and key.
7. Verify from multiple resolvers and from the parent and child authoritative servers.

Keep a rollback window. A delegation change can look fine locally while failing for a large resolver that cached the old NS set.

## Reverse delegation

Reverse zones are delegated like any other zone. For IPv4, the parent delegates `2.0.192.in-addr.arpa`; for IPv6, the nibble boundaries are under `ip6.arpa`.

The same rules apply:

- NS records at the cut;
- glue for in-bailiwick reverse name servers if needed;
- DS if the reverse zone is signed;
- PTR records that match forward DNS.

Do not assume your ISP or cloud provider delegates reverse DNS to you. Check the actual parent.

## Lame delegation

A lame delegation is a delegation to a server that is not actually authoritative for the child.

Symptoms:

- SERVFAIL from some resolvers;
- timeouts or REFUSED;
- answers with AA=0;
- different results depending on which NS a resolver reaches.

Diagnose with:

```bash
dig @ns1.child.example.com child.example.com SOA +norecurse
dig @ns1.child.example.com child.example.com NS +norecurse
dig +trace app.child.example.com A
```

Every NS in the parent should answer the child apex SOA authoritatively.

## A complete delegation example

Parent `example.com`:

```text
$ORIGIN example.com.
$TTL 3600

@   IN SOA ns1.example.com. hostmaster.example.com. ( 2026110502 3600 900 1209600 300 )
@   IN NS  ns1.example.com.
@   IN NS  ns2.example.net.
ns1 IN A   192.0.2.53

child       IN NS ns1.child.example.com.
child       IN NS ns2.other.example.net.
ns1.child   IN A  192.0.2.100
child       IN DS 12345 13 2 ABCDEF...
```

Child `child.example.com`:

```text
$ORIGIN child.example.com.
$TTL 3600

@   IN SOA ns1.child.example.com. hostmaster.child.example.com. ( 2026110502 3600 900 1209600 300 )
@   IN NS  ns1.child.example.com.
@   IN NS  ns2.other.example.net.
ns1 IN A   192.0.2.100
app IN A   192.0.2.101
```

## Simulate it

- [Delegation — parent NS, glue and the zone cut](#/sim/bind-zone-delegation)
- [Primary and secondary — NOTIFY, AXFR/IXFR and TSIG](#/sim/bind-primary-secondary)

## References and further reading

- [RFC 1034 — Domain names](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 1035 — Domain names implementation](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2181 — Clarifications](https://www.rfc-editor.org/rfc/rfc2181)
- [RFC 2308 — Negative caching](https://www.rfc-editor.org/rfc/rfc2308)
- [RFC 4034 — DNSSEC resource records](https://www.rfc-editor.org/rfc/rfc4034)
- [RFC 8499 — DNS terminology](https://www.rfc-editor.org/rfc/rfc8499)

Next: [DNSSEC: keys, signatures and the chain of trust](#/learn/bind-07-dnssec-chain).
