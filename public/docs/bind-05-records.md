# DNS records and the rules that break zones

A record type is not just a syntax. Each type has an operational contract: what it may coexist with, what its target must be, whether it needs DNSSEC, and what breaks when it is wrong.

This chapter is the working reference for the records used in the track.

## Address records: A and AAAA

```text
www     3600 IN A     192.0.2.80
www     3600 IN AAAA  2001:db8::80
```

- `A` maps a name to one IPv4 address.
- `AAAA` maps a name to one IPv6 address.
- Multiple addresses at one owner form one RRset. Clients may choose any of them; this is not a priority list.
- Publish AAAA only when the service actually listens on IPv6. A broken AAAA causes slow fallbacks and failed connections.

Reverse DNS is separate: a `PTR` in `in-addr.arpa` or `ip6.arpa` should point at a name whose forward A/AAAA contains the same address.

## Aliases: CNAME and DNAME

```text
www     3600 IN CNAME web.example.net.
old     3600 IN DNAME new.example.net.
```

`CNAME` says “this name is an alias; resolve the target instead”.

Rules:

- It must be the only ordinary data at its owner (DNSSEC metadata aside).
- It cannot be at the zone apex because SOA and NS already live there.
- MX, NS and SRV targets must not be CNAMEs.
- A CNAME chain adds latency and failure points; point at the final canonical name where possible.

`DNAME` redirects an entire subtree by synthesizing CNAMEs below its owner. It is powerful and rarely needed. Test the whole subtree, including names that do not exist yet. DNAME cannot coexist with a CNAME at the same owner.

## Name server records: NS

```text
@       IN NS ns1.example.com.
@       IN NS ns2.example.net.
child   IN NS ns1.child.example.com.
ns1.child IN A 192.0.2.100   ; glue in the parent
```

- Apex NS records define the zone’s authoritative servers.
- A delegation is an NS RRset at a child name in the parent.
- An in-bailiwick NS target needs glue A/AAAA in the parent.
- Parent NS and child apex NS should match.
- Publish at least two NS records on independent infrastructure.

Do not point NS targets at CNAMEs. Do not put ordinary data below a delegation in the parent; it is not authoritative there.

## Mail: MX, SPF, DKIM and DMARC

```text
@                   IN MX  10 mail1.example.com.
@                   IN MX  20 mail2.example.com.
@                   IN TXT "v=spf1 mx -all"
selector1._domainkey IN TXT "v=DKIM1; k=rsa; p=MIIBIjAN..."
_dmarc              IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"
```

- MX preference: lower value is tried first. Keep gaps so you can insert a backup later.
- MX targets must be hostnames with A/AAAA, never CNAMEs.
- A null MX is `0 .` and is exclusive; do not mix it with real MX records.
- SPF is a TXT policy at the apex. The old `SPF` RR type is obsolete.
- DKIM is a TXT record at `<selector>._domainkey`.
- DMARC is a TXT record at `_dmarc`.
- Keep exactly one SPF policy. Multiple policies are a permanent error.

Mail also depends on forward-confirmed reverse DNS, correct TLS certificates and matching HELO names. DNS records alone do not make mail deliverable.

## Service discovery: SRV, SVCB and HTTPS

```text
_sip._tcp   3600 IN SRV 10 60 5060 sip1.example.com.
_sip._tcp   3600 IN SRV 20 40 5060 sip2.example.com.
sip1        3600 IN A   192.0.2.90
www         3600 IN HTTPS 1 . alpn=h2,h3
```

SRV fields:

| Field | Meaning |
|---|---|
| Priority | Lower is preferred |
| Weight | Relative selection within the same priority |
| Port | Service port |
| Target | Hostname with A/AAAA, not a CNAME |

SVCB and HTTPS describe service endpoints and parameters for modern clients, including HTTP/3, alternative endpoints and ECH. They use a priority and target plus key/value parameters. Test with the real client; a syntactically valid record can still point clients somewhere useless.

## Security records: CAA, TLSA and SSHFP

```text
@        IN CAA 0 issue "letsencrypt.org"
@        IN CAA 0 iodef "mailto:security@example.com"
_443._tcp.www IN TLSA 3 1 1 <certificate-association>
host     IN SSHFP 1 1 <fingerprint>
```

