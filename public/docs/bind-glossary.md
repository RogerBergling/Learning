# BIND & DNS glossary

Terms used throughout the BIND track, in plain language.

## A–C

**AA bit** — Authoritative answer. The responding server owns the zone. It does not mean the answer is signed or validated.

**ACL** — Access control list. A named list of addresses, keys or nested elements used by `allow-query`, `allow-recursion`, `allow-transfer`, `match-clients` and similar directives.

**AD bit** — Authenticated data. A validating resolver proved the DNSSEC chain for the answer. Only meaningful from a resolver you trust.

**Apex** — The top of a zone, written `@` in a master file. The apex owns the SOA and NS records and cannot be a CNAME.

**Authoritative server** — A server that answers from zone data it owns, with `AA=1`.

**AXFR** — Full zone transfer over TCP. Expensive for large zones; must be restricted.

**Bailiwick** — The part of the DNS namespace for which a zone is authoritative. In-bailiwick NS targets need glue.

**BIND** — The Internet Systems Consortium DNS server and toolkit. `named` is the server process.

**Cache** — Temporary storage of DNS answers, bounded by TTL.

**CAA** — Certificate Authority Authorization. A record that limits which CAs may issue certificates for a domain.

**CD bit** — Checking disabled. A query flag that asks a validating resolver not to validate. Diagnosis only.

**CDS / CDNSKEY** — Child-published records used in some automated DS provisioning workflows.

**CNAME** — Canonical name alias. Exclusive at its owner and forbidden at the apex.

**Catalog zone** — A special zone used to provision member zones across a BIND fleet.

**Chain of trust** — The path from a trust anchor through DS and DNSKEY records to a signed RRset.

**CHAOS class** — A DNS class used for server metadata such as `version.bind`. Not the Internet class `IN`.

**Cookie (DNS)** — An EDNS option that helps validate that a response came from the server that received the query.

**Control channel** — The management path used by `rndc`. Must be protected with ACLs and TSIG.

## D–H

**Delegation** — The parent-side NS records that hand authority for a child zone to another set of servers.

**DNAME** — A record that redirects an entire subtree by synthesizing CNAMEs.

**DNSSEC** — DNS extensions that authenticate origin and integrity through signatures and a chain of trust.

**DNSKEY** — A public key published at a zone apex. Flags 256 = ZSK, 257 = KSK/SEP.

**DS** — Delegation Signer. A parent-side digest of a child KSK; the trust hand-off.

**DoH** — DNS over HTTPS. Protects the transport to a resolver; does not replace DNSSEC.

**DoT** — DNS over TLS. Usually port 853; protects the client-to-resolver path.

**Dynamic update** — RFC 2136 changes to zone data at runtime. Must be authenticated and scoped.

**EDE** — Extended DNS Error. A structured EDNS option that explains failures.

**EDNS** — Extension Mechanisms for DNS. Adds options and larger UDP payloads.

**EXPIRE** — The SOA timer after which a secondary stops serving a zone it cannot refresh.

**Forwarder** — A resolver that sends queries upstream instead of doing full recursion.

**FQDN** — Fully qualified domain name, complete to the root, normally written with a trailing dot.

**Glue** — A/AAAA records in the parent for in-bailiwick name servers. They break the delegation circular dependency.

**Hidden primary** — A primary that serves transfers to secondaries but is not listed in the public NS set.

## I–R

**IXFR** — Incremental zone transfer. Sends only changes since a known serial.

**Journal** — A file recording zone changes, used for IXFR and crash recovery. Part of the zone state.

**KAS / KSK** — Key signing key. Signs the DNSKEY RRset and is referenced by the parent DS. Usually flags 257.

**Key tag** — A 16-bit identifier derived from a DNSKEY, used by RRSIG and DS.

**Lame delegation** — A delegation to a server that is not actually authoritative for the child.

**Master file** — A zone file: text records plus `$ORIGIN`, `$TTL`, `$INCLUDE` and `$GENERATE`.

