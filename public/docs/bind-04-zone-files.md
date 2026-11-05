# Zone files from first principles

A zone file is a text representation of one DNS zone. BIND calls it a master file. Small syntax mistakes produce records at the wrong name, records that fail to load, or a zone that answers differently from what you intended.

This chapter is deliberately mechanical. Once the rules are automatic, the rest of DNS becomes much easier.

## `$ORIGIN`, `$TTL` and `@`

```text
$ORIGIN example.com.
$TTL 3600

@   IN  SOA ns1.example.com. hostmaster.example.com. (
        2026110501 ; serial
        3600       ; refresh
        900        ; retry
        1209600    ; expire
        300 )      ; negative caching TTL

@       IN  NS      ns1.example.com.
@       IN  NS      ns2.example.net.
www     IN  A       192.0.2.80
```

- `$ORIGIN` sets the suffix used to expand relative names.
- `$TTL` sets the default TTL for records that do not specify one.
- `@` means the current origin.
- A name ending in `.` is absolute. A name without it is relative to the origin.

Both directives apply from the point they appear until changed. A second `$ORIGIN` can deliberately switch to a child or reverse zone, but it is easy to lose track of the current suffix.

## Relative names, absolute names and the missing dot

Inside `example.com.`:

| Written | Becomes |
|---|---|
| `www` | `www.example.com.` |
| `www.example.com` | `www.example.com.example.com.` |
| `www.example.com.` | `www.example.com.` |
| `@` | `example.com.` |
| `mail` in `IN MX 10 mail` | `mail.example.com.` |
| `mail.example.com.` in MX | `mail.example.com.` (absolute) |

The failure mode is subtle: a record that looks right in the file but expands to a different name. Always use a trailing dot for fully qualified targets, especially in `MX`, `NS`, `SRV`, `CNAME`, `DNAME`, `PTR` and `SVCB/HTTPS` records.

## Omitted owners and multi-line records

If a line begins with whitespace, the owner is omitted and the previous owner is reused.

```text
@ IN SOA ns1.example.com. hostmaster.example.com. (
  2026110501 ; serial
  3600       ; refresh
  900        ; retry
  1209600    ; expire
  300 )      ; negative TTL

  IN NS ns1.example.com.
  IN NS ns2.example.net.
```

The second and third lines inherit the owner `@`. This is common in SOA and RRset blocks, and a common source of “the record attached to the wrong name”.

Parentheses let a record span lines. Semicolons start comments. Do not put a semicolon inside an unquoted string unless you mean a comment.

## Classes, TTLs and record order

Most records use class `IN`. TTL can be explicit or inherited:

```text
www     3600  IN  A     192.0.2.80
www           IN  AAAA  2001:db8::80
mail          IN  A     192.0.2.25
```

Records can appear in any order, but the zone must contain exactly one SOA at the apex and at least one NS. Apex NS targets should be resolvable; in-bailiwick targets need glue A/AAAA records in the same zone.

## The semantic rules that break zones

`named-checkzone` enforces many of these, and BIND may refuse to load a zone that violates them:

- Exactly one SOA at the apex.
- At least one NS at the apex; two or more for resilience.
- An in-zone NS target needs A/AAAA glue.
- A CNAME cannot coexist with other ordinary data and cannot be at the apex.
- MX, NS and SRV targets must not be CNAMEs.
- Duplicate records with the same owner/type/RDATA are harmless but usually a mistake.
- Records outside the zone origin are ignored or rejected depending on context.
- TXT strings are limited to 255 octets each; split long values into multiple quoted strings.
- TTL and SOA timers must be within valid ranges.

A CNAME is exclusive because it says “this name has no data of its own”. DNSSEC metadata such as `RRSIG` and `NSEC` may coexist; ordinary records may not.

## TXT, SPF, DKIM and DMARC

TXT records are length-prefixed strings. Long values are split:

```text
@               IN  TXT  "v=spf1 mx -all"
_dmarc          IN  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"
selector1._domainkey IN TXT "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0..."
```

- SPF is a TXT policy at the apex, not the obsolete `SPF` RR type.
- DKIM is a TXT record at `<selector>._domainkey`.
- DMARC is a TXT record at `_dmarc`.
- Keep exactly one SPF policy. Multiple policies produce a permanent error.