- CAA restricts which certificate authorities may issue certificates for the domain. Publish a policy for the CAs you actually use and include an `iodef` contact.
- TLSA binds a certificate or public key to a name. It is only trustworthy with DNSSEC validation; without it, it is an assertion over the same channel an attacker may control.
- SSHFP binds an SSH host key to a name. The client must actually check it, and DNSSEC is what makes the binding trustworthy.
- For TLSA, publish the next certificate association before rotating the current one.

## DNSSEC records

| Type | Purpose |
|---|---|
| `DNSKEY` | Public key at the apex; flags 256 = ZSK, 257 = KSK/SEP |
| `RRSIG` | Signature over one RRset, with algorithm, key tag, signer and validity |
| `DS` | Parent-side digest of a child KSK; the trust hand-off |
| `NSEC` | Authenticated denial by canonical ordering; exposes zone names |
| `NSEC3` | Hashed denial of existence; harder to walk, more CPU |
| `NSEC3PARAM` | Apex parameters for NSEC3: algorithm, flags, iterations, salt |
| `CDS` / `CDNSKEY` | Child-published signals used in some automated DS workflows |

A validating resolver builds the chain from a trust anchor through DS and DNSKEY to the signed RRset. `RRSIG` and `NSEC`/`NSEC3` are DNSSEC metadata and may coexist with a CNAME.

Do not hand-edit denial records in an inline-signed zone; BIND owns them.

## Reverse records: PTR

```text
$ORIGIN 2.0.192.in-addr.arpa.
80  IN PTR www.example.com.
25  IN PTR mail.example.com.
```

PTR records are ordinary records in a reverse zone. They do not automatically stay in sync with forward A/AAAA records. DHCP and IPAM tools often update both; manual changes must update both.

Forward-confirmed reverse DNS means: the PTR name resolves forward to an A/AAAA that includes the queried address. Many mail systems require it.

## Other useful types

| Type | Use | Note |
|---|---|---|
| `TXT` | Policy, verification, arbitrary text | 255-octet strings; split long values |
| `NAPTR` | Service discovery / regexp rules | Complex; test with the real client |
| `URI` | Publish a service URI | Rarely used by browsers |
| `HINFO` | Host CPU/OS information | Usually an information leak; avoid |
| `RP` | Responsible person | Informational |
| `LOC` | Geographic location | Informational |
| `CERT` | Certificate metadata | Niche |
| `ZONEMD` | Zone digest | Integrity for zone transfers; verify support |
| `OPENPGPKEY` | OpenPGP public key | Niche |
| `CSYNC` | Child-to-parent synchronization | DNSSEC automation workflows |
| `TYPE` | Unknown/private type | BIND preserves the raw data |

Unknown record types are preserved by BIND and by the reference tooling. Do not delete data you do not understand just because a browser analyzer does not have a label for it.

## The rules that cause most incidents

1. CNAME at the apex.
2. CNAME next to A, MX or TXT.
3. MX or NS target pointing at a CNAME.
4. Missing trailing dot in a target.
5. Missing glue for an in-bailiwick NS.
6. AAAA published without IPv6 connectivity.
7. Multiple SPF TXT records.
8. PTR that does not match forward DNS.
9. NSEC3 iterations set too high.
10. DS published before the child DNSKEY exists.

## Simulate it

- [Zone file — origin, SOA, records and named-checkzone](#/sim/bind-zone-file)
- [Home lab — BIND, DHCP and a private DNS domain](#/sim/bind-home-lab)

## References and further reading

- [RFC 1035 — Resource records](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2181 — Clarifications](https://www.rfc-editor.org/rfc/rfc2181)
- [RFC 7208 — SPF](https://www.rfc-editor.org/rfc/rfc7208)
- [RFC 6376 — DKIM](https://www.rfc-editor.org/rfc/rfc6376)
- [RFC 7489 — DMARC](https://www.rfc-editor.org/rfc/rfc7489)
- [RFC 8659 — CAA](https://www.rfc-editor.org/rfc/rfc8659)
- [RFC 6698 — DANE/TLSA](https://www.rfc-editor.org/rfc/rfc6698)
- [RFC 4255 — SSHFP](https://www.rfc-editor.org/rfc/rfc4255)
- [RFC 9460 — SVCB and HTTPS](https://www.rfc-editor.org/rfc/rfc9460)
- [IANA DNS parameters](https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml)

Next: [SOA, NS, TTL and delegation](#/learn/bind-06-soa-ns-delegation).
