# Zone transfers, TSIG, NOTIFY and secondaries

A secondary exists so the zone survives the primary. Replication has to be correct, authenticated and observable. This chapter covers AXFR, IXFR, NOTIFY, TSIG, journals and the failure modes that leave a secondary silently stale.

## How replication works

1. The primary changes its serial and sends NOTIFY to the NS set and any `also-notify` targets.
2. A secondary checks the primary’s SOA serial.
3. If the serial is newer, the secondary requests IXFR.
4. The primary may answer with a delta from the journal or fall back to AXFR.
5. The secondary writes the zone and journal, then serves it authoritatively.
6. If the primary is unreachable, the secondary keeps serving until EXPIRE.

AXFR and IXFR use TCP/53. A firewall that allows only UDP breaks transfers.

## AXFR versus IXFR

| Transfer | What it sends | When |
|---|---|---|
| AXFR | The complete zone | Initial transfer, journal unavailable, full refresh |
| IXFR | Only changes since a serial | Normal incremental replication |
| NOTIFY | A hint that the zone changed | After a change, best effort |

AXFR can be large and expensive. On a large zone, AXFR storms after a primary restart can saturate links. Keep IXFR journals healthy and monitor transfer size.

## A safe primary policy

```text
options {
    allow-transfer { none; };
};

key "xfr-key" {
    algorithm hmac-sha256;
    secret "BASE64-SECRET";
};

zone "example.com" {
    type primary;
    file "/etc/bind/zones/db.example.com";
    allow-transfer { 192.0.2.54; key "xfr-key"; };
    notify yes;
    also-notify { 192.0.2.54; };
};
```

- Start with global deny, then opt in per zone.
- Prefer TSIG over source-address trust.
- If a secondary is behind NAT or has multiple source addresses, document the exact addresses.
- `also-notify` is useful for hidden primaries or secondaries outside the NS set.

## A secondary zone

```text
zone "example.com" {
    type secondary;
    primaries { 192.0.2.53 key "xfr-key"; };
    file "/var/cache/bind/db.example.com";
};
```

- The secondary writes the zone to `file` and keeps a journal.
- `primaries` can list multiple sources; the secondary tries them in order.
- The secondary must be able to reach the primary on TCP/53.
- The secondary serves the zone even if the primary is down, until EXPIRE.

If the secondary is also authoritative for other zones, keep its transfer and recursion policy separate.

## TSIG

TSIG (RFC 8945) authenticates a DNS message with a shared-secret MAC.

```text
key "xfr-key" {
    algorithm hmac-sha256;
    secret "BASE64-SECRET";
};
```

Rules:

- Key name, algorithm and secret must match exactly on both sides.
- Clocks must be roughly synchronized; TSIG has a time window.
- Protect the secret file with restrictive permissions.
- Use one key per peer or purpose; do not share one key across the estate.
- TSIG authenticates and protects integrity, but does not encrypt.
- Rotate keys with a planned overlap.

Weak or legacy algorithms (for example HMAC-MD5) should be migrated. HMAC-SHA256 is a common baseline.

## NOTIFY

NOTIFY tells a secondary that a zone changed. It is a hint, not the transfer.

- If NOTIFY is blocked, replication still happens on the REFRESH timer, but late.
- If NOTIFY is spoofed, the secondary still checks the serial and the transfer policy.
- `notify yes;` is normal on a primary.
- `also-notify` is for targets that are not in the NS set.

Test NOTIFY by changing a zone and watching the secondary; do not assume it worked because the command returned.

## Journals

The journal records changes since the last full zone write. It supports IXFR and crash recovery.

- Keep the journal with the zone; back up both.
- Do not copy a text zone over a running server without considering the journal.
- Monitor journal size and disk space.
- A corrupt journal can force AXFR or prevent the zone from loading.
- `ixfr-from-differences yes;` can help when the primary has no journal but the zone file changed.

## Hidden primary and multi-primary

A **hidden primary** is not in the public NS set. Only secondaries transfer from it. This protects the primary from direct queries and gives you a smaller attack surface.

- The hidden primary still needs hardening.
- The public secondaries must be monitored.
- Transfers must be authenticated.

**Multi-primary** setups exist, but they introduce serial conflict and update-routing complexity. Use them only with a clear write model. Catalog zones can automate provisioning, but they turn the catalog into a control plane.

## Dynamic updates and transfers

A dynamic update writes to the journal and increments the serial. The secondary then transfers the change like any other update.

- Authenticate updates with TSIG.
- Restrict `update-policy` by name and type.
- Monitor update rate and failures.
- Verify forward and reverse records.

See [views, RPZ and dynamic updates](#/learn/bind-11-views-rpz).

## Troubleshooting transfers

Start with the secondary:

```bash
rndc status
rndc zonestatus example.com
dig @primary example.com SOA +short
dig @secondary example.com SOA +short
```

Then check:

- TCP/53 reachability in both directions.
- Primary `allow-transfer` and key name.
- TSIG algorithm, secret and clock skew.
- Secondary `primaries` address and key.
- Journal corruption or full disk.
- Logs for “transfer of ... denied” or “failed”.

A controlled AXFR test:

```bash
dig AXFR example.com @192.0.2.53 -k /etc/bind/xfr-key.conf
```

Do not put the secret directly in shell history. Use a key file with restrictive permissions.

## Timers and expiry

- `REFRESH` — how often the secondary checks.
- `RETRY` — how long after a failed check.
- `EXPIRE` — how long the secondary keeps serving without the primary.

If `EXPIRE` is shorter than `REFRESH + RETRY`, normal jitter can cause an outage. If it is too long, a secondary can serve stale data for a long time.

Monitor:

- serial lag;
- last successful transfer;
- journal size;
- disk space;
- transfer failures;
- NOTIFY delivery.

## Simulate it

- [Primary and secondary — NOTIFY, AXFR/IXFR and TSIG](#/sim/bind-primary-secondary)
- [Dynamic update — TSIG, update-policy and the journal](#/sim/bind-dynamic-update)

## References and further reading

- [RFC 5936 — DNS zone transfer protocol (AXFR)](https://www.rfc-editor.org/rfc/rfc5936)
- [RFC 1995 — Incremental zone transfer (IXFR)](https://www.rfc-editor.org/rfc/rfc1995)
- [RFC 1996 — NOTIFY](https://www.rfc-editor.org/rfc/rfc1996)
- [RFC 8945 — TSIG](https://www.rfc-editor.org/rfc/rfc8945)
- [RFC 2136 — Dynamic updates](https://www.rfc-editor.org/rfc/rfc2136)
- [RFC 3007 — Secure dynamic update](https://www.rfc-editor.org/rfc/rfc3007)
- [BIND 9 ARM — zone transfers](https://bind9.readthedocs.io/en/latest/reference.html#zone-transfers)

Next: [Views, split horizon, RPZ and dynamic updates](#/learn/bind-11-views-rpz).
