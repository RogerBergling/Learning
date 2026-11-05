# Recursion security: open resolvers, cache and rate limits

A recursive resolver will do work for anyone who can reach it. That is the feature. It is also the risk.

An **open resolver** answers recursive queries from arbitrary clients. It can be abused for amplification, reflection, cache probing and resource exhaustion, and it can put your IP on abuse blocklists.

## What an attacker gets

- **Amplification/reflection** — a small spoofed query can produce a larger answer aimed at a victim.
- **Cache probing** — an attacker can discover which internal names resolve.
- **Resource exhaustion** — random or deep names consume CPU, memory and upstream bandwidth.
- **Reputation damage** — your address appears in abuse reports.

If `recursion yes;` is set and `allow-recursion` is missing or contains `any`, assume the resolver is open until you prove otherwise from an external network.

## Scope recursion to real clients

```text
acl "resolver-clients" {
    localhost;
    localnets;
    10.20.0.0/16;
};

options {
    recursion yes;
    allow-recursion { resolver-clients; };
    allow-query-cache { resolver-clients; };
    max-cache-size 512m;
    max-recursion-queries 100;
    max-recursion-depth 10;
    dnssec-validation auto;
};
```

- `allow-recursion` is the key open-resolver control.
- `allow-query-cache` controls access to cached data and can leak internal lookups if it is broader.
- `allow-query` controls ordinary queries, including authoritative data.
- An authoritative-only server should use `recursion no;`.

If one server must be both authoritative and recursive, use views with separate policies rather than one broad rule.

## Listeners, firewall and IPv6

- Bind only the addresses you intend to serve.
- Firewall UDP and TCP 53 from the intended clients.
- Test IPv6 separately; a firewall rule for IPv4 does not cover IPv6.
- Do not rely on the firewall alone; a misconfigured ACL plus a later firewall change can expose recursion.
- Do not expose port 53 to the internet on a home router.

A firewall can hide an open resolver from your test host while leaving it reachable from elsewhere. Test from the actual untrusted path.

## Cache protections

- Use random source ports and unpredictable query IDs. BIND does this by default.
- Keep DNSSEC validation enabled to reject forged data.
- Set `max-cache-size` and monitor eviction.
- Bound recursion with `max-recursion-queries` and `max-recursion-depth`.
- Consider QNAME minimisation, DNS cookies and response rate limiting.
- Patch promptly; resolver bugs are high impact.
- Do not forward internal names to public resolvers.

## QNAME minimisation

QNAME minimisation (RFC 7816) sends only the minimum name needed at each delegation step. Instead of asking the root for `www.example.com`, the resolver asks for `com`, then `example.com`, then the full name.

Benefits:

- less information leaked to upper-level servers;
- smaller queries;
- reduced cache-poisoning surface.

Trade-offs:

- more queries;
- some broken authoritative servers;
- operational complexity.

It is a privacy improvement, not a replacement for DNSSEC.

## DNS cookies

DNS cookies (RFC 7873) add a lightweight client/server cookie to EDNS. They help validate that a response came from the server that received the query and reduce some spoofing and off-path attacks.

They are not authentication and not encryption. They complement ACLs, DNSSEC and rate limiting.

## Response Rate Limiting (RRL)

RRL limits repeated similar responses, reducing amplification abuse.

```text
rate-limit {
    responses-per-second 20;
    window 5;
    slip 2;
};
```

- Tune for legitimate query patterns.
- Monitor RRL drops; a high rate may indicate abuse or an overly strict limit.
- RRL is defence in depth, not a substitute for a correct recursion ACL.

## Forwarders and trust

A forwarder sends queries to an upstream resolver:

```text
options {
    forwarders { 192.0.2.1; 192.0.2.2; };
    forward only;
};
```

- `forward only` uses only the forwarders; `forward first` falls back to recursion.
- Forwarding centralizes policy and egress but moves trust to the upstream.
- A public resolver sees your queries; a private resolver may see your internal names.
- If you forward internal names, make sure the upstream is allowed to see them.
- DNSSEC validation can happen locally or upstream; know which.

## Home-lab guidance

At home:

- Run the resolver on the LAN only.
- Let the router hand out the resolver via DHCP, or forward from the router to BIND.
- Do not expose port 53 to the internet.
- Decide which component caches and which validates DNSSEC.
- Keep query logging off or short-lived; DNS logs reveal browsing behaviour.
- If you use Pi-hole/AdGuard Home, understand whether it is the resolver, a forwarder or both.

A home resolver that silently fails makes every device look broken. Monitor it.

## Testing from outside

From a network that should not have recursion:

```bash
dig @203.0.113.53 example.com A +recurse
dig @203.0.113.53 isc.org A +recurse
```

If you get a recursive answer, the ACL is wrong. Test IPv4 and IPv6, and test from every client class you intend to allow.

Other checks:

```bash
dig @203.0.113.53 version.bind CH TXT
dig @203.0.113.53 hostname.bind CH TXT
```

`version none;` should suppress version disclosure. Some builds still answer other CHAOS queries; decide whether that is acceptable.

## Hardening checklist

- [ ] `recursion no;` on authoritative-only servers.
- [ ] Resolver `allow-recursion` restricted to known clients.
- [ ] `allow-query-cache` equally restricted.
- [ ] IPv4 and IPv6 firewall rules.
- [ ] `max-cache-size`, recursion limits.
- [ ] `dnssec-validation auto;`
- [ ] `version none;`
- [ ] Patched BIND and OS.
- [ ] RRL/cookies where appropriate.
- [ ] Query rate and REFUSED monitored.

## Simulate it

- [Open resolver — recursion exposure and amplification](#/sim/bind-open-resolver)

## References and further reading

- [RFC 5358 — Preventing use of recursive name servers for DDoS attacks](https://www.rfc-editor.org/rfc/rfc5358)
- [RFC 7816 — DNS query name minimisation](https://www.rfc-editor.org/rfc/rfc7816)
- [RFC 7873 — DNS cookies](https://www.rfc-editor.org/rfc/rfc7873)
- [RFC 8484 — DNS over HTTPS](https://www.rfc-editor.org/rfc/rfc8484)
- [RFC 7858 — DNS over TLS](https://www.rfc-editor.org/rfc/rfc7858)
- [BIND 9 ARM — response rate limiting](https://bind9.readthedocs.io/en/latest/reference.html#response-rate-limiting)
- [BIND 9 ARM — allow-recursion](https://bind9.readthedocs.io/en/latest/reference.html#allow-recursion)

Next: [Zone transfers, TSIG, NOTIFY and secondaries](#/learn/bind-10-transfers-tsig).
