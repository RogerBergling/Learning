# named.conf: options, ACLs, views and includes

`named.conf` is small enough to read in one sitting and large enough to hide an open resolver in one line. This chapter is the operator view: what each policy block controls and which mistakes are worth reviewing every time.

## Grammar

BIND configuration is a sequence of statements ending in semicolons. A statement may contain a block.

```text
options {
    directory "/var/cache/bind";
    listen-on port 53 { 127.0.0.1; 192.0.2.53; };
    recursion no;
};

zone "example.com" {
    type primary;
    file "/etc/bind/zones/db.example.com";
};
```

Comments are `//`, `#` or `/* ... */`. Quoted strings hold names, paths and secrets. Most production failures are not grammar errors; they are semantic mismatches between what the author meant and what BIND does.

## The options block is the policy surface

Ask these questions and make the answers explicit:

| Question | Directive |
|---|---|
| Who may query? | `allow-query` |
| Who may recurse? | `recursion`, `allow-recursion` |
| Who may read the cache? | `allow-query-cache` |
| Who may transfer? | `allow-transfer` |
| Who may update? | `allow-update`, `update-policy` |
| Do we validate DNSSEC? | `dnssec-validation` |
| Where do files live? | `directory`, `key-directory`, `file`, `journal` |
| Where do queries arrive? | `listen-on`, `listen-on-v6` |
| How do we observe it? | `logging`, `statistics-channels`, `querylog` |
| How do we manage it? | `controls` |

A safe authoritative-only baseline:

```text
options {
    directory "/var/cache/bind";
    listen-on port 53 { 127.0.0.1; 192.0.2.53; };
    listen-on-v6 port 53 { ::1; 2001:db8::53; };
    recursion no;
    allow-transfer { none; };
    allow-update { none; };
    version none;
    minimal-responses yes;
    dnssec-validation auto;
};
```

A safe resolver baseline:

```text
acl "resolver-clients" {
    localhost;
    localnets;
    10.20.0.0/16;
};

options {
    directory "/var/cache/bind";
    listen-on port 53 { 127.0.0.1; 192.0.2.53; };
    recursion yes;
    allow-recursion { resolver-clients; };
    allow-query-cache { resolver-clients; };
    max-cache-size 512m;
    max-recursion-queries 100;
    max-recursion-depth 10;
    dnssec-validation auto;
    version none;
};
```

## Listeners are not access control

`listen-on` and `listen-on-v6` decide which sockets BIND binds. They do not decide who may query, recurse or transfer.

- `listen-on { any; };` binds every IPv4 address. On a multi-homed host that may expose an interface you forgot about.
- `listen-on-v6 { any; };` does the same for IPv6.
- A wildcard listener plus a permissive ACL is a common accidental exposure.
- A narrow listener plus a firewall is defence in depth, not a substitute for either.

Test from the actual network. A firewall can hide an open resolver from your test host while leaving it reachable from the internet.

## ACLs: reuse, ordering and negation

An ACL is a named list of address, key or nested match elements. Predefined ACLs include `any`, `none`, `localhost`, `localnets` and others.

```text
acl "resolver-clients" {
    127.0.0.1;
    ::1;
    10.20.0.0/16;
    !10.20.99.0/24;
    key "resolver-client-key";
};
```

Rules:

- Prefer named ACLs over repeating address lists.
- Write a test matrix: inside, outside and excluded.
- Test IPv4 and IPv6 separately.
- Remember that a key entry is not an address; it authenticates a TSIG-signed request.
- Negation and ordering are easy to misread. Review the expanded logic, not the name.

`allow-query`, `allow-recursion`, `allow-query-cache`, `allow-transfer`, `allow-update` and `match-clients` are different controls. Tightening one does not tighten the others.

## Zones and views

A zone declaration names the zone, sets its type and points at a file:

```text
zone "example.com" {
    type primary;
    file "/etc/bind/zones/db.example.com";
    allow-transfer { 192.0.2.54; key "xfr-key"; };
    notify yes;
    also-notify { 192.0.2.54; };
};
```