**MX** — Mail exchanger. Lower preference is tried first. Target must not be a CNAME.

**Negative caching** — Caching of NXDOMAIN and NODATA, bounded by the SOA minimum/negative TTL.

**NODATA** — The name exists, but the requested type does not. NOERROR with zero answers.

**NOTIFY** — A hint from a primary to a secondary that a zone changed. Not the transfer itself.

**NS** — Name server record. Defines authority at an apex or a delegation in a parent.

**NSEC** — DNSSEC denial-of-existence by canonical ordering. Allows zone walking.

**NSEC3** — Hashed denial-of-existence. Harder to walk, more CPU.

**NSEC3PARAM** — Apex record publishing NSEC3 algorithm, flags, iterations and salt.

**NXDOMAIN** — The queried name does not exist.

**Open resolver** — A resolver that performs recursion for arbitrary clients. An abuse and security risk.

**Origin** — The current suffix used to expand relative names, set by `$ORIGIN` or the zone declaration.

**PTR** — Reverse-DNS record mapping an address to a name.

**Primary** — A server that owns the source data for a zone and can transfer it to secondaries.

**Primaries** — The source list a secondary contacts for transfers.

**QNAME minimisation** — A privacy technique that sends only the minimum name needed at each delegation step.

**RA bit** — Recursion available. The server offers recursion; the ACL may still refuse.

**RCODE** — DNS response status: NOERROR, NXDOMAIN, SERVFAIL, REFUSED, FORMERR and others.

**RD bit** — Recursion desired. A request, not a permission.

**Rdata** — The type-specific payload of a DNS record.

**Recursive resolver** — A server that follows referrals and caches answers for clients.

**Referral** — A response that points to the next set of authoritative servers.

**REFRESH** — The SOA timer controlling how often a secondary checks the primary.

**RETRY** — The SOA timer controlling how long a secondary waits after a failed check.

**RPZ** — Response Policy Zone. A DNS policy/filtering zone, usually on a resolver.

**RRL** — Response Rate Limiting. Limits repeated similar responses to reduce abuse.

**RRSIG** — A DNSSEC signature over one RRset, with algorithm, key tag, signer and validity.

**RRset** — All records at one owner, class and type. DNSSEC signs RRsets.

## S–Z

**SERIAL** — The SOA zone version. Must increase on every publish.

**SERVFAIL** — The server could not complete the resolution. Often DNSSEC, delegation, timeout or upstream failure.

**SOA** — Start of Authority. Defines the zone primary, responsible mailbox, serial, timers and negative TTL.

**Split horizon** — Serving different DNS data to different clients, usually with views.

**SRV** — Service locator record: priority, weight, port and target.

**Stub resolver** — A client-side resolver that asks a recursive resolver and trusts the answer.

**SVCB / HTTPS** — Service-binding records describing endpoints and parameters.

**TSIG** — Shared-secret message authentication and integrity for DNS. Used for transfers, updates and `rndc`.

**TTL** — Time to live. How long a record may be cached.

**View** — An ordered BIND policy scope selected by `match-clients` and/or `match-destinations`.

**Wildcard** — A record with `*` as the left-most label. It synthesizes answers for names that do not otherwise exist.

**Zone** — The part of the DNS tree managed by one authority, starting at an apex with SOA and NS.

**Zone cut** — The name where a parent stops being authoritative and a child begins.

**Zone transfer** — Copying zone data from a primary to a secondary via AXFR or IXFR.

**ZSK** — Zone signing key. Signs ordinary zone data. Usually flags 256.

**ZONEMD** — A zone digest record for integrity checking, especially around transfers.

## See also

- [DNS mental model](#/learn/bind-01-mental-model)
- [named.conf](#/learn/bind-03-named-conf)
- [Zone files](#/learn/bind-04-zone-files)
- [DNSSEC chain](#/learn/bind-07-dnssec-chain)
- [Troubleshooting](#/learn/bind-14-dig-troubleshooting)
- [Reference](#/learn/bind-15-reference)
