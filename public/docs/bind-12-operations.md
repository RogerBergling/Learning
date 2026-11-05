# Operating BIND: logs, metrics, reload and incidents

DNS is infrastructure. When it breaks, everything looks broken. This chapter is the operating manual: what to log, what to measure, how to reload safely and how to investigate without making the outage worse.

## Logging that earns its disk space

At minimum, route these categories to a bounded channel:

- `default` — startup, shutdown, general errors;
- `security` — ACL and policy events;
- `xfer-in` / `xfer-out` — transfers;
- `dnssec` — validation and signing failures;
- `update` — dynamic updates;
- `queries` — only temporarily, or with strict retention.

```text
logging {
    channel main {
        file "/var/log/named/main.log" versions 5 size 20m;
        severity info;
        print-time yes;
        print-category yes;
        print-severity yes;
    };
    category default { main; };
    category security { main; };
    category dnssec { main; };
    category xfer-out { main; };
    category xfer-in { main; };
    category update { main; };
};
```

Query logs can contain personal data and internal names. Restrict access and retention.

## Metrics that matter

| Metric | Why |
|---|---|
| Query rate | Capacity and abuse detection |
| Cache hit ratio | Resolver health |
| SERVFAIL rate | DNSSEC, delegation or upstream failure |
| REFUSED rate | ACL or view mistakes |
| FORMERR rate | Malformed queries, EDNS issues |
| DNSSEC validation failures | Chain/signature problems |
| Earliest RRSIG expiry | The next DNSSEC outage timer |
| Transfer success/failure | Secondary freshness |
| Serial lag | How stale a secondary is |
| Recursion limit hits | Capacity or attack |
| RRL drops | Rate limiting or abuse |
| Disk space | Journals, keys and logs |
| File descriptors / CPU | Host health |

`statistics-channels` exposes JSON/XML. Scrape it from a protected management path:

```text
statistics-channels {
    inet 127.0.0.1 port 8053 allow { 127.0.0.1; };
};
```

Do not expose statistics to the internet.

## `rndc` and the control channel

`rndc` talks to `named` over a control channel.

```text
controls {
    inet 127.0.0.1 port 953 allow { 127.0.0.1; } keys { "rndc-key"; };
};
```

- Protect the key like a password.
- Bind controls to localhost or a management network.
- Never expose `rndc` to the internet.
- Use `rndc status`, `rndc zonestatus`, `rndc reload` and `rndc reconfig` deliberately.

## Reload versus restart

| Action | Effect |
|---|---|
| `rndc reload` | Reloads zones/configuration without dropping the process; caches usually survive |
| `rndc reconfig` | Reloads `named.conf` and new zones |
| Restart `named` | Drops caches and in-flight state; heavier |
| `rndc reload <zone>` | Reloads one zone |

Always validate first:

```bash
named-checkconf -z /etc/bind/named.conf
rndc reload
rndc status
rndc zonestatus example.com
```

A command returning zero does not guarantee the zone loaded. Read the logs and query the server.

## Monitoring the authoritative side

- Each NS answers the apex SOA and NS.
- The parent delegation matches the child apex NS.
- Glue is present and correct.
- The zone serial is the expected one.
- AXFR/IXFR succeeds and secondaries are current.
- DNSSEC keys/signatures are valid.
- TCP/53 and UDP/53 are reachable.
- The server is not an open resolver.

## Monitoring the resolver side

- Recursion is restricted.
- Cache hit ratio and memory are healthy.
- SERVFAIL and REFUSED rates are understood.
- DNSSEC validation is working.
- Upstream forwarders are reachable.
- Query rate spikes and random-subdomain patterns are alerted.
- RRL/cookies are configured where appropriate.

## Incident response for DNS

1. **Scope it.** One name, one zone, one resolver or everything?
2. **Check the authoritative answer.** `dig @ns1.example.com name type +norecurse`.
3. **Check the delegation.** Parent NS and DS.
4. **Check DNSSEC.** `dig +dnssec`, `delv +rtrace`, expiry and key state.
5. **Check transfers.** Secondary serial, journal, TCP/53.
6. **Check logs.** REFUSED, transfer failures, DNSSEC errors, disk full.
7. **Check the network.** UDP/TCP 53, IPv6, firewall changes.
8. **Compare with the previous change.** Roll back if the old state was healthy.
9. **Record evidence.** Exact commands, times, resolvers and outputs.

Do not restart services before collecting evidence. A restart can erase the state you need.

## Common failure signatures

| Signature | Likely cause |
|---|---|
| SERVFAIL from validating resolvers only | DNSSEC bogus, expired RRSIG, wrong DS |
| SERVFAIL from all resolvers | Delegation, glue, authoritative unreachable |
| REFUSED | ACL/view mismatch |
| NXDOMAIN unexpectedly | Missing record, wrong view, wrong zone |
| NODATA unexpectedly | Wrong type, CNAME conflict, wrong owner |
| Secondary stale | Serial not increased, transfer denied, TCP blocked, journal issue |
| Intermittent answers | Multiple NS with different data, caching, anycast/GeoDNS |
| Zone will not load | Missing file, bad record, duplicate zone, permissions |
| Signing stopped | Key directory, disk full, clock, permissions |

## Change control for DNS

DNS changes are easy to make and hard to see. Use a repeatable gate:

1. Save the current configuration and zone files.
2. Make the smallest change.
3. Run `named-checkconf -z` and `named-checkzone`.
4. Compare semantically: records, TTLs, serials, directives.
5. Stage on a secondary or test instance where possible.
6. Reload and observe.
7. Verify authoritative, recursive and DNSSEC paths.
8. Keep a tested rollback.

A short TTL is not a replacement for a tested rollback.

## Backups

Back up:

- `named.conf` and every include;
- every zone file;
- journals;
- DNSSEC key directory;
- TSIG key files (securely);
- logs needed for audit.

Test a restore. A backup that has never been restored is a hope, not a control.

## Simulate it

- [Troubleshooting SERVFAIL — delegation, DNSSEC and timeouts](#/sim/bind-troubleshoot-servfail)
- [DNS change workflow — validate, diff, deploy and roll back](#/sim/bind-change-workflow)

## References and further reading

- [BIND 9 ARM — logging](https://bind9.readthedocs.io/en/latest/reference.html#logging-statement-grammar)
- [BIND 9 ARM — statistics](https://bind9.readthedocs.io/en/latest/reference.html#statistics-channels)
- [BIND 9 ARM — rndc](https://bind9.readthedocs.io/en/latest/manpages.html#rndc)
- [ISC BIND security advisories](https://www.isc.org/security-issues/)
- [RFC 8914 — Extended DNS Errors](https://www.rfc-editor.org/rfc/rfc8914)

Next: [Hardening BIND: a practical baseline](#/learn/bind-13-hardening).
