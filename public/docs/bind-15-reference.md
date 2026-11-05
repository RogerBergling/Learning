# BIND reference: directives, record types and RFCs

A compact operator reference for the directives and records used in this track. It is not a replacement for the BIND Administrator Reference Manual; it is the page you keep open while reading a configuration.

## named.conf top-level statements

| Statement | Purpose |
|---|---|
| `options { ... };` | Server-wide defaults: paths, listeners, recursion, transfers, DNSSEC, logging |
| `acl "name" { ... };` | Named address/key match list |
| `key "name" { ... };` | TSIG key (algorithm + secret) |
| `view "name" { ... };` | Ordered policy scope with `match-clients`, recursion and zones |
| `zone "name" { ... };` | Zone declaration: type, file, transfer/update policy |
| `logging { ... };` | Channels and categories |
| `controls { ... };` | `rndc` management channel |
| `statistics-channels { ... };` | JSON/XML statistics endpoint |
| `dnssec-policy "name" { ... };` | Key algorithms, lifetimes and signing policy |
| `trust-anchors { ... };` | DNSSEC trust anchor(s) |
| `server <address> { ... };` | Per-server transfer/query behaviour |
| `include "file";` | Textual include |
| `masters` / `primaries` | Transfer source lists |

## Options worth knowing

| Directive | Default risk | Guidance |
|---|---|---|
| `directory` | Relative paths resolve unpredictably | Set it explicitly |
| `listen-on` / `listen-on-v6` | Wildcard listeners | Bind only intended addresses |
| `recursion` | `yes` on many packages | `no` for authoritative-only |
| `allow-query` | Often `any` | Scope for internal zones |
| `allow-recursion` | Missing or `any` = open resolver | Narrow ACL |
| `allow-query-cache` | Can be broader than recursion | Match the recursion ACL |
| `allow-transfer` | `any` on some setups | Global `none`, then opt in |
| `allow-update` | `any` is catastrophic | Avoid; use `update-policy` |
| `dnssec-validation` | `no` disables validation | `auto` on resolvers |
| `version` | Discloses BIND version | `none` |
| `minimal-responses` | Larger responses | `yes` |
| `max-cache-size` | Unbounded memory | Bound it |
| `max-recursion-queries` | Unbounded work | Bound it |
| `max-recursion-depth` | Deep chains | Bound it |
| `querylog` | Disk/privacy cost | Temporary only |
| `rate-limit` | Abuse exposure | Tune RRL |
| `response-policy` | Policy complexity | Review feed and bypass |
| `statistics-channels` | Management exposure | Localhost/management only |
| `controls` | Remote control | Strong key + ACL |
| `empty-zones-enable` | Leaks or surprises | Understand the default |
| `filter-aaaa` | Breaks IPv6 | Avoid unless intentional |
| `deny-answer-aliases` | CNAME/DNAME edge cases | Know why you need it |
| `stale-answer-enable` | Stale data | Bound the stale TTL |
| `prefetch` | Extra query load | Use deliberately |
| `ixfr-from-differences` | Helps without a journal | Understand the trade-off |
| `journal` | Disk usage | Monitor and back up |
| `masterfile-format` | Compatibility | Keep text unless you need binary |
| `check-names` | Hostname strictness | Know the mode |
| `serial-update-method` | Dynamic-update serial | Choose intentionally |
| `multi-master` | Serial conflicts | Avoid without a write model |

## Zone statement

| Field | Meaning |
|---|---|
| `type primary` | Owns the source data |
| `type secondary` | Pulls from `primaries` |
| `type stub` | Loads NS only |
| `type forward` | Forwards a namespace |
| `type hint` | Root hints |
| `file` | Zone file path |
| `journal` | Journal path |
| `allow-transfer` | Who may AXFR/IXFR |
| `allow-update` | Legacy update ACL |
| `update-policy` | Per-key name/type update policy |
| `notify` | Send NOTIFY |
| `also-notify` | Extra NOTIFY targets |
| `primaries` | Secondary source list |
| `dnssec-policy` | Signing policy |
| `inline-signing` | Maintain a signed version separately |
| `key-directory` | Where keys live |
| `check-names` | Name strictness for this zone |
| `max-zone-ttl` | Upper TTL bound |

## Common ACLs

| ACL | Meaning |
|---|---|
| `any` | Every client |
| `none` | No client |
| `localhost` | Loopback addresses |
| `localnets` | Networks directly connected to the host |
| `!address` | Negation inside an ACL |
| `key "name"` | TSIG-authenticated client |

## DNSSEC policy example

```text
dnssec-policy "default" {
    keys {
        ksk lifetime unlimited algorithm ecdsap256sha256;
        zsk lifetime 90d      algorithm ecdsap256sha256;
    };
    nsec3param iterations 0 optout no salt random;
};
```

## Record types