## Services: SRV and SVCB/HTTPS

```text
_sip._tcp   3600 IN SRV 10 60 5060 sip.example.com.
sip         3600 IN A   192.0.2.90
www         3600 IN HTTPS 1 . alpn=h2,h3
```

SRV uses priority, weight, port and target. The target must be a hostname with A/AAAA, not a CNAME.

SVCB and HTTPS describe service endpoints and parameters. They are strict and easy to break with one missing dot. Test with the real client, not only `dig`.

## `$INCLUDE` and `$GENERATE`

`$INCLUDE` inserts another master file. An optional origin applies only inside the include; the previous origin and owner are restored afterwards.

```text
$INCLUDE /etc/bind/zones/db.example.com.hosts example.com.
```

`$GENERATE` expands a range:

```text
$GENERATE 1-20 dhcp-$ A 10.20.0.$
$GENERATE 0-255 host-${0,3,d} A 192.0.2.$
```

Generated records are real records to BIND but easy to forget during review. Always validate the expanded result with `named-checkzone`.

## Reverse zones

Reverse DNS lives in `in-addr.arpa` (IPv4) or `ip6.arpa` (IPv6):

```text
$ORIGIN 2.0.192.in-addr.arpa.
$TTL 3600
@   IN SOA ns1.example.com. hostmaster.example.com. ( 2026110501 3600 900 1209600 300 )
@   IN NS  ns1.example.com.
80  IN PTR www.example.com.
25  IN PTR mail.example.com.
```

The PTR target should have a forward A/AAAA that contains the same address. Mail systems often require forward-confirmed reverse DNS.

## A complete worked zone

```text
$ORIGIN example.com.
$TTL 3600

@   IN  SOA ns1.example.com. hostmaster.example.com. (
        2026110501 ; serial
        3600       ; refresh
        900        ; retry
        1209600    ; expire
        300 )      ; negative TTL

@       IN  NS      ns1.example.com.
@       IN  NS      ns2.example.net.
ns1     IN  A       192.0.2.53
ns1     IN  AAAA    2001:db8::53

@       IN  A       192.0.2.80
@       IN  AAAA    2001:db8::80
www     IN  A       192.0.2.80
www     IN  AAAA    2001:db8::80
mail    IN  A       192.0.2.25
mail    IN  AAAA    2001:db8::25

@       IN  MX      10 mail.example.com.
@       IN  TXT     "v=spf1 mx -all"
_dmarc  IN  TXT     "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"
@       IN  CAA     0 issue "letsencrypt.org"
@       IN  CAA     0 iodef "mailto:security@example.com"

_sip._tcp   IN SRV 10 60 5060 sip.example.com.
sip         IN A   192.0.2.90

; Delegation with glue for an in-bailiwick name server.
lab         IN NS  ns1.lab.example.com.
ns1.lab     IN A   192.0.2.100
```

## Validation loop

```bash
named-checkzone example.com /etc/bind/zones/db.example.com
named-checkconf -z /etc/bind/named.conf
```

Then query the authoritative server directly:

```bash
dig @ns1.example.com example.com SOA +norecurse
dig @ns1.example.com www.example.com A +norecurse
dig @ns1.example.com missing.example.com A +norecurse
```

## Simulate it

- [Zone file — origin, SOA, records and named-checkzone](#/sim/bind-zone-file)
- [Authoritative answers — AA, NXDOMAIN and NODATA](#/sim/bind-authoritative-answer)

## References and further reading

- [RFC 1035 — Domain names implementation](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2308 — Negative caching](https://www.rfc-editor.org/rfc/rfc2308)
- [RFC 7208 — Sender Policy Framework (SPF)](https://www.rfc-editor.org/rfc/rfc7208)
- [RFC 6376 — DomainKeys Identified Mail (DKIM)](https://www.rfc-editor.org/rfc/rfc6376)
- [RFC 7489 — DMARC](https://www.rfc-editor.org/rfc/rfc7489)
- [RFC 9460 — SVCB and HTTPS records](https://www.rfc-editor.org/rfc/rfc9460)
- [BIND 9 ARM — zone file](https://bind9.readthedocs.io/en/latest/chapter3.html)

Next: [DNS records and the rules that break zones](#/learn/bind-05-records).
