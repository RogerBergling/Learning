# DNSSEC: keys, signatures and the chain of trust

DNSSEC adds origin authentication and integrity to DNS. A validating resolver can prove that an answer was signed by the zone that owns the data and was not modified in transit.

It does **not** provide confidentiality. Queries and answers are still visible on the wire unless you also use an encrypted transport. It also does not make a wrong record right: a signed typo is still a typo.

## The four records that matter

| Record | Lives where | Purpose |
|---|---|---|
| `DNSKEY` | Child apex | Public key used to validate signatures |
| `DS` | Parent delegation | Digest of a child KSK; the trust hand-off |
| `RRSIG` | Alongside signed RRsets | Signature over one RRset |
| `NSEC` / `NSEC3` | Signed zone | Authenticated denial of existence |

A zone signs ordinary data with a ZSK and signs the DNSKEY RRset with a KSK. The parent publishes a DS for the KSK. Validators build the chain from a trust anchor (normally the root KSK) down to the answer.

## DNSKEY flags and key roles

```text
example.com. 3600 IN DNSKEY 257 3 13 mdsswU... ; KSK, SEP
example.com. 3600 IN DNSKEY 256 3 13 abc123... ; ZSK
```

- Flags `256` — zone signing key (ZSK).
- Flags `257` — key signing key (KSK), usually with the SEP bit.
- Protocol `3` — DNSSEC.
- Algorithm `13` — ECDSAP256SHA256 in this example.
- The key tag is a 16-bit value derived from the key; `RRSIG` and `DS` refer to it.

A KSK signs the DNSKEY RRset. A ZSK signs ordinary RRsets. Some deployments use a single key (CSK) for both roles; the protocol does not require two keys.

## RRSIG fields

```text
www.example.com. 3600 IN RRSIG A 13 3 3600 (
    20261231235959 20261101000000 12345 example.com. ... )
```

| Field | Meaning |
|---|---|
| Type covered | The RRset type being signed |
| Algorithm | DNSSEC algorithm number |
| Labels | Number of labels in the owner name |
| Original TTL | TTL used in the signed data |
| Expiration | Signature not valid after this time |
| Inception | Signature not valid before this time |
| Key tag | Which DNSKEY verifies the signature |
| Signer | Zone that owns the key |
| Signature | Cryptographic signature |

The signature covers the canonical RRset, not the wire bytes. Reordering records, changing TTLs or changing names invalidates it.

## DS records

```text
example.com. 86400 IN DS 12345 13 2 ABCDEF0123456789...
```

| Field | Meaning |
|---|---|
| Key tag | Matches the child KSK |
| Algorithm | Must match the child key |
| Digest type | 1 = SHA-1, 2 = SHA-256, 4 = SHA-384 |
| Digest | Hash of the child owner name + DNSKEY RDATA |

A validator computes the digest locally and compares it with the DS. If no DNSKEY matches the DS, the delegation is bogus.

Use SHA-256 or SHA-384 for new deployments. SHA-1 DS records are legacy.

## The chain of trust

```text
root trust anchor
  → root DNSKEY (validated locally)
  → com DS (signed by root)
  → com DNSKEY
  → example.com DS (signed by com)
  → example.com DNSKEY
  → www.example.com A + RRSIG
```

At each delegation:

1. The parent publishes a DS.
2. The child publishes a DNSKEY.
3. The DS digest matches the DNSKEY.
4. The child signs its data with a key that chains to that DNSKEY.

A missing DS stops the chain intentionally: the delegation is **insecure**, not bogus. A wrong DS breaks it: the delegation is **bogus**.

## Validation states

| State | Meaning | Typical client result |
|---|---|---|
| Secure | Complete valid chain from a trust anchor | Answer returned, `AD=1` |
| Insecure | No DS at some delegation | Answer returned, no `AD` |
| Bogus | DS exists but validation fails | `SERVFAIL` |
| Indeterminate | Cannot determine, often network/algorithm | `SERVFAIL` or no `AD` |

A bogus zone is usually a total outage for validating clients. The authoritative server may still answer fine; the resolver refuses to pass the data.

## NSEC versus NSEC3

DNSSEC must prove that a name or type does not exist.