| Type | Fields | Purpose | Trap |
|---|---|---|---|
| `A` | address | IPv4 mapping | Multiple A records are a set, not priority |
| `AAAA` | address | IPv6 mapping | Do not publish without IPv6 connectivity |
| `CNAME` | target | Alias | Exclusive; not at apex; not an MX/NS/SRV target |
| `DNAME` | target | Subtree redirect | Synthesizes CNAMEs; test the whole subtree |
| `MX` | preference, exchange | Mail exchanger | Target must not be a CNAME |
| `NS` | nameserver | Authority/delegation | Parent and child sets should match |
| `SOA` | mname, rname, serial, timers | Zone contract | Serial must increase |
| `TXT` | strings | Policy/text | 255-octet strings; split long values |
| `SPF` | strings | Obsolete SPF RR | Use TXT |
| `SRV` | priority, weight, port, target | Service locator | Target must not be a CNAME |
| `CAA` | flags, tag, value | CA authorization | Include `iodef` |
| `PTR` | target | Reverse DNS | Must match forward DNS |
| `DS` | key tag, algorithm, digest | DNSSEC delegation | Wrong DS = bogus |
| `DNSKEY` | flags, protocol, algorithm, key | DNSSEC public key | 256 ZSK, 257 KSK |
| `RRSIG` | type, alg, labels, TTL, times, tag, signer, sig | DNSSEC signature | Expiry is an outage timer |
| `NSEC` | next name, types | Denial of existence | Allows zone walking |
| `NSEC3` | hash alg, flags, iterations, salt, next hash, types | Hashed denial | High iterations cost CPU |
| `NSEC3PARAM` | hash alg, flags, iterations, salt | NSEC3 parameters | Use zero iterations for new zones |
| `CDS` / `CDNSKEY` | key/digest | Child DS signalling | Automation-specific |
| `TLSA` | usage, selector, matching, data | DANE certificate binding | Requires DNSSEC |
| `SSHFP` | algorithm, type, fingerprint | SSH host key binding | Requires DNSSEC |
| `SVCB` / `HTTPS` | priority, target, params | Service binding | Strict syntax |
| `NAPTR` | order, preference, flags, service, regexp, replacement | Service discovery | Complex; test clients |
| `URI` | priority, weight, target | Service URI | Limited client support |
| `HINFO` | CPU, OS | Host information | Usually an information leak |
| `RP` | mailbox, TXT | Responsible person | Informational |
| `LOC` | lat/long/alt | Geographic location | Informational |
| `CERT` | type, key tag, alg, cert | Certificate metadata | Niche |
| `ZONEMD` | serial, scheme, alg, digest | Zone digest | Verify support |
| `OPENPGPKEY` | key | OpenPGP public key | Niche |
| `CSYNC` | serial, flags, types | Child-to-parent sync | DNSSEC automation |
| `TYPE` | raw | Unknown/private type | Preserve, do not drop |

## Flags and RCODEs

| Flag | Meaning |
|---|---|
| `AA` | Authoritative answer |
| `RD` | Recursion desired |
| `RA` | Recursion available |
| `AD` | Authenticated data |
| `CD` | Checking disabled |
| `TC` | Truncated |

| RCODE | Meaning |
|---|---|
| NOERROR | Success (may be NODATA) |
| NXDOMAIN | Name does not exist |
| SERVFAIL | Could not complete |
| REFUSED | Policy denied |
| FORMERR | Malformed query |
| NOTIMP | Unsupported |
| BADVERS | EDNS version mismatch |

## Toolbox

| Tool | Use |
|---|---|
| `named-checkconf -z` | Validate configuration and load zones |
| `named-checkzone` | Validate a zone file |
| `named-checkds` | Check a DS against a DNSKEY |
| `dig` | Query, trace, transfer, DNSSEC |
| `delv` | Validation-aware query |
| `nsupdate` | Send dynamic updates |
| `rndc` | Reload, status, key state |
| `rndc dnssec -status` | DNSSEC key state |
| `named-journalprint` | Inspect a zone journal |
| `dnssec-keygen` / `dnssec-signzone` | Manual DNSSEC tooling (policy is preferred) |

## RFCs and standards

### DNS core

