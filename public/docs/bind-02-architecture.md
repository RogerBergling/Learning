# How BIND is built and where its files live

BIND is the Internet Systems Consortium DNS server and toolkit. The server process is `named`. The rest of the package — `named-checkconf`, `named-checkzone`, `dig`, `delv`, `nsupdate`, `rndc` — is how you inspect, validate and operate it.

This chapter is about the physical layout: which file does what, which paths must be writable, and where a “works on my laptop, fails in the container” problem usually comes from.

## The process and its files

`named` reads a configuration file (normally `named.conf`), loads zone data, establishes listeners and writes runtime state.

A typical Debian/Ubuntu layout separates files by trust and writability:

| Path | Purpose | Writable by the service? |
|---|---|---|
| `/etc/bind/named.conf` | Main configuration entry point | No, managed by change control |
| `/etc/bind/named.conf.options` | Options include | No |
| `/etc/bind/named.conf.local` | Local zone declarations | No |
| `/etc/bind/db.*` or `/etc/bind/zones/*` | Zone files | No, except dynamic-update zones |
| `/var/cache/bind` | Working directory, journals, managed keys | Yes |
| `/var/log/named` | File log channels | Yes |
| `/run/named` | PID and control socket | Yes |

The exact paths are a packaging choice. What matters is that `directory`, `key-directory`, every zone `file`, every `journal` and every log channel point where the service can actually read or write in its sandbox.

Container images often use `/etc/bind` and `/var/cache/bind` too, but the image and the bind mount must agree. Absolute paths are a common source of “it works on the host, fails in the container”.

## Configuration is textual and include-based

`named.conf` is a sequence of statements ending in semicolons. A statement may have a block:

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

`include` splices another file into the current context:

```text
include "/etc/bind/named.conf.options";
include "/etc/bind/named.conf.local";
```

Consequences:

- A missing include is fatal.
- Including the same file twice can create duplicate zones or duplicate options.
- An include inside a `view` inherits that view.
- Include order matters for options that are first-wins or last-wins in your branch.
- Relative paths depend on `directory` and the process working directory.

Review the whole include tree, not only the entry point.

## Roles are configuration, not separate binaries

| Role | Shape | Threat model |
|---|---|---|
| Authoritative primary | `type primary`, own zone files, transfers to secondaries | Public data; protect transfers and updates |
| Authoritative secondary | `type secondary`, pulls transfers, keeps a local copy | Needs authenticated transfers and enough disk |
| Recursive resolver | `recursion yes`, `allow-recursion`, cache, DNSSEC validation | Must not be an open resolver |
| Forwarder | `forwarders`, `forward only` or `forward first` | Trust moves to the upstream resolver |
| Hidden primary | Serves transfers but is not in the public NS set | Smaller attack surface; must still be protected |
| Stealth / internal resolver | Serves internal clients only | Views, ACLs and query privacy |

A public authoritative server should not be an open resolver. A resolver should not accept untrusted dynamic updates. A hidden primary should not expose `rndc` or statistics to the internet.

## Root hints and trust anchors

A recursive resolver needs a starting point:

- **Root hints** — the bootstrap list of root server addresses, usually built into BIND.
- **Trust anchor** — the root KSK (or a locally managed anchor) used by `dnssec-validation auto`.

Both are security-sensitive. A stale trust anchor can make every signed answer bogus. Root hints that are manually overridden can send queries to the wrong place. Prefer the built-in root hints and the managed trust anchor unless you have a deliberate private-root design.

## What `named-checkconf` and `named-checkzone` can prove

Run them with the exact BIND binary and the production paths:

```bash
named-checkconf -z /etc/bind/named.conf
named-checkzone example.com /etc/bind/zones/db.example.com
```

They validate:

- configuration grammar and include resolution;
- zone loading and record syntax;
- SOA/NS presence and some semantic rules;
- CNAME conflicts, targets and other record constraints;
- TTL and SOA timer ranges.

They do **not** prove:

- the live parent delegation points at your servers;
- glue is correct in the parent;
- the DNSSEC chain from the root is intact;
- the firewall allows UDP/TCP 53 and TCP for transfers;
- secondaries actually transfer;
- permissions, AppArmor/SELinux labels or container mounts are correct;
- your clock is accurate.

Static validation is a gate, not an observability tool.

## Package, systemd and sandbox layout

On a Linux host, the service usually runs as a dedicated user (`bind` or `named`). A hardened systemd unit may include:

```text
[Service]
User=bind
Group=bind
ExecStart=/usr/sbin/named -f -u bind
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/cache/bind /run/named /var/log/named
```

Exact directives differ by distribution. The principle is: BIND needs to read configuration and zone files, bind port 53 and write runtime state. It does not need the whole filesystem.

AppArmor or SELinux can block paths that look fine to `ls`. If a zone loads manually but fails under the service, check the audit log and the actual service context.

## Containers

A container image should keep the same separation:

- configuration and zone files mounted read-only;
- a writable `/var/cache/bind` for journals and keys;
- no Docker socket;
- a non-root user where the image supports it;
- dropped capabilities except the ability to bind 53, or a high port behind a proxy;
- a healthcheck that queries the local server, not just checks the process.

Do not bake TSIG secrets or DNSSEC private keys into an image. Mount them from a secret store with restrictive permissions.

## A safe file review order

1. Read the entry point and every include.
2. List every zone, its type, file and view.
3. Check `directory`, `key-directory`, journals and log paths.
4. Confirm the service user can read/write exactly those paths.
5. Run `named-checkconf -z`.
6. Run `named-checkzone` for each zone.
7. Compare with the previous version.
8. Check the live delegation and DNSSEC state from outside.

## Simulate it

- [named.conf — options, ACLs, views and validation](#/sim/bind-named-conf)
- [DNS change workflow — validate, diff, deploy and roll back](#/sim/bind-change-workflow)

## References and further reading

- [BIND 9 Administrator Reference Manual](https://bind9.readthedocs.io/en/latest/)
- [BIND 9 configuration reference](https://bind9.readthedocs.io/en/latest/reference.html)
- [ISC BIND documentation](https://www.isc.org/bind/)
- [RFC 1034 — Domain names](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 1035 — Domain names implementation](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 8499 — DNS terminology](https://www.rfc-editor.org/rfc/rfc8499)

Next: [named.conf: options, ACLs, views and includes](#/learn/bind-03-named-conf).