A view is an ordered policy scope:

```text
view "internal" {
    match-clients { 10.20.0.0/16; };
    recursion yes;
    allow-recursion { 10.20.0.0/16; };
    zone "corp.example" {
        type primary;
        file "/etc/bind/zones/db.corp.example";
    };
};

view "external" {
    match-clients { any; };
    recursion no;
    allow-query { any; };
};
```

Rules:

- Views are evaluated in order; the first matching `match-clients` wins.
- A catch-all `match-clients { any; };` before a specific view makes the specific view unreachable.
- Every view needs its own zone data and DNSSEC state if the answers differ.
- Test every client network, including IPv6, NAT boundaries and internal VPN ranges.

## Transfers, updates and TSIG

Global default deny, then opt in per zone:

```text
options {
    allow-transfer { none; };
    allow-update { none; };
};

key "xfr-key" {
    algorithm hmac-sha256;
    secret "BASE64-SECRET";
};

zone "example.com" {
    type primary;
    file "/etc/bind/zones/db.example.com";
    allow-transfer { 192.0.2.54; key "xfr-key"; };
};
```

Dynamic updates belong in `update-policy`, not a broad `allow-update`:

```text
update-policy {
    grant "dhcp-key" self *.dhcp.example.com. A AAAA PTR;
};
```

Never use `allow-update { any; };` on a reachable server. See [zone transfers and TSIG](#/learn/bind-10-transfers-tsig) and [views, RPZ and dynamic updates](#/learn/bind-11-views-rpz).

## Logging and management

A bounded logging channel:

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
    category update { main; };
};
```

Protect management endpoints:

```text
controls {
    inet 127.0.0.1 port 953 allow { 127.0.0.1; } keys { "rndc-key"; };
};

statistics-channels {
    inet 127.0.0.1 port 8053 allow { 127.0.0.1; };
};
```

Do not expose `rndc` or statistics on a public interface. A management channel with a weak or missing key is effectively remote control.

## Common semantic failures

| Symptom | Likely cause |
|---|---|
| `named` will not start | Missing include, bad path, duplicate zone or syntax error |
| Zone loads but answers wrong | Wrong `$ORIGIN`, relative target without a dot, wrong view |
| `dig` gets REFUSED | `allow-query`, `allow-recursion` or a view does not match the client |
| Transfer denied | `allow-transfer`, TSIG name/algorithm/secret or TCP/53 |
| Dynamic update refused | `update-policy` name/type mismatch or wrong key |
| Internal names leak | Catch-all view first, or a zone accidentally present in the external view |
| DNSSEC bogus | Wrong DS, missing DNSKEY, expired RRSIG or a broken trust anchor |

## Review checklist

1. Run `named-checkconf -z` with the production binary.
2. Trace every include and confirm its context.
3. Check listeners and firewall coverage for IPv4 and IPv6.
4. Confirm recursion, cache and transfer policy.
5. Confirm dynamic-update authentication and journals.
6. Confirm DNSSEC validation or signing policy.
7. Confirm logging, statistics and `rndc` protection.
8. Confirm paths, permissions and container mounts.
9. Compare with the previous version and keep a rollback.

## Simulate it

- [named.conf — options, ACLs, views and validation](#/sim/bind-named-conf)
- [Open resolver — recursion exposure and amplification](#/sim/bind-open-resolver)

## References and further reading

- [BIND 9 configuration reference](https://bind9.readthedocs.io/en/latest/reference.html)
- [BIND 9 ARM — access control lists](https://bind9.readthedocs.io/en/latest/reference.html#access-control-lists)
- [BIND 9 ARM — views](https://bind9.readthedocs.io/en/latest/reference.html#view-statement-grammar)
- [RFC 8945 — Secret Key Transaction Authentication for DNS (TSIG)](https://www.rfc-editor.org/rfc/rfc8945)
- [RFC 2136 — Dynamic Updates in the Domain Name System](https://www.rfc-editor.org/rfc/rfc2136)

Next: [Zone files from first principles](#/learn/bind-04-zone-files).
