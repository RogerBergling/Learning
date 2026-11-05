# dig, delv and DNS troubleshooting

`dig` is the microscope. `delv` is the DNSSEC-aware microscope. This chapter teaches you to read them, not just run them.

## The anatomy of a dig response

```text
$ dig @1.1.1.1 www.example.com A +dnssec

;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345
;; flags: qr rd ra ad; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags: do; udp: 1232

;; QUESTION SECTION:
;www.example.com. IN A

;; ANSWER SECTION:
www.example.com. 3600 IN A 192.0.2.80
www.example.com. 3600 IN RRSIG A 13 3 3600 ...
```

Read in this order:

1. **status** — NOERROR, NXDOMAIN, SERVFAIL, REFUSED, FORMERR.
2. **flags** — `qr`, `aa`, `rd`, `ra`, `ad`, `cd`, `tc`.
3. **QUESTION** — did you ask what you think you asked?
4. **ANSWER** — the data, or zero answers.
5. **AUTHORITY** — NS/SOA, referrals, negative proof.
6. **ADDITIONAL** — glue, OPT/EDNS, TSIG.

## RCODEs you will meet

| RCODE | Meaning | First check |
|---|---|---|
| NOERROR | Success; may still have zero answers | NODATA vs positive |
| NXDOMAIN | Name does not exist | Zone/view, typo, delegation |
| SERVFAIL | Server could not complete | DNSSEC, delegation, upstream, timeout |
| REFUSED | Policy denied | allow-query, allow-recursion, view |
| FORMERR | Malformed query | EDNS, client, middlebox |
| NOTIMP | Unsupported opcode/type | Client/server mismatch |
| BADVERS | EDNS version mismatch | Middlebox or old server |

## NXDOMAIN versus NODATA

- **NXDOMAIN** — the name does not exist. The authority section carries an SOA (and DNSSEC denial proof in a signed zone).
- **NODATA** — the name exists, but the requested type does not. The status is NOERROR, ANSWER is empty, and the authority section carries an SOA.

```bash
# NXDOMAIN
dig @ns1.example.com missing.example.com A +norecurse

# NODATA (name exists, no MX)
dig @ns1.example.com www.example.com MX +norecurse
```

Do not “fix” NODATA by adding a wildcard. Fix the record or the client.

## Query the right server

```bash
# Recursive resolver
dig @1.1.1.1 www.example.com A +dnssec

# Authoritative server, no recursion
dig @ns1.example.com www.example.com A +norecurse +dnssec

# Follow the delegation from the root
dig +trace www.example.com A

# Reverse lookup
dig -x 192.0.2.80 +short
```

- Use an authoritative server when you want zone truth.
- Use a recursive resolver when you want the user experience.
- Use `+trace` when you want the referral path.
- Use `+norecurse` to avoid hiding an authoritative problem behind recursion.

## DNSSEC-aware queries

```bash
# Request DNSSEC records and validation
dig @1.1.1.1 example.com DS +dnssec +multi
dig @1.1.1.1 example.com DNSKEY +dnssec +multi
dig @1.1.1.1 www.example.com A +dnssec +comments

# Disable validation to see raw data (diagnosis only)
dig @1.1.1.1 www.example.com A +dnssec +cd

# BIND validation-aware lookup
delv @1.1.1.1 www.example.com A +rtrace
delv +vtrace www.example.com A
```

Read:

- `AD=1` — the resolver validated the answer.
- `RRSIG` — present in the answer if DO was set.
- `SERVFAIL` — often a validation failure.
- `delv` — tells you which link failed.

`+cd` bypasses validation. It is useful to prove that the data exists and the failure is DNSSEC, but it must not become a production workaround.

## Zone transfers

```bash
dig AXFR example.com @192.0.2.53 -k /etc/bind/xfr-key.conf
dig IXFR=2026110501 example.com @192.0.2.53 -k /etc/bind/xfr-key.conf
```

- AXFR/IXFR use TCP/53.
- Use a key file, not a secret in shell history.
- A transfer can be large; do not run it casually against production.
- If the transfer is denied, check `allow-transfer`, TSIG and source address.

## Common support cases

### A name works from one resolver but not another

- Different cached delegations.
- Different views or split horizon.
- One resolver has a stale/bogus DNSSEC state.
- Anycast/GeoDNS or round-robin answers.
- One resolver is behind a filtering policy.

Check the authoritative servers, then multiple resolvers.

### SERVFAIL only for signed zones

- Expired RRSIG.
- Wrong DS or missing DNSKEY.
- Broken trust anchor.
- Unsupported algorithm.
- Clock skew.
- Key directory or signer failure.

Use `dig +cd` to see the data, `delv +rtrace` to see the validation failure, and `rndc dnssec -status` on the authoritative server.

### REFUSED

- `allow-query` does not include the client.
- `allow-recursion` does not include the client.
- A view matched unexpectedly.
- The firewall redirected the query to the wrong server.

Test from the client network, and check the view order.

### NXDOMAIN for a name that should exist

- Typo or wrong `$ORIGIN`.
- Wrong zone/view.
- Delegation points to a different server.
- Negative cache from an earlier mistake.
- The record is below a delegation in the parent (not authoritative).

Query the authoritative server directly before flushing caches.

### Secondary is stale

- Serial did not increase.
- `allow-transfer` or TSIG is wrong.
- TCP/53 is blocked.
- Journal is corrupt or disk is full.
- NOTIFY is blocked and REFRESH is long.

Compare SOA serials and `rndc zonestatus`.

## Browser and DoH caveats

A browser cannot open UDP/TCP port 53. Browser-based DNS tools use DNS-over-HTTPS, which is a recursive resolver’s view, not authoritative truth.

DoH answers can be cached, GeoDNS-specific or filtered. Use them for propagation checks, not as a replacement for querying the zone’s own name servers.

## A triage order that works

1. Confirm the exact query, type, resolver and time.
2. Query the authoritative server with `+norecurse`.
3. Check the parent delegation (NS, glue, DS).
4. Check DNSSEC (`+dnssec`, `+cd`, `delv`).
5. Check the resolver (recursion ACL, cache, forwarders).
6. Check the network (UDP/TCP 53, IPv6, firewall).
7. Check logs and monitoring.
8. Compare with the last change.
9. Fix, verify from multiple vantage points, record evidence.
10. Add a monitor so the next case is detected earlier.

## Simulate it

- [Troubleshooting SERVFAIL — delegation, DNSSEC and timeouts](#/sim/bind-troubleshoot-servfail)
- [Recursive query — stub, cache, root, TLD and authoritative](#/sim/bind-recursive-query)
- [Authoritative answers — AA, NXDOMAIN and NODATA](#/sim/bind-authoritative-answer)

## References and further reading

- [BIND 9 ARM — dig](https://bind9.readthedocs.io/en/latest/manpages.html#dig)
- [BIND 9 ARM — delv](https://bind9.readthedocs.io/en/latest/manpages.html#delv)
- [RFC 1035 — DNS implementation](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2308 — Negative caching](https://www.rfc-editor.org/rfc/rfc2308)
- [RFC 8914 — Extended DNS Errors](https://www.rfc-editor.org/rfc/rfc8914)
- [DNSViz](https://dnsviz.net/)
- [RIPE Atlas](https://atlas.ripe.net/)

Next: [BIND reference: directives, record types and RFCs](#/learn/bind-15-reference).