- [RFC 1034 — Domain names: concepts](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 1035 — Domain names: implementation](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2181 — Clarifications](https://www.rfc-editor.org/rfc/rfc2181)
- [RFC 2308 — Negative caching](https://www.rfc-editor.org/rfc/rfc2308)
- [RFC 6891 — EDNS(0)](https://www.rfc-editor.org/rfc/rfc6891)
- [RFC 8499 — DNS terminology](https://www.rfc-editor.org/rfc/rfc8499)

### DNSSEC

- [RFC 4033 — Introduction and requirements](https://www.rfc-editor.org/rfc/rfc4033)
- [RFC 4034 — Resource records](https://www.rfc-editor.org/rfc/rfc4034)
- [RFC 4035 — Protocol modifications](https://www.rfc-editor.org/rfc/rfc4035)
- [RFC 5155 — NSEC3](https://www.rfc-editor.org/rfc/rfc5155)
- [RFC 6840 — Clarifications](https://www.rfc-editor.org/rfc/rfc6840)
- [RFC 7583 — Key rollover timing](https://www.rfc-editor.org/rfc/rfc7583)
- [RFC 8624 — Algorithm requirements](https://www.rfc-editor.org/rfc/rfc8624)
- [RFC 9276 — NSEC3 guidance](https://www.rfc-editor.org/rfc/rfc9276)

### Transfers, updates and security

- [RFC 1995 — IXFR](https://www.rfc-editor.org/rfc/rfc1995)
- [RFC 1996 — NOTIFY](https://www.rfc-editor.org/rfc/rfc1996)
- [RFC 2136 — Dynamic updates](https://www.rfc-editor.org/rfc/rfc2136)
- [RFC 3007 — Secure dynamic update](https://www.rfc-editor.org/rfc/rfc3007)
- [RFC 5936 — AXFR](https://www.rfc-editor.org/rfc/rfc5936)
- [RFC 8945 — TSIG](https://www.rfc-editor.org/rfc/rfc8945)
- [RFC 5358 — Preventing recursive-server abuse](https://www.rfc-editor.org/rfc/rfc5358)
- [RFC 7816 — QNAME minimisation](https://www.rfc-editor.org/rfc/rfc7816)
- [RFC 7873 — DNS cookies](https://www.rfc-editor.org/rfc/rfc7873)
- [RFC 8914 — Extended DNS Errors](https://www.rfc-editor.org/rfc/rfc8914)

### Encrypted transport

- [RFC 7858 — DNS over TLS](https://www.rfc-editor.org/rfc/rfc7858)
- [RFC 8484 — DNS over HTTPS](https://www.rfc-editor.org/rfc/rfc8484)

### Mail and service records

- [RFC 7208 — SPF](https://www.rfc-editor.org/rfc/rfc7208)
- [RFC 6376 — DKIM](https://www.rfc-editor.org/rfc/rfc6376)
- [RFC 7489 — DMARC](https://www.rfc-editor.org/rfc/rfc7489)
- [RFC 8659 — CAA](https://www.rfc-editor.org/rfc/rfc8659)
- [RFC 6698 — DANE/TLSA](https://www.rfc-editor.org/rfc/rfc6698)
- [RFC 4255 — SSHFP](https://www.rfc-editor.org/rfc/rfc4255)
- [RFC 9460 — SVCB and HTTPS](https://www.rfc-editor.org/rfc/rfc9460)

## BIND documentation

- [BIND 9 Administrator Reference Manual](https://bind9.readthedocs.io/en/latest/)
- [BIND 9 configuration reference](https://bind9.readthedocs.io/en/latest/reference.html)
- [BIND 9 DNSSEC guide](https://bind9.readthedocs.io/en/latest/dnssec-guide.html)
- [BIND 9 man pages](https://bind9.readthedocs.io/en/latest/manpages.html)
- [ISC BIND](https://www.isc.org/bind/)
- [ISC security advisories](https://www.isc.org/security-issues/)

## External validation and data

- [DNSViz](https://dnsviz.net/)
- [Verisign DNSSEC debugger](https://dnssec-debugger.verisignlabs.com/)
- [IANA DNS parameters](https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml)
- [RIPE Atlas](https://atlas.ripe.net/)
- [Root server operators](https://root-servers.org/)

## Scenario map

| Scenario | Focus |
|---|---|
| [Recursive query](#/sim/bind-recursive-query) | Stub, resolver, root, TLD, authority, cache |
| [Authoritative answers](#/sim/bind-authoritative-answer) | AA, NXDOMAIN, NODATA |
| [Zone delegation](#/sim/bind-zone-delegation) | Parent NS, glue, zone cut |
| [Zone file](#/sim/bind-zone-file) | $ORIGIN, SOA, records, checkzone |
| [named.conf](#/sim/bind-named-conf) | Options, ACLs, views, checkconf |
| [DNSSEC chain](#/sim/bind-dnssec-chain) | DS, DNSKEY, RRSIG, AD |
| [DNSSEC rollover](#/sim/bind-dnssec-rollover) | Policy, KSK, DS timing |
| [Primary and secondary](#/sim/bind-primary-secondary) | NOTIFY, IXFR, TSIG, journal |
| [Dynamic update](#/sim/bind-dynamic-update) | TSIG, update-policy, journal |
| [Open resolver](#/sim/bind-open-resolver) | Recursion exposure, RRL, cookies |
| [Split horizon](#/sim/bind-split-horizon) | Views, match-clients, RPZ |
| [Home lab](#/sim/bind-home-lab) | DHCP, private zone, forwarder |
| [SERVFAIL troubleshooting](#/sim/bind-troubleshoot-servfail) | dig, delv, delegation, DNSSEC |
| [Change workflow](#/sim/bind-change-workflow) | Validate, diff, deploy, roll back |

Next: [BIND & DNS glossary](#/learn/bind-glossary).