**NSEC** links names in canonical order:

```text
alpha.example.com. NSEC beta.example.com. A RRSIG NSEC
```

It is simple and efficient, but it allows zone walking: an attacker can enumerate names by following the chain.

**NSEC3** hashes names:

```text
HASH.example.com. NSEC3 1 0 0 - HASH2 A RRSIG
```

It makes walking harder but costs CPU and adds complexity. `NSEC3PARAM` publishes the hash algorithm, flags, iterations and salt at the apex.

RFC 9276 recommends **zero additional iterations** for new deployments. High iteration counts add CPU cost without meaningful extra protection for most zones.

## Algorithms

Common choices:

| Number | Algorithm | Notes |
|---|---|---|
| 8 | RSASHA256 | Widely supported; larger keys/responses |
| 13 | ECDSAP256SHA256 | Strong default; compact and fast |
| 14 | ECDSAP384SHA384 | Larger curve; where supported |
| 15 | ED25519 | Compact and fast; check resolver support |
| 5/7 | RSASHA1 / RSASHA1-NSEC3-SHA1 | Legacy; migrate |
| 3 | DSA | Obsolete; do not use |

For new deployments, ECDSAP256SHA256 is a strong default. RSASHA256 is widely supported but produces larger responses. Check registry and resolver support before choosing a less common algorithm.

## Verifying the chain

From a resolver:

```bash
dig @1.1.1.1 example.com DS +dnssec +multi
dig @1.1.1.1 example.com DNSKEY +dnssec +multi
dig @1.1.1.1 www.example.com A +dnssec +comments
```

Read:

- `AD` — the resolver validated the answer.
- `RRSIG` — present in the answer if DO was set.
- `SERVFAIL` — often a validation failure.
- `CD` — checking disabled; useful for diagnosis, dangerous in production.

From BIND:

```bash
delv @1.1.1.1 example.com A +rtrace
delv +vtrace example.com A
```

`+rtrace` shows the validation path; `+vtrace` adds verbose details. `delv` can tell you *why* an answer is bogus, which ordinary `dig` cannot.

## A bogus-DS example

Suppose the parent publishes:

```text
example.com. DS 12345 13 2 ABCDEF...
```

but the child now has only a KSK with key tag `54321`. A validator fetches the DNSKEY, finds no match for `12345`, and treats the zone as bogus. Every validating client gets SERVFAIL until the DS is corrected.

This is why rollover is staged:

1. Publish the new DNSKEY.
2. Publish the new DS alongside the old.
3. Wait for caches.
4. Switch signing.
5. Retire the old DS and key.

## What DNSSEC cannot fix

- A wrong A record.
- A missing MX target.
- A bad delegation or missing glue.
- A firewall blocking authoritative queries.
- A stale secondary.
- A compromised authoritative server.

DNSSEC protects data origin and integrity. It does not protect availability, confidentiality or operational correctness.

## Simulate it

- [DNSSEC chain — DS, DNSKEY, RRSIG and the AD bit](#/sim/bind-dnssec-chain)

## References and further reading

- [RFC 4033 — DNSSEC introduction and requirements](https://www.rfc-editor.org/rfc/rfc4033)
- [RFC 4034 — DNSSEC resource records](https://www.rfc-editor.org/rfc/rfc4034)
- [RFC 4035 — DNSSEC protocol modifications](https://www.rfc-editor.org/rfc/rfc4035)
- [RFC 5155 — NSEC3](https://www.rfc-editor.org/rfc/rfc5155)
- [RFC 6840 — DNSSEC clarifications and implementation notes](https://www.rfc-editor.org/rfc/rfc6840)
- [RFC 8624 — DNSSEC algorithm implementation requirements](https://www.rfc-editor.org/rfc/rfc8624)
- [RFC 9276 — NSEC3 guidance](https://www.rfc-editor.org/rfc/rfc9276)
- [BIND 9 ARM — DNSSEC](https://bind9.readthedocs.io/en/latest/dnssec-guide.html)
- [DNSViz](https://dnsviz.net/)

Next: [DNSSEC operations: policy, rollover and monitoring](#/learn/bind-08-dnssec-operations).
