# DNSSEC operations: policy, rollover and monitoring

Signing a zone is a project. Keeping it signed is an operation. This chapter is about the operational side: policy, key storage, rollover, signature expiry, monitoring and the failure modes that turn a signed zone into an outage.

## Policy-driven signing

Modern BIND manages keys and signatures through `dnssec-policy`:

```text
dnssec-policy "default" {
    keys {
        ksk lifetime unlimited algorithm ecdsap256sha256;
        zsk lifetime 90d      algorithm ecdsap256sha256;
    };
    nsec3param iterations 0 optout no salt random;
};

zone "example.com" {
    type primary;
    file "/etc/bind/zones/db.example.com";
    dnssec-policy "default";
    inline-signing yes;
};
```

- `dnssec-policy` defines algorithms, key lifetimes, signing intervals and denial-of-existence parameters.
- `inline-signing yes;` keeps an unsigned source file and maintains a separate signed version.
- `key-directory` must be writable by BIND and protected from other users.
- `nsec3param iterations 0` follows current guidance.

BIND creates, rotates and retires keys according to the policy. That does not make it hands-off: the key directory, clock, disk and parent DS still need monitoring.

## Key directory and file permissions

The key directory contains private keys. Treat it as a credential store.

```text
/var/cache/bind/keys/  owner bind:bind  mode 0700
```

- Do not commit keys to Git.
- Do not bake keys into a container image.
- Do not restore an old key directory over a newer one without understanding the state.
- Back up the key directory and the zone journal together.
- Test restore, not just backup.

Losing the key directory can leave the zone unsigned or unable to roll. Restoring an old copy can resurrect a retired key that the parent DS no longer points at.

## KSK and ZSK rollover

A **ZSK rollover** stays inside the zone:

1. Publish the new ZSK in the DNSKEY RRset.
2. Sign ordinary data with it.
3. Wait for caches to see the new DNSKEY.
4. Retire the old ZSK.

A **KSK rollover** crosses the parent DS and is the risky part:

1. Generate the new KSK and publish its DNSKEY.
2. Generate the new DS and publish it in the parent **alongside** the old DS.
3. Wait for the old DS TTL and resolver caches.
4. Switch DNSKEY signing to the new KSK.
5. Verify secure validation from multiple resolvers.
6. Remove the old DS.
7. Retire the old KSK.

Keep a rollback window. Monitoring must cover both DS records and both keys during the transition.

## Signature validity

RRSIG expiration is an outage timer. Monitor it like a certificate:

- Track the earliest RRSIG expiry per zone.
- Alert well before expiry.
- Alert on `dnssec-policy` key events and signing failures.
- Check `rndc dnssec -status` regularly.
- Check disk space for the key directory and journal.

A signer can stop for reasons unrelated to DNSSEC: a full disk, a read-only mount, a clock jump, a permissions change or a broken key directory. The zone may still answer unsigned data until the signatures expire.

## Algorithms and key sizes

For new deployments:

- ECDSAP256SHA256 (13) is a strong default.
- ED25519 (15) is compact and fast where supported.
- RSASHA256 (8) is widely supported; use at least 2048-bit keys.
- RSASHA1, DSA and other legacy algorithms should be migrated.

Smaller keys and ECDSA produce smaller responses, which reduces fragmentation and CPU cost. Check resolver and registry support before choosing a less common algorithm.

## NSEC3 parameters

```text
nsec3param iterations 0 optout no salt random;
```

Guidance:

- Zero additional iterations for new deployments (RFC 9276).
- Use a random salt or no salt; either is acceptable when iterations are zero.
- `optout` can reduce the size of unsigned delegations but has operational trade-offs.
- Do not hand-edit NSEC/NSEC3 records in an inline-signed zone.

High iteration counts increase CPU cost for every negative answer and can be used to amplify load. They do not add meaningful security for most zones.

## Monitoring and commands

```bash
rndc dnssec -status example.com
rndc secroots
rndc managed-keys status
```

Useful signals:

| Signal | Why it matters |
|---|---|
| Earliest RRSIG expiry | The next DNSSEC outage timer |
| Key state changes | Rollover progress or failure |
| Signing failures | The zone may become unsigned |
| DS/DNSKEY mismatch | Bogus for validating clients |
| NSEC3 iteration count | CPU and response size |
| Key directory disk usage | Signing stops when full |
| Clock skew | Signatures may be not-yet-valid or expired |
| Secondary DNSSEC state | Inconsistent validation by server |

External validation:

```bash
dig @1.1.1.1 example.com DS +dnssec
dig @1.1.1.1 example.com DNSKEY +dnssec
delv @1.1.1.1 example.com A +rtrace
```

Also use DNSViz or a local validating resolver. A single public resolver is a sample, not the whole internet.

## Common DNSSEC traps

1. Publishing a DS before the child DNSKEY exists.
2. Removing the old DS before caches expire.
3. Changing algorithms without a planned rollover.
4. Hand-editing NSEC/NSEC3 in an inline-signed zone.
5. Losing the key directory on container restart.
6. Forgetting that transfers must carry the signed records.
7. Assuming an AD bit from a public resolver proves your own resolver is healthy.
8. Using NSEC3 with high iteration counts on a busy zone.
9. Letting the clock drift on a VM.
10. Restoring an old zone without the matching keys and journal.

## A safe rollover checklist

1. Back up the zone, journal and key directory.
2. Confirm the current DS and DNSKEY match.
3. Publish the new DNSKEY.
4. Wait for the DNSKEY TTL and caches.
5. Publish the new DS alongside the old.
6. Wait for the DS TTL and caches.
7. Switch signing to the new key.
8. Verify with `delv` and multiple resolvers.
9. Remove the old DS.
10. Retire the old key.
11. Keep a rollback window and document the state.

## Simulate it

- [DNSSEC rollover — dnssec-policy, KSK and DS timing](#/sim/bind-dnssec-rollover)
- [DNSSEC chain — DS, DNSKEY, RRSIG and the AD bit](#/sim/bind-dnssec-chain)

## References and further reading

- [BIND 9 DNSSEC guide](https://bind9.readthedocs.io/en/latest/dnssec-guide.html)
- [BIND 9 ARM — dnssec-policy](https://bind9.readthedocs.io/en/latest/reference.html#dnssec-policy)
- [RFC 4033 — DNSSEC introduction](https://www.rfc-editor.org/rfc/rfc4033)
- [RFC 4034 — DNSSEC resource records](https://www.rfc-editor.org/rfc/rfc4034)
- [RFC 4035 — DNSSEC protocol modifications](https://www.rfc-editor.org/rfc/rfc4035)
- [RFC 5155 — NSEC3](https://www.rfc-editor.org/rfc/rfc5155)
- [RFC 6840 — DNSSEC clarifications](https://www.rfc-editor.org/rfc/rfc6840)
- [RFC 8624 — DNSSEC algorithms](https://www.rfc-editor.org/rfc/rfc8624)
- [RFC 9276 — NSEC3 guidance](https://www.rfc-editor.org/rfc/rfc9276)
- [RFC 7583 — DNSSEC key rollover timing](https://www.rfc-editor.org/rfc/rfc7583)

Next: [Recursion security: open resolvers, cache and rate limits](#/learn/bind-09-recursion-security).
