import { add, del, ITEM, cfg } from './helpers.js';

/* BIND & DNS simulations. All names, addresses, keys and servers are
   documentation values (RFC 2606 / RFC 5737). Nothing here contacts DNS. */

const LABELS = {
  client: { name: 'Client / dig', sub: 'stub resolver · UDP/TCP 53' },
  home: { name: 'Home devices', sub: 'laptop · phone · IoT' },
  router: { name: 'Home router', sub: 'DHCP · DNS forwarder' },
  resolver: { name: 'Recursive resolver', sub: 'BIND · cache · DNSSEC' },
  root: { name: 'Root servers', sub: 'root hints · trust anchor' },
  tld: { name: 'TLD servers', sub: 'com · net · org' },
  parent: { name: 'Parent zone', sub: 'registry · NS · DS' },
  primary: { name: 'Authoritative primary', sub: 'named · zone files' },
  secondary: { name: 'Secondary', sub: 'AXFR/IXFR · journal' },
  admin: { name: 'DNS operator', sub: 'shell · change control' },
  monitor: { name: 'Logs & monitoring', sub: 'queries · transfers · DNSSEC' },
};

export const bindRecursiveQuery = {
  id: 'bind-recursive-query',
  title: 'Recursive query — stub, cache, root, TLD and authoritative',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-query',
  level: 'core',
  minutes: 12,
  tags: ['DNS', 'recursion', 'cache', 'referral', 'TTL', 'AA', 'RD', 'RA'],
  summary:
    'Follow one A query from a stub resolver through a recursive BIND resolver, the root and TLD referrals, and the authoritative server. See exactly what is cached and which flags each response carries.',
  nodes: ['client', 'resolver', 'root', 'tld', 'primary', 'monitor'],
  stores: ['dnsclient', 'resolver', 'internet', 'authority', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'client', to: 'resolver', badge: 'query www.example.com A', channel: 'front',
      detail:
        'The stub resolver sends a recursive query with RD=1 (recursion desired). It has no zone data and does not follow referrals itself.\n\nThe resolver checks its cache first. A cache hit returns immediately; a miss starts iterative resolution. The client never sees the root or TLD queries unless you capture them.',
      http: {
        req: ';; QUESTION SECTION:\n;www.example.com. IN A\n;; flags: rd',
        res: 'cache miss · starting iterative resolution',
      },
      vault: [
        add('dnsclient', ITEM.query({ id: 'q1', name: 'www.example.com A', meta: 'RD=1 · DO=1', value: ';; QUESTION SECTION:\n;www.example.com. IN A\n;; OPT PSEUDOSECTION:\n; EDNS: version 0; flags: do' })),
        add('resolver', ITEM.cache({ id: 'miss', name: 'Cache miss', meta: 'no RRset for www.example.com/A' })),
      ],
      tags: ['stub resolver', 'RD=1', 'cache miss'],
    },
    {
      from: 'resolver', to: 'root', badge: 'iterative query to a root server', channel: 'dns',
      detail:
        'The resolver chooses a root server from its root hints and asks the same question with RD=0. The root is authoritative for the root zone only, so it returns a referral, not the final answer.\n\nRoot servers answer with NS records for the com zone and glue for the com name servers. The resolver caches that delegation.',
      http: {
        req: ';; QUESTION SECTION:\n;www.example.com. IN A\n;; flags: rd=0',
        res: ';; AUTHORITY SECTION:\ncom. 172800 IN NS a.gtld-servers.net.\n;; ADDITIONAL SECTION:\na.gtld-servers.net. 172800 IN A 192.5.6.30',
      },
      vault: [
        add('internet', ITEM.answer({ id: 'rootref', name: 'Root referral to com', meta: 'NS + glue · TTL 172800', value: 'com. 172800 IN NS a.gtld-servers.net.\na.gtld-servers.net. 172800 IN A 192.5.6.30' })),
        add('resolver', ITEM.cache({ id: 'com', name: 'Delegation cache', meta: 'com NS + glue · TTL 172800' })),
      ],
      tags: ['root hints', 'referral', 'glue', 'RD=0'],
    },
    {
      from: 'resolver', to: 'tld', badge: 'ask a com server', channel: 'dns',
      detail:
        'The resolver asks a com server for www.example.com A. The com server is authoritative for the com zone, not for example.com, so it returns the delegation for example.com: NS records plus in-bailiwick glue for ns1.example.com.\n\nA referral is not an answer. The resolver must continue down the tree.',
      http: {
        req: ';; QUESTION SECTION:\n;www.example.com. IN A',
        res: ';; AUTHORITY SECTION:\nexample.com. 172800 IN NS ns1.example.com.\nexample.com. 172800 IN NS ns2.example.net.\n;; ADDITIONAL SECTION:\nns1.example.com. 172800 IN A 192.0.2.53',
      },
      vault: [
        add('internet', ITEM.answer({ id: 'tldref', name: 'example.com delegation', meta: 'NS + glue · TTL 172800', value: 'example.com. 172800 IN NS ns1.example.com.\nexample.com. 172800 IN NS ns2.example.net.\nns1.example.com. 172800 IN A 192.0.2.53' })),
        add('resolver', ITEM.cache({ id: 'example', name: 'Delegation cache', meta: 'example.com NS + glue' })),
      ],
      tags: ['TLD', 'delegation', 'in-bailiwick glue'],
    },
    {
      from: 'resolver', to: 'primary', badge: 'authoritative query', channel: 'dns',
      detail:
        'The resolver asks ns1.example.com directly. This server owns the example.com zone, so it answers from zone data with AA=1 (authoritative answer).\n\nThe answer includes the A RRset, its TTL, and — in a signed zone — an RRSIG over the RRset. The authoritative server does not recurse for this query.',
      http: {
        req: ';; QUESTION SECTION:\n;www.example.com. IN A\n;; flags: rd=0',
        res: ';; flags: qr aa\n;; ANSWER SECTION:\nwww.example.com. 3600 IN A 192.0.2.80\nwww.example.com. 3600 IN RRSIG A 13 3 3600 ...',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'authans', name: 'Authoritative answer', meta: 'AA=1 · NOERROR · TTL 3600', value: ';; flags: qr aa\nwww.example.com. 3600 IN A 192.0.2.80' })),
        add('authority', ITEM.rrset({ id: 'www-a', name: 'www.example.com A', meta: 'one RR · TTL 3600', value: 'www.example.com. 3600 IN A 192.0.2.80' })),
        add('authority', ITEM.rrsig({ id: 'www-sig', name: 'RRSIG A', meta: 'algorithm 13 · key tag 12345', value: 'www.example.com. 3600 IN RRSIG A 13 3 3600 20261231235959 20261101000000 12345 example.com. ...' })),
      ],
      tags: ['AA=1', 'authoritative', 'RRSIG', 'round trip'],
    },
    {
      from: 'primary', to: 'resolver', badge: 'answer cached', channel: 'back',
      detail:
        'The resolver receives the answer, validates DNSSEC if DO was set and validation is enabled, then caches the RRset for its TTL (3600 seconds here).\n\nThe cache entry is keyed by name, type and class, with the validated state. A later query for the same RRset can be answered without touching the authoritative server.',
      http: {
        res: ';; flags: qr aa rd ra ad\n;; ANSWER SECTION:\nwww.example.com. 3600 IN A 192.0.2.80',
      },
      vault: [
        add('resolver', ITEM.cache({ id: 'hit', name: 'Validated cache entry', meta: 'www.example.com A · TTL 3600', value: 'www.example.com. 3600 IN A 192.0.2.80\nvalidation: secure (AD=1)' })),
      ],
      tags: ['cache', 'TTL', 'AD=1', 'validation'],
    },
    {
      from: 'resolver', to: 'client', badge: 'response to stub · RA=1', channel: 'back',
      detail:
        'The resolver returns the answer with RA=1 (recursion available) and AD=1 if it validated the data. The stub resolver trusts its configured resolver; it does not perform DNSSEC validation itself.\n\nTTL in the response counts down from the cached value, so a cache hit may show a smaller TTL than the authoritative answer.',
      http: {
        res: ';; flags: qr rd ra ad\n;; ANSWER SECTION:\nwww.example.com. 3587 IN A 192.0.2.80',
      },
      vault: [
        add('dnsclient', ITEM.answer({ id: 'clientans', name: 'Client answer', meta: 'NOERROR · RA=1 · AD=1', value: ';; flags: qr rd ra ad\nwww.example.com. 3587 IN A 192.0.2.80' })),
      ],
      tags: ['RA=1', 'stub resolver', 'TTL countdown'],
    },
    {
      from: 'client', to: 'resolver', badge: 'second query → cache hit', channel: 'front',
      detail:
        'A second query for the same name/type is answered from cache. No root, TLD or authoritative query occurs. This is why DNS is fast and why a stale answer can survive a change.\n\nNegative answers are cached too: NXDOMAIN and NODATA use the SOA minimum/negative TTL.',
      http: {
        req: ';; QUESTION SECTION:\n;www.example.com. IN A',
        res: ';; flags: qr rd ra\n;; ANSWER SECTION:\nwww.example.com. 2100 IN A 192.0.2.80',
      },
      vault: [
        add('resolver', ITEM.cache({ id: 'hit2', name: 'Cache hit', meta: 'no upstream query', value: 'www.example.com A · 2100 s remaining' })),
      ],
      tags: ['cache hit', 'negative caching', 'TTL'],
    },
    {
      from: 'resolver', to: 'monitor', badge: 'query rate + cache metrics', channel: 'report',
      detail:
        'The resolver logs the query and updates cache metrics. Track query rate, cache hit ratio, SERVFAIL/REFUSED rates, recursion limit hits and DNSSEC validation failures.\n\nA high cache hit ratio is normal and good. A sudden drop can indicate a cache flush, a TTL change or a resolver restart.',
      vault: [
        add('dnslogs', ITEM.record({ id: 'metrics', name: 'Resolver metrics', meta: 'qps · cache hit · SERVFAIL', value: 'queries/s: 420\ncache hit: 87%\nSERVFAIL: 0.02%\nrecursion limit hits: 0' })),
      ],
      tags: ['logging', 'metrics', 'cache hit ratio'],
    },
  ],
  notes: [
    'A referral is not an answer. The AA bit belongs to the server that owns the data, not to the resolver.',
    'RD asks for recursion; RA advertises that recursion is available; neither grants access. allow-recursion decides.',
    'TTL is decremented in cache. Seeing a smaller TTL is normal, not evidence of a broken zone.',
    'DNSSEC validation is end-to-end only if your resolver validates. A client cannot trust AD from an unknown resolver.',
  ],
  config: [
    cfg('Resolver options', [
      '`recursion yes;` — this server performs recursion for allowed clients.',
      '`allow-recursion { localhost; localnets; };` — never leave this at `any`.',
      '`dnssec-validation auto;` — validate from the built-in root trust anchor.',
      '`max-cache-size 512m;` — bound memory; monitor eviction.',
      '`max-recursion-queries 100;` and `max-recursion-depth 10;` — bound work per query.',
    ]),
  ],
  pitfalls: [
    'Assuming the root or TLD server answered the final A record. They only refer.',
    'Turning off DNSSEC validation to make SERVFAIL disappear.',
    'Treating a cached TTL as the authoritative TTL.',
    'Using an open resolver because “it works from everywhere”.',
  ],
  productionChecks: [
    'Resolver has a bounded cache and explicit recursion ACL.',
    'Monitoring covers cache hit ratio and DNSSEC failures.',
    'Authoritative answers are checked with +norecurse against each NS.',
    'TTL changes are planned with the old TTL in mind.',
  ],
};

export const bindAuthoritativeAnswer = {
  id: 'bind-authoritative-answer',
  title: 'Authoritative answers — AA, NXDOMAIN and NODATA',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-query',
  level: 'core',
  minutes: 10,
  tags: ['authoritative', 'AA', 'NXDOMAIN', 'NODATA', 'SOA', 'negative caching'],
  summary:
    'Query the authoritative server directly with recursion disabled. Learn the difference between a positive answer, NXDOMAIN and NODATA, and why the negative answer still carries an SOA.',
  nodes: ['client', 'primary', 'monitor'],
  stores: ['dnsclient', 'authority', 'zonedata', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'admin', to: 'primary', badge: 'named-checkconf -z + load zone', channel: 'cli',
      detail:
        'Before the server can answer, `named-checkconf -z` parses the configuration and loads every zone. A missing file, a bad record or a zone/name mismatch prevents startup or reload.\n\nValidation is not a live test: it does not prove the parent delegation, firewall or DNSSEC chain.',
      http: {
        req: '$ named-checkconf -z /etc/bind/named.conf',
        res: 'zone example.com/IN: loaded serial 2026110501\nnamed-checkconf: no errors',
      },
      vault: [
        add('authority', ITEM.namedconf({ id: 'conf', name: 'named.conf', meta: 'options + zone declarations', value: 'options {\n  directory "/var/cache/bind";\n  recursion no;\n  allow-transfer { none; };\n};\nzone "example.com" {\n  type primary;\n  file "/etc/bind/zones/db.example.com";\n};' })),
        add('zonedata', ITEM.zone({ id: 'zone', name: 'db.example.com', meta: '$ORIGIN example.com. · SOA + NS + records', value: '$ORIGIN example.com.\n$TTL 3600\n@ IN SOA ns1.example.com. hostmaster.example.com. (\n  2026110501 3600 900 1209600 300 )\n@ IN NS ns1.example.com.\nwww IN A 192.0.2.80' })),
      ],
      tags: ['named-checkconf', 'zone load', 'static validation'],
    },
    {
      from: 'client', to: 'primary', badge: 'dig +norecurse www A', channel: 'dns',
      detail:
        'The client asks the authoritative server directly and sets RD=0. The server answers from its own zone with AA=1. `+norecurse` prevents a recursive server from silently doing work the authoritative server should not do.\n\nUse the server’s real address or name, not a public resolver, when you want to test authority.',
      http: {
        req: '$ dig @ns1.example.com www.example.com A +norecurse',
        res: ';; flags: qr aa; QUERY: 1, ANSWER: 1\n;; ANSWER SECTION:\nwww.example.com. 3600 IN A 192.0.2.80',
      },
      vault: [
        add('dnsclient', ITEM.query({ id: 'q', name: 'www.example.com A', meta: 'RD=0 · direct to ns1', value: ';www.example.com. IN A' })),
        add('authority', ITEM.answer({ id: 'a', name: 'Positive answer', meta: 'AA=1 · NOERROR · 1 answer', value: 'www.example.com. 3600 IN A 192.0.2.80' })),
      ],
      tags: ['+norecurse', 'AA=1', 'positive answer'],
    },
    {
      from: 'primary', to: 'primary', badge: 'lookup RRset in the zone', channel: 'internal',
      detail:
        'The server finds the RRset for www.example.com/A. An RRset is all records at the same owner, class and type; the whole set is returned together.\n\nIf the zone is signed, the matching RRSIG is included. DNSSEC signs RRsets, not individual rows.',
      vault: [
        add('zonedata', ITEM.rrset({ id: 'rrset', name: 'www.example.com A', meta: 'TTL 3600 · one A record', value: 'www.example.com. 3600 IN A 192.0.2.80' })),
      ],
      tags: ['RRset', 'zone lookup', 'RRSIG'],
    },
    {
      from: 'primary', to: 'client', badge: 'NXDOMAIN for a missing name', channel: 'back',
      detail:
        'A query for a name that does not exist returns NXDOMAIN with AA=1. The authority section carries the zone SOA so the resolver can cache the negative answer.\n\nNXDOMAIN means the name does not exist. It is not the same as a name that exists but has no record of the requested type.',
      http: {
        req: '$ dig @ns1.example.com missing.example.com A +norecurse',
        res: ';; ->>HEADER<<- status: NXDOMAIN, flags: qr aa\n;; AUTHORITY SECTION:\nexample.com. 300 IN SOA ns1.example.com. hostmaster.example.com. ( 2026110501 3600 900 1209600 300 )',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'nx', name: 'NXDOMAIN', meta: 'RCODE 3 · AA=1 · negative TTL', value: 'status: NXDOMAIN\nnegative cache TTL: 300 s' })),
        add('authority', ITEM.nsec({ id: 'nsec', name: 'Denial proof', meta: 'NSEC/NSEC3 proves absence', value: 'missing.example.com. NSEC ...' })),
      ],
      tags: ['NXDOMAIN', 'RCODE 3', 'negative caching', 'SOA minimum'],
    },
    {
      from: 'primary', to: 'client', badge: 'NODATA — name exists, type does not', channel: 'back',
      detail:
        'www.example.com exists, but if you ask for MX and no MX RRset exists at that owner, the response is NOERROR with zero answers and an SOA in authority. That is NODATA.\n\nNODATA is common and often mistaken for NXDOMAIN. It matters for mail, service discovery and DNSSEC denial proofs.',
      http: {
        req: '$ dig @ns1.example.com www.example.com MX +norecurse',
        res: ';; ->>HEADER<<- status: NOERROR, flags: qr aa\n;; ANSWER: 0\n;; AUTHORITY SECTION:\nexample.com. 300 IN SOA ...',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'nodata', name: 'NODATA', meta: 'NOERROR · 0 answers · SOA', value: 'status: NOERROR\nANSWER: 0\nAUTHORITY: SOA example.com.' })),
      ],
      tags: ['NODATA', 'NOERROR', 'empty answer'],
    },
    {
      from: 'primary', to: 'monitor', badge: 'query log + response code', channel: 'report',
      detail:
        'The authoritative server logs the query and the response code. Query logging is expensive at scale; enable it temporarily or sample it.\n\nFor a support case, record the exact query, server address, flags and timestamp. A screenshot of an answer without the command is not reproducible evidence.',
      vault: [
        add('dnslogs', ITEM.record({ id: 'log', name: 'Query log line', meta: 'client · qname · qtype · RCODE', value: 'client 192.0.2.10#5353: query: www.example.com IN A + (192.0.2.53)\nclient 192.0.2.10#5353: query: missing.example.com IN A + (192.0.2.53)' })),
      ],
      tags: ['querylog', 'RCODE', 'evidence'],
    },
  ],
  notes: [
    'AA=1 means the responding server owns the zone. It does not mean the answer is signed or validated.',
    'NXDOMAIN and NODATA are different. Check the RCODE and the answer count before blaming the zone.',
    'The SOA minimum and the negative TTL control how long a negative answer is cached.',
    'Query the authoritative server directly when you need to separate zone data from resolver problems.',
  ],
  config: [
    cfg('Authoritative-only server', [
      '`recursion no;` — this server should not resolve other zones.',
      '`allow-query { any; };` for a public authoritative zone, or narrower for internal zones.',
      '`allow-transfer { none; };` globally, then explicitly allow secondaries.',
      '`version none;` — do not disclose the BIND version.',
      '`minimal-responses yes;` — trim unnecessary records and reduce fragmentation.',
    ]),
  ],
  pitfalls: [
    'Testing only through a recursive resolver, which hides authority and negative-TTL behaviour.',
    'Treating NXDOMAIN as “the record is missing” when the name itself is missing.',
    'Forgetting that the SOA minimum affects negative caching.',
    'Assuming AA=1 means DNSSEC-validated.',
  ],
  productionChecks: [
    'Every authoritative NS answers the apex SOA and NS directly.',
    'Positive, NXDOMAIN and NODATA cases are tested.',
    'Negative TTL is intentional and monitored.',
    'Query logging has retention and privacy limits.',
  ],
};

export const bindZoneDelegation = {
  id: 'bind-zone-delegation',
  title: 'Delegation — parent NS, glue and the zone cut',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-query',
  level: 'advanced',
  minutes: 12,
  tags: ['delegation', 'zone cut', 'glue', 'parent', 'NS', 'lame delegation', 'DS'],
  summary:
    'Delegate a child zone correctly: publish NS records in the parent, add glue for in-bailiwick servers, keep the child apex consistent, and see how missing glue turns into SERVFAIL.',
  nodes: ['client', 'resolver', 'parent', 'primary', 'secondary', 'monitor'],
  stores: ['dnsclient', 'resolver', 'parent', 'authority', 'zonedata', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'admin', to: 'parent', badge: 'publish child NS + glue', channel: 'cli',
      detail:
        'The parent zone contains a delegation: NS records at the child name. Because ns1.child.example.com is inside the child, the parent must also carry glue A/AAAA records for it.\n\nGlue is authoritative data in the parent, not in the child. It exists only to break the circular dependency “to find the child, ask the child”.',
      http: {
        req: '$ORIGIN example.com.\nchild IN NS ns1.child.example.com.\nchild IN NS ns2.other.example.net.\nns1.child IN A 192.0.2.100',
        res: 'delegation published in the parent zone',
      },
      vault: [
        add('parent', ITEM.record({ id: 'ns', name: 'child NS set', meta: 'ns1 in-bailiwick · ns2 out-of-bailiwick', value: 'child.example.com. 3600 IN NS ns1.child.example.com.\nchild.example.com. 3600 IN NS ns2.other.example.net.' })),
        add('parent', ITEM.record({ id: 'glue', name: 'Glue A record', meta: 'parent-side address for ns1.child', value: 'ns1.child.example.com. 3600 IN A 192.0.2.100' })),
      ],
      tags: ['parent NS', 'glue', 'in-bailiwick', 'zone cut'],
    },
    {
      from: 'client', to: 'resolver', badge: 'resolve app.child.example.com', channel: 'front',
      detail:
        'A client asks for a name below the delegated child. The resolver follows referrals from the root down. At the parent, the NS RRset for child.example.com marks the zone cut: the parent stops being authoritative at and below that name.',
      vault: [
        add('dnsclient', ITEM.query({ id: 'q', name: 'app.child.example.com A', meta: 'RD=1', value: ';app.child.example.com. IN A' })),
      ],
      tags: ['zone cut', 'referral', 'NS'],
    },
    {
      from: 'resolver', to: 'parent', badge: 'ask parent for the child', channel: 'dns',
      detail:
        'The parent returns the child NS set and the glue. The resolver caches the delegation and then asks one of the child name servers directly.\n\nOut-of-bailiwick NS targets need their own resolution and should not have glue in this parent.',
      http: {
        req: ';; QUESTION SECTION:\n;app.child.example.com. IN A',
        res: ';; AUTHORITY SECTION:\nchild.example.com. 3600 IN NS ns1.child.example.com.\nchild.example.com. 3600 IN NS ns2.other.example.net.\n;; ADDITIONAL SECTION:\nns1.child.example.com. 3600 IN A 192.0.2.100',
      },
      vault: [
        add('resolver', ITEM.cache({ id: 'del', name: 'Child delegation', meta: 'NS + glue · TTL 3600', value: 'child.example.com. NS ns1.child.example.com.\nns1.child.example.com. A 192.0.2.100' })),
      ],
      tags: ['referral', 'glue caching'],
    },
    {
      from: 'resolver', to: 'primary', badge: 'query child authoritative server', channel: 'dns',
      detail:
        'The child server answers authoritatively for app.child.example.com with AA=1. The parent’s glue only got the resolver to the server; the answer comes from the child zone.\n\nKeep the parent NS set and the child apex NS set consistent. A mismatch causes intermittent answers depending on which delegation a resolver cached.',
      http: {
        req: '$ dig @ns1.child.example.com app.child.example.com A +norecurse',
        res: ';; flags: qr aa\n;; ANSWER SECTION:\napp.child.example.com. 300 IN A 192.0.2.101',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'childans', name: 'Child answer', meta: 'AA=1 · TTL 300', value: 'app.child.example.com. 300 IN A 192.0.2.101' })),
        add('zonedata', ITEM.zone({ id: 'childzone', name: 'db.child.example.com', meta: 'SOA + apex NS + app A', value: '$ORIGIN child.example.com.\n@ IN SOA ns1.child.example.com. hostmaster.child.example.com. ( 2026110501 3600 900 1209600 300 )\n@ IN NS ns1.child.example.com.\napp IN A 192.0.2.101' })),
      ],
      tags: ['child authority', 'apex NS consistency', 'AA=1'],
    },
    {
      from: 'monitor', to: 'resolver', badge: 'missing glue → SERVFAIL', channel: 'report',
      detail:
        'If the parent removes the glue for ns1.child.example.com, a resolver that has no cached address cannot resolve the child name server. The lookup fails or times out, often as SERVFAIL.\n\nWrong glue is worse than missing glue: it can send resolvers to the wrong host and produce intermittent failures that depend on cache state.',
      http: {
        res: ';; ->>HEADER<<- status: SERVFAIL\n;; WARNING: recursion requested but not available',
      },
      vault: [
        add('dnslogs', ITEM.dnserror({ id: 'servfail', name: 'Lame delegation / SERVFAIL', meta: 'missing or wrong glue', value: 'SERVFAIL: could not reach ns1.child.example.com\nparent glue missing' })),
      ],
      tags: ['missing glue', 'SERVFAIL', 'lame delegation'],
    },
    {
      from: 'admin', to: 'parent', badge: 'fix glue + verify from both sides', channel: 'cli',
      detail:
        'Restore the correct glue and verify: query the parent for the delegation, then query the child NS directly for its apex SOA and NS. Repeat from multiple resolvers.\n\nIf DNSSEC is enabled, also publish the DS in the parent and confirm the child DNSKEY. A missing DS is insecure, not bogus; a wrong DS is bogus.',
      vault: [
        add('parent', ITEM.record({ id: 'fixed', name: 'Glue repaired', meta: 'ns1.child A 192.0.2.100', value: 'ns1.child.example.com. 3600 IN A 192.0.2.100' })),
        add('parent', ITEM.ds({ id: 'ds', name: 'Child DS', meta: 'key tag · algorithm · digest', value: 'child.example.com. 3600 IN DS 12345 13 2 ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789' })),
      ],
      tags: ['glue repair', 'DS hand-off', 'verify'],
    },
  ],
  notes: [
    'Glue is needed only for NS targets inside the delegated child. Out-of-bailiwick targets need normal resolution.',
    'The parent is authoritative for the delegation and glue, not for ordinary data below the child apex.',
    'Missing DS means an insecure delegation; a wrong DS makes the child bogus for validating resolvers.',
    'Test from the parent side and the child side; one side alone can look healthy.',
  ],
  config: [
    cfg('Parent delegation', [
      '`child IN NS ns1.child.example.com.` — in-bailiwick name server.',
      '`child IN NS ns2.other.example.net.` — out-of-bailiwick name server.',
      '`ns1.child IN A 192.0.2.100` — glue, because ns1 is inside child.',
      '`child IN DS 12345 13 2 ...` — only when the child is signed and the DS matches its KSK.',
    ]),
    cfg('Child apex', [
      '`@ IN SOA ns1.child.example.com. hostmaster.child.example.com. (...)`',
      '`@ IN NS ns1.child.example.com.` — must match the parent delegation.',
      '`@ IN NS ns2.other.example.net.`',
      '`ns1 IN A 192.0.2.100` — authoritative child data, separate from parent glue.',
    ]),
  ],
  pitfalls: [
    'Publishing only one NS for the child.',
    'Forgetting glue for an in-bailiwick name server.',
    'Letting parent glue and child A records drift apart.',
    'Publishing a DS before the child DNSKEY exists, or removing it too early.',
  ],
  productionChecks: [
    'Parent and child NS sets match.',
    'Glue matches the child A/AAAA records.',
    'All child NS answer the apex SOA and NS authoritatively.',
    'DS/DNSKEY state is validated after every change.',
  ],
};

export const bindZoneFile = {
  id: 'bind-zone-file',
  title: 'Zone file — origin, SOA, records and named-checkzone',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-foundations',
  level: 'core',
  minutes: 11,
  tags: ['zone file', '$ORIGIN', '$TTL', 'SOA', 'serial', 'named-checkzone', 'reload'],
  summary:
    'Edit a real-style zone file: set $ORIGIN and $TTL, write an SOA and NS set, add A/CNAME/MX records, bump the serial, validate with named-checkzone and publish to a secondary.',
  nodes: ['admin', 'primary', 'secondary', 'monitor'],
  stores: ['zonedata', 'authority', 'transfer', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'admin', to: 'primary', badge: 'write $ORIGIN and $TTL', channel: 'cli',
      detail:
        '`$ORIGIN` sets the suffix for relative names; `$TTL` sets the default TTL. `@` means the current origin. A name without a trailing dot is relative; a trailing dot makes it absolute.\n\nMost “record attached to the wrong name” bugs come from a missing trailing dot or an omitted owner line.',
      http: {
        req: '$ORIGIN example.com.\n$TTL 3600\n@ IN SOA ns1.example.com. hostmaster.example.com. ( ... )',
        res: 'origin and default TTL set',
      },
      vault: [
        add('zonedata', ITEM.zone({ id: 'z1', name: 'db.example.com', meta: '$ORIGIN example.com. · $TTL 3600', value: '$ORIGIN example.com.\n$TTL 3600\n@ IN SOA ns1.example.com. hostmaster.example.com. (\n  2026110501 ; serial\n  3600       ; refresh\n  900        ; retry\n  1209600    ; expire\n  300 )      ; negative TTL\n@ IN NS ns1.example.com.\n@ IN NS ns2.example.net.' })),
      ],
      tags: ['$ORIGIN', '$TTL', '@', 'relative names'],
    },
    {
      from: 'admin', to: 'primary', badge: 'add A, CNAME and MX', channel: 'cli',
      detail:
        'Add ordinary records. A CNAME must be alone at its owner (DNSSEC metadata aside) and cannot exist at the apex because SOA/NS already live there. MX targets must be hostnames with A/AAAA, never CNAMEs.\n\nUse a trailing dot for every fully qualified target. `mail` is relative; `mail.example.com.` is absolute.',
      http: {
        req: 'www     IN A     192.0.2.80\nmail    IN A     192.0.2.25\n@       IN MX    10 mail.example.com.\nblog    IN CNAME www.example.com.',
        res: 'records added',
      },
      vault: [
        add('zonedata', ITEM.record({ id: 'a', name: 'www A', meta: '192.0.2.80 · TTL 3600', value: 'www.example.com. 3600 IN A 192.0.2.80' })),
        add('zonedata', ITEM.record({ id: 'cname', name: 'blog CNAME', meta: 'target www.example.com.', value: 'blog.example.com. 3600 IN CNAME www.example.com.' })),
        add('zonedata', ITEM.record({ id: 'mx', name: 'apex MX', meta: '10 mail.example.com.', value: 'example.com. 3600 IN MX 10 mail.example.com.' })),
      ],
      tags: ['A', 'CNAME rules', 'MX target', 'trailing dot'],
    },
    {
      from: 'admin', to: 'primary', badge: 'bump the SOA serial', channel: 'cli',
      detail:
        'Increase the serial on every publish. `YYYYMMDDnn` is readable and works for most teams; use a counter or epoch seconds if you publish more than 99 times a day.\n\nA secondary ignores a zone whose serial did not increase. Never go backwards and never wrap.',
      http: {
        req: '2026110501 → 2026110502',
        res: 'serial updated',
      },
      vault: [
        add('zonedata', ITEM.record({ id: 'soa', name: 'SOA serial', meta: '2026110502 · monotonic', value: 'example.com. 3600 IN SOA ns1.example.com. hostmaster.example.com. (\n  2026110502 3600 900 1209600 300 )' })),
      ],
      tags: ['SOA serial', 'YYYYMMDDnn', 'secondary'],
    },
    {
      from: 'admin', to: 'primary', badge: 'named-checkzone db.example.com', channel: 'cli',
      detail:
        '`named-checkzone` validates the master file: record syntax, owner names, CNAME conflicts, MX/NS targets, TTLs and SOA presence. It is the authoritative static check for the zone file.\n\nRun it with the exact BIND version used in production. A browser analyzer cannot replace it.',
      http: {
        req: '$ named-checkzone example.com /etc/bind/zones/db.example.com',
        res: 'zone example.com/IN: loaded serial 2026110502\nOK',
      },
      vault: [
        add('authority', ITEM.record({ id: 'check', name: 'named-checkzone result', meta: 'OK · serial 2026110502', value: 'zone example.com/IN: loaded serial 2026110502\nOK' })),
      ],
      tags: ['named-checkzone', 'validation', 'serial'],
    },
    {
      from: 'admin', to: 'primary', badge: 'rndc reload example.com', channel: 'cli',
      detail:
        'Reload the zone after validating. `rndc reload example.com` reloads one zone; `rndc reload` reloads changed zones and configuration. A failed reload may leave the old zone serving, so read the logs.\n\n`rndc status` and `rndc zonestatus example.com` show what the server actually loaded.',
      http: {
        req: '$ rndc reload example.com\n$ rndc zonestatus example.com',
        res: 'zone example.com/IN: loaded serial 2026110502\nserver is up and running',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'status', name: 'Zone status', meta: 'loaded serial 2026110502', value: 'name: example.com\ntype: primary\nserial: 2026110502\nloaded: yes' })),
      ],
      tags: ['rndc reload', 'zonestatus', 'rollback'],
    },
    {
      from: 'primary', to: 'secondary', badge: 'NOTIFY → IXFR', channel: 'xfer',
      detail:
        'The primary sends NOTIFY to the NS set and any `also-notify` targets. The secondary compares SOA serials and requests IXFR; the primary may answer with a delta from the journal or fall back to AXFR.\n\nThe secondary keeps serving if the primary disappears, until the SOA EXPIRE timer runs out.',
      http: {
        req: 'NOTIFY example.com\n;; SOA serial 2026110502',
        res: 'IXFR from 2026110501 → 2026110502\nzone updated',
      },
      vault: [
        add('transfer', ITEM.journal({ id: 'jnl', name: 'db.example.com.jnl', meta: 'IXFR delta · new serial', value: 'IXFR 2026110501 → 2026110502\n+ www.example.com. A 192.0.2.80' })),
        add('authority', ITEM.answer({ id: 'sec', name: 'Secondary zone', meta: 'serial 2026110502 · authoritative', value: 'example.com. SOA serial 2026110502' })),
      ],
      tags: ['NOTIFY', 'IXFR', 'journal', 'EXPIRE'],
    },
    {
      from: 'admin', to: 'monitor', badge: 'verify SOA and A from both servers', channel: 'report',
      detail:
        'Verify the serial on both servers and query the new record from each. A successful reload on the primary does not prove the secondary transferred.\n\nRecord the change, the validation output and the rollback file. DNS changes are easy to make and hard to see; evidence beats memory.',
      http: {
        req: '$ dig @ns1.example.com example.com SOA +short\n$ dig @ns2.example.net www.example.com A +short',
        res: 'ns1.example.com. hostmaster.example.com. 2026110502 ...\n192.0.2.80',
      },
      vault: [
        add('dnslogs', ITEM.record({ id: 'verify', name: 'Post-change verification', meta: 'both servers · serial + answer', value: 'primary SOA: 2026110502\nsecondary SOA: 2026110502\nwww A: 192.0.2.80' })),
      ],
      tags: ['verification', 'both servers', 'change record'],
    },
  ],
  notes: [
    'A zone file is not the whole zone: the parent delegation and DS decide whether the world can reach it.',
    'A trailing dot changes the meaning of a target. Review every target name.',
    'The SOA serial must increase; the secondary may silently ignore a stale serial.',
    'Keep the previous zone file and a tested rollback before publishing.',
  ],
  config: [
    cfg('Minimal zone file', [
      '`$ORIGIN example.com.` and `$TTL 3600`.',
      'One SOA at the apex with a monotonic serial and correct timers.',
      'At least two apex NS records on independent infrastructure.',
      'A/AAAA for in-bailiwick NS targets (glue).',
      'CNAME only as the sole data at its owner; never at the apex.',
    ]),
  ],
  pitfalls: [
    'Missing trailing dot on an FQDN target.',
    'A CNAME at the apex or next to other data.',
    'Forgetting to bump the serial.',
    'Reloading without `named-checkzone` and without a rollback.',
  ],
  productionChecks: [
    'Zone file passes `named-checkzone` with the production binary.',
    'Serial and timers are intentional.',
    'Secondary serial matches the primary.',
    'A previous version is saved and restorable.',
  ],
};

export const bindNamedConf = {
  id: 'bind-named-conf',
  title: 'named.conf — options, ACLs, views and validation',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-foundations',
  level: 'core',
  minutes: 10,
  tags: ['named.conf', 'options', 'ACL', 'listen-on', 'recursion', 'views', 'named-checkconf'],
  summary:
    'Build and review a safe named.conf: listen addresses, recursion and cache policy, transfer defaults, includes, logging, controls and a validation loop before reload.',
  nodes: ['admin', 'primary', 'resolver', 'monitor'],
  stores: ['authority', 'resolver', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'admin', to: 'primary', badge: 'write the options block', channel: 'cli',
      detail:
        'The options block is the main policy surface. Make the role explicit: where to listen, whether to recurse, who may transfer, where files live, whether to validate DNSSEC and how to observe the server.\n\nImplicit defaults are hard to audit. A short, deliberate options block is easier to review than a large inherited configuration.',
      http: {
        req: 'options {\n  directory "/var/cache/bind";\n  listen-on port 53 { 127.0.0.1; 192.0.2.53; };\n  listen-on-v6 port 53 { ::1; 2001:db8::53; };\n  recursion no;\n  allow-transfer { none; };\n  dnssec-validation auto;\n  version none;\n};',
        res: 'options block written',
      },
      vault: [
        add('authority', ITEM.namedconf({ id: 'opts', name: 'options', meta: 'listen · recursion no · transfer none', value: 'options {\n  directory "/var/cache/bind";\n  listen-on port 53 { 127.0.0.1; 192.0.2.53; };\n  listen-on-v6 port 53 { ::1; };\n  recursion no;\n  allow-transfer { none; };\n  dnssec-validation auto;\n  version none;\n};' })),
      ],
      tags: ['options', 'listen-on', 'recursion', 'version none'],
    },
    {
      from: 'admin', to: 'primary', badge: 'define an ACL once', channel: 'cli',
      detail:
        'Named ACLs keep policy readable and reusable. ACLs can nest and use negation. Predefined ACLs include `any`, `none`, `localhost` and `localnets`.\n\nWrite a test matrix: an address inside, outside and in an excluded range. Test IPv4 and IPv6, and test through NAT boundaries.',
      http: {
        req: 'acl "resolver-clients" {\n  127.0.0.1;\n  10.20.0.0/16;\n  !10.20.99.0/24;\n};',
        res: 'ACL defined',
      },
      vault: [
        add('authority', ITEM.dnsacl({ id: 'acl', name: 'resolver-clients', meta: 'loopback + 10.20/16 minus .99/24', value: '127.0.0.1;\n10.20.0.0/16;\n!10.20.99.0/24;' })),
      ],
      tags: ['ACL', 'negation', 'test matrix'],
    },
    {
      from: 'admin', to: 'resolver', badge: 'scope recursion and cache', channel: 'cli',
      detail:
        'On a resolver, `recursion yes;` is only safe with restrictive `allow-recursion`. Cache access is a separate control: `allow-query-cache` can leak internal lookups if it is broader than the recursion ACL.\n\nAn authoritative-only server should use `recursion no;`. If one server must do both, use views and separate policy rather than a single broad rule.',
      http: {
        req: 'recursion yes;\nallow-recursion { resolver-clients; };\nallow-query-cache { resolver-clients; };\nmax-cache-size 512m;\nmax-recursion-queries 100;',
        res: 'recursion scoped to named ACL',
      },
      vault: [
        add('resolver', ITEM.dnsacl({ id: 'recacl', name: 'allow-recursion', meta: 'resolver-clients only', value: 'allow-recursion { resolver-clients; };\nallow-query-cache { resolver-clients; };' })),
        add('resolver', ITEM.cache({ id: 'cache', name: 'Bounded cache', meta: '512 MB · recursion limits', value: 'max-cache-size 512m;\nmax-recursion-queries 100;\nmax-recursion-depth 10;' })),
      ],
      tags: ['allow-recursion', 'allow-query-cache', 'cache limits'],
    },
    {
      from: 'admin', to: 'primary', badge: 'add zones and includes', channel: 'cli',
      detail:
        'Includes are textual: an include inside a view inherits that view; an include at top level becomes another top-level statement. A missing include is fatal, and including the same file twice can duplicate zones.\n\nKeep one clear entry point and review the whole include tree. Relative paths depend on `directory` and the service working directory.',
      http: {
        req: 'include "/etc/bind/named.conf.options";\ninclude "/etc/bind/named.conf.local";\nzone "example.com" {\n  type primary;\n  file "/etc/bind/zones/db.example.com";\n};',
        res: 'zone declaration loaded',
      },
      vault: [
        add('authority', ITEM.namedconf({ id: 'include', name: 'include tree', meta: 'entry point + options + local zones', value: 'named.conf\n├── named.conf.options\n└── named.conf.local\n    └── zone example.com' })),
        add('authority', ITEM.zone({ id: 'zone', name: 'example.com zone', meta: 'primary · file path', value: 'zone "example.com" {\n  type primary;\n  file "/etc/bind/zones/db.example.com";\n};' })),
      ],
      tags: ['include', 'zone', 'file path', 'duplicate zones'],
    },
    {
      from: 'admin', to: 'primary', badge: 'named-checkconf -z', channel: 'cli',
      detail:
        '`named-checkconf -z` parses the full configuration and loads all zones. Use it before every reload. It catches syntax errors, missing includes, bad paths and zone load failures.\n\nIt does not prove that the parent delegation, firewall, TCP/53, DNSSEC chain or secondary transfers are correct.',
      http: {
        req: '$ named-checkconf -z /etc/bind/named.conf',
        res: 'zone example.com/IN: loaded serial 2026110502\nno errors',
      },
      vault: [
        add('authority', ITEM.record({ id: 'check', name: 'named-checkconf result', meta: 'configuration + zones load', value: 'zone example.com/IN: loaded serial 2026110502\nnamed-checkconf: no errors' })),
      ],
      tags: ['named-checkconf', '-z', 'reload gate'],
    },
    {
      from: 'resolver', to: 'primary', badge: 'test allowed and denied clients', channel: 'dns',
      detail:
        'Test from an allowed client and from a network that should not recurse. `dig @resolver example.com A +recurse` should work for allowed clients and fail with REFUSED or timeout for outsiders.\n\nA firewall can hide an open resolver from you while leaving it exposed to the internet. Test from the actual untrusted path.',
      http: {
        req: '$ dig @192.0.2.53 example.com A +recurse',
        res: ';; ->>HEADER<<- status: REFUSED   (from a disallowed client)',
      },
      vault: [
        add('dnslogs', ITEM.dnserror({ id: 'refused', name: 'REFUSED to outsider', meta: 'allow-recursion enforced', value: 'status: REFUSED\nclient not in resolver-clients' })),
      ],
      tags: ['REFUSED', 'external test', 'IPv6', 'NAT'],
    },
    {
      from: 'primary', to: 'monitor', badge: 'logging + controls', channel: 'report',
      detail:
        'Route default, security, dnssec, xfer and update categories to a bounded channel. Protect `controls` and `statistics-channels` on a management path; never expose them to the internet.\n\nA configuration that cannot be observed is not operable. Start with security, transfer and DNSSEC categories, and add query logging only temporarily.',
      vault: [
        add('dnslogs', ITEM.record({ id: 'log', name: 'Bounded log channel', meta: 'versions 5 · size 20m', value: 'channel main {\n  file "/var/log/named/main.log" versions 5 size 20m;\n  severity info;\n  print-time yes;\n  print-category yes;\n};\ncategory security { main; };\ncategory dnssec { main; };\ncategory xfer-out { main; };' })),
      ],
      tags: ['logging', 'controls', 'statistics-channels', 'retention'],
    },
  ],
  notes: [
    'Views are evaluated in order; the first match wins. A catch-all view can hide later views.',
    '`recursion yes` with `allow-recursion { any; };` is an open resolver.',
    'A missing include is fatal; a duplicated include can create duplicate zones.',
    '`named-checkconf` is a gate, not a live verification.',
  ],
  config: [
    cfg('Safe authoritative options', [
      '`directory "/var/cache/bind";`',
      '`listen-on port 53 { 127.0.0.1; 192.0.2.53; };`',
      '`recursion no;`',
      '`allow-transfer { none; };`',
      '`version none;`',
      '`dnssec-validation auto;` (for a resolver; authoritative-only may not need it)',
    ]),
    cfg('Safe resolver options', [
      '`recursion yes;`',
      '`allow-recursion { resolver-clients; };`',
      '`allow-query-cache { resolver-clients; };`',
      '`max-cache-size 512m;`',
      '`max-recursion-queries 100;`',
      '`max-recursion-depth 10;`',
    ]),
  ],
  pitfalls: [
    'An `options` block that is included twice or overridden later.',
    'A wildcard `match-clients { any; };` before a more specific view.',
    'Using `allow-query` as the only recursion control.',
    'Exposing statistics or rndc controls on a public interface.',
  ],
  productionChecks: [
    '`named-checkconf -z` passes with the production binary.',
    'Every include path and permission is verified in the service context.',
    'Recursion is tested from inside, outside and IPv6.',
    'Management channels are firewalled and authenticated.',
  ],
};

export const bindDnssecChain = {
  id: 'bind-dnssec-chain',
  title: 'DNSSEC chain — DS, DNSKEY, RRSIG and the AD bit',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-dnssec',
  level: 'advanced',
  minutes: 14,
  tags: ['DNSSEC', 'DS', 'DNSKEY', 'RRSIG', 'AD', 'NSEC3', 'trust anchor', 'bogus'],
  summary:
    'Walk the DNSSEC chain from the root trust anchor through the parent DS and child DNSKEY to a signed RRset. See what a validating resolver actually checks and why a wrong DS causes SERVFAIL.',
  nodes: ['client', 'resolver', 'root', 'parent', 'primary', 'monitor'],
  stores: ['dnsclient', 'resolver', 'internet', 'parent', 'dnssec', 'authority', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'client', to: 'resolver', badge: 'query with DO + AD requested', channel: 'front',
      detail:
        'The client sets DO=1 (DNSSEC OK) in the EDNS OPT record, signalling that it wants DNSSEC records if available. The resolver validates if it has a trust anchor and `dnssec-validation` enabled.\n\nDO is not “please validate for me”; it asks for DNSSEC data. AD is set by a validating resolver after a successful validation.',
      vault: [
        add('dnsclient', ITEM.query({ id: 'q', name: 'www.example.com A', meta: 'DO=1 · wants RRSIG', value: ';; OPT PSEUDOSECTION:\n; EDNS: version 0; flags: do' })),
      ],
      tags: ['DO=1', 'EDNS', 'AD', 'validation'],
    },
    {
      from: 'resolver', to: 'root', badge: 'root trust anchor / DNSKEY', channel: 'dnssec',
      detail:
        'The resolver starts from a configured trust anchor: normally the root KSK or a managed root key. It fetches the root DNSKEY RRset and validates its self-signature.\n\nThe root trust anchor is the out-of-band root of all DNSSEC trust. If it is stale or wrong, every signed lookup can fail.',
      http: {
        req: '$ dig @a.root-servers.net . DNSKEY +dnssec',
        res: '. 172800 IN DNSKEY 257 3 8 AwEAA...\n. 172800 IN RRSIG DNSKEY 8 0 172800 ...',
      },
      vault: [
        add('internet', ITEM.dnskey({ id: 'rootkey', name: 'Root KSK', meta: 'flags 257 · algorithm 8', value: '. 172800 IN DNSKEY 257 3 8 AwEAA...' })),
        add('dnssec', ITEM.rrsig({ id: 'rootsig', name: 'Root DNSKEY RRSIG', meta: 'self-signed by KSK', value: '. 172800 IN RRSIG DNSKEY 8 0 172800 20261231... 20261101... 20326 . ...' })),
      ],
      tags: ['root KSK', 'trust anchor', 'DNSKEY'],
    },
    {
      from: 'resolver', to: 'parent', badge: 'fetch DS for example.com', channel: 'dnssec',
      detail:
        'At each delegation the parent publishes a DS record containing a digest of the child KSK. The DS RRset is signed by the parent. A missing DS means an insecure delegation; a DS that does not match the child DNSKEY means bogus.\n\nThe DS is the trust hand-off. It is not the child’s public key; it is a digest of it.',
      http: {
        req: '$ dig @a.gtld-servers.net example.com DS +dnssec',
        res: 'example.com. 86400 IN DS 12345 13 2 ABCDEF...\nexample.com. 86400 IN RRSIG DS 13 2 86400 ...',
      },
      vault: [
        add('parent', ITEM.ds({ id: 'ds', name: 'example.com DS', meta: 'key tag 12345 · algorithm 13 · SHA-256', value: 'example.com. 86400 IN DS 12345 13 2 ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789' })),
        add('parent', ITEM.rrsig({ id: 'dssig', name: 'DS RRSIG', meta: 'signed by the parent com zone', value: 'example.com. 86400 IN RRSIG DS 13 2 86400 ... com. ...' })),
      ],
      tags: ['DS', 'digest', 'parent signature', 'insecure delegation'],
    },
    {
      from: 'resolver', to: 'primary', badge: 'fetch child DNSKEY', channel: 'dnssec',
      detail:
        'The child publishes DNSKEY records. A KSK (flags 257) signs the DNSKEY RRset; a ZSK (flags 256) signs ordinary data. The DS digest must match one of the child DNSKEYs, using the same key tag and algorithm.\n\nThe resolver computes the digest locally and compares it with the DS. A mismatch is bogus, even if the signature “looks valid”.',
      http: {
        req: '$ dig @ns1.example.com example.com DNSKEY +dnssec',
        res: 'example.com. 3600 IN DNSKEY 257 3 13 mdsswU... ; KSK\nexample.com. 3600 IN DNSKEY 256 3 13 ... ; ZSK',
      },
      vault: [
        add('dnssec', ITEM.dnskey({ id: 'ksk', name: 'example.com KSK', meta: 'flags 257 · algorithm 13 · tag 12345', value: 'example.com. 3600 IN DNSKEY 257 3 13 mdsswU...' })),
        add('dnssec', ITEM.dnskey({ id: 'zsk', name: 'example.com ZSK', meta: 'flags 256 · algorithm 13', value: 'example.com. 3600 IN DNSKEY 256 3 13 ...' })),
      ],
      tags: ['KSK', 'ZSK', 'key tag', 'DS digest match'],
    },
    {
      from: 'resolver', to: 'primary', badge: 'fetch A + RRSIG', channel: 'dnssec',
      detail:
        'The authoritative server returns the A RRset with an RRSIG. The signature covers the canonical RRset, the signer name, algorithm, key tag and validity window.\n\nThe resolver verifies the signature with the ZSK, then builds the chain: root KSK → com DS/DNSKEY → example.com DS/DNSKEY → A/RRSIG.',
      http: {
        req: '$ dig @ns1.example.com www.example.com A +dnssec',
        res: 'www.example.com. 3600 IN A 192.0.2.80\nwww.example.com. 3600 IN RRSIG A 13 3 3600 20261231... 20261101... 12345 example.com. ...',
      },
      vault: [
        add('authority', ITEM.rrset({ id: 'a', name: 'www.example.com A', meta: '192.0.2.80 · TTL 3600', value: 'www.example.com. 3600 IN A 192.0.2.80' })),
        add('authority', ITEM.rrsig({ id: 'sig', name: 'RRSIG A', meta: 'key tag 12345 · signer example.com.', value: 'www.example.com. 3600 IN RRSIG A 13 3 3600 20261231235959 20261101000000 12345 example.com. ...' })),
      ],
      tags: ['RRSIG', 'canonical RRset', 'validity window', 'signer'],
    },
    {
      from: 'resolver', to: 'resolver', badge: 'validate the chain locally', channel: 'dnssec',
      detail:
        'Validation is local: match DS to DNSKEY, check the RRSIG with the DNSKEY, check names and dates, and repeat up to the trust anchor. If every link is valid, the answer is Secure and AD=1.\n\nA broken link makes the answer Bogus; no DS at a delegation makes it Insecure. Insecure is not the same as bogus.',
      vault: [
        add('resolver', ITEM.record({ id: 'state', name: 'Validation state', meta: 'secure · AD=1', value: 'DS→DNSKEY: match\nRRSIG: valid\nchain: complete to root\nstate: secure' })),
      ],
      tags: ['secure', 'insecure', 'bogus', 'indeterminate', 'local validation'],
    },
    {
      from: 'resolver', to: 'client', badge: 'AD=1 answer or SERVFAIL', channel: 'back',
      detail:
        'A secure answer returns AD=1. A bogus answer usually returns SERVFAIL to the client because the resolver refuses to pass unvalidated data from a signed zone.\n\nIf you need to inspect bogus data for diagnosis, query with CD=1 (`+cd`) or use `delv` which reports the validation state instead of only SERVFAIL.',
      http: {
        res: ';; flags: qr rd ra ad\nwww.example.com. 3600 IN A 192.0.2.80',
      },
      vault: [
        add('dnsclient', ITEM.answer({ id: 'ad', name: 'Validated answer', meta: 'AD=1 · secure', value: ';; flags: qr rd ra ad\nwww.example.com. 3600 IN A 192.0.2.80' })),
      ],
      tags: ['AD=1', 'SERVFAIL', 'CD=1', 'bogus'],
    },
    {
      from: 'monitor', to: 'resolver', badge: 'wrong DS → bogus for every client', channel: 'report',
      detail:
        'If the parent DS points at a key the child no longer has, every validating resolver treats the zone as bogus. The authoritative server still answers; the resolver refuses the answer.\n\nThis is why DNSSEC changes are staged: publish the new DNSKEY, publish the new DS alongside the old, wait for caches, then remove the old key/DS. Monitor RRSIG expiry like certificate expiry.',
      vault: [
        add('dnslogs', ITEM.dnserror({ id: 'bogus', name: 'DNSSEC bogus', meta: 'DS does not match DNSKEY', value: 'validation failed: no DNSKEY matches DS 12345\nRCODE: SERVFAIL (to validating clients)' })),
      ],
      tags: ['bogus', 'wrong DS', 'rollover', 'monitoring'],
    },
  ],
  notes: [
    'DNSSEC provides origin authentication and integrity, not confidentiality.',
    'A signed typo is still a typo. DNSSEC does not fix operational mistakes.',
    'A missing DS is insecure, not bogus. A wrong DS is bogus.',
    'AD is only meaningful from a resolver you trust to validate.',
  ],
  config: [
    cfg('Validate on a resolver', [
      '`dnssec-validation auto;` — use the built-in root trust anchor.',
      '`dnssec-validation yes;` with an explicit `trust-anchors` block for a managed anchor.',
      'Do not disable validation globally to hide a broken zone.',
      'Monitor validation failures, RRSIG expiry and trust-anchor state.',
    ]),
    cfg('Sign an authoritative zone', [
      '`dnssec-policy "default";` on the zone.',
      '`inline-signing yes;` for an unsigned source file maintained separately.',
      'Writable `key-directory`, protected from other users.',
      'Publish the DS in the parent after the child DNSKEY exists.',
    ]),
  ],
  pitfalls: [
    'Publishing DS before the child is signed.',
    'Removing a DS before caches expire during rollover.',
    'Hand-editing NSEC/NSEC3 in an inline-signed zone.',
    'Losing the key directory on container restart.',
  ],
  productionChecks: [
    'DS digest matches the published KSK.',
    'Earliest RRSIG expiry is monitored and alerted.',
    'DNSSEC state is checked with `delv` and an external validator.',
    'Rollback includes both DS and DNSKEY state.',
  ],
};

export const bindDnssecRollover = {
  id: 'bind-dnssec-rollover',
  title: 'DNSSEC rollover — dnssec-policy, KSK and DS timing',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-dnssec',
  level: 'advanced',
  minutes: 12,
  tags: ['DNSSEC', 'dnssec-policy', 'KSK', 'ZSK', 'rollover', 'DS', 'rndc dnssec'],
  summary:
    'Run a policy-driven KSK rollover without an outage: generate keys, publish DNSKEY, add the DS in the parent, wait for TTLs, switch signing and retire the old key. Includes ZSK rollover and monitoring.',
  nodes: ['admin', 'primary', 'parent', 'secondary', 'monitor'],
  stores: ['dnssec', 'authority', 'parent', 'transfer', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'admin', to: 'primary', badge: 'define dnssec-policy', channel: 'cli',
      detail:
        'Modern BIND manages keys and signatures through `dnssec-policy`. Define algorithms, key lifetimes and denial-of-existence settings once, then reference the policy from each zone.\n\n`key-directory` must be writable by BIND and protected from other users. Back it up; losing it can invalidate the signed zone.',
      http: {
        req: 'dnssec-policy "default" {\n  keys {\n    ksk lifetime unlimited algorithm ecdsap256sha256;\n    zsk lifetime 90d algorithm ecdsap256sha256;\n  };\n};\nzone "example.com" {\n  type primary;\n  file "db.example.com";\n  dnssec-policy "default";\n  inline-signing yes;\n};',
        res: 'policy and zone configured',
      },
      vault: [
        add('dnssec', ITEM.bindpolicy({ id: 'policy', name: 'dnssec-policy default', meta: 'ECDSAP256SHA256 · ZSK 90d', value: 'ksk lifetime unlimited algorithm ecdsap256sha256;\nzsk lifetime 90d algorithm ecdsap256sha256;' })),
        add('authority', ITEM.namedconf({ id: 'zone', name: 'signed zone', meta: 'inline-signing yes', value: 'zone "example.com" {\n  type primary;\n  file "db.example.com";\n  dnssec-policy "default";\n  inline-signing yes;\n};' })),
      ],
      tags: ['dnssec-policy', 'key-directory', 'inline-signing'],
    },
    {
      from: 'primary', to: 'primary', badge: 'publish the new KSK DNSKEY', channel: 'dnssec',
      detail:
        'The new KSK is generated and published in the DNSKEY RRset, but the old KSK still signs during the transition. The parent still points at the old key.\n\nWait until the new DNSKEY is visible from all authoritative servers and caches before publishing the DS.',
      vault: [
        add('dnssec', ITEM.dnskey({ id: 'newksk', name: 'New KSK', meta: 'flags 257 · tag 54321', value: 'example.com. 3600 IN DNSKEY 257 3 13 newkeymaterial...' })),
        add('dnssec', ITEM.dnskey({ id: 'oldksk', name: 'Old KSK', meta: 'still signing · tag 12345', value: 'example.com. 3600 IN DNSKEY 257 3 13 oldkeymaterial...' })),
      ],
      tags: ['KSK', 'DNSKEY publish', 'transition'],
    },
    {
      from: 'primary', to: 'parent', badge: 'submit the new DS', channel: 'dnssec',
      detail:
        'Generate the new DS from the new KSK and publish it in the parent **alongside** the old DS. This is the dangerous step: a DS that does not match any child DNSKEY makes the zone bogus.\n\nKeep both DS records until the old DS TTL and resolver caches have expired.',
      http: {
        req: 'example.com. IN DS 12345 13 2 <old>\nexample.com. IN DS 54321 13 2 <new>',
        res: 'both DS records published',
      },
      vault: [
        add('parent', ITEM.ds({ id: 'oldds', name: 'Old DS', meta: 'tag 12345 · keep during transition', value: 'example.com. 86400 IN DS 12345 13 2 ABCDEF...' })),
        add('parent', ITEM.ds({ id: 'newds', name: 'New DS', meta: 'tag 54321 · published alongside', value: 'example.com. 86400 IN DS 54321 13 2 123456...' })),
      ],
      tags: ['DS', 'dual publish', 'TTL wait'],
    },
    {
      from: 'parent', to: 'primary', badge: 'switch signing to the new KSK', channel: 'dnssec',
      detail:
        'After the new DS is visible and cached, switch the DNSKEY RRset signature to the new KSK. The old DS can remain for a rollback window.\n\nMonitor both DS records and both keys until the old DS is removed. A resolver may cache either chain during the transition.',
      vault: [
        add('dnssec', ITEM.rrsig({ id: 'newrrsig', name: 'DNSKEY RRSIG', meta: 'signed by new KSK tag 54321', value: 'example.com. 3600 IN RRSIG DNSKEY 13 2 3600 ... 54321 example.com. ...' })),
      ],
      tags: ['KSK rollover', 'signing switch', 'rollback window'],
    },
    {
      from: 'secondary', to: 'primary', badge: 'transfer new keys and signatures', channel: 'xfer',
      detail:
        'Secondaries must receive the new DNSKEY, RRSIG and NSEC3 records. If a secondary serves stale keys after the DS change, clients can see inconsistent validation depending on which server they reach.\n\nVerify the secondary serial, DNSKEY set and RRSIG validity after the transfer.',
      vault: [
        add('transfer', ITEM.journal({ id: 'roll', name: 'Key/signature transfer', meta: 'IXFR · new DNSKEY + RRSIG', value: 'IXFR: + DNSKEY 54321\n+ RRSIG DNSKEY (new)\nserial increased' })),
      ],
      tags: ['secondary', 'IXFR', 'consistency'],
    },
    {
      from: 'admin', to: 'monitor', badge: 'rndc dnssec -status + caches', channel: 'report',
      detail:
        '`rndc dnssec -status example.com` shows key states, timing and next actions. Check both authoritative servers and multiple validating resolvers.\n\nWait at least the old DS TTL plus cache time before removing the old DS and KSK. Rushing the retirement is how rollovers cause outages.',
      http: {
        req: '$ rndc dnssec -status example.com',
        res: 'zone: example.com\nkey: 12345 (KSK)  goal: hidden\nkey: 54321 (KSK)  goal: active',
      },
      vault: [
        add('dnslogs', ITEM.record({ id: 'status', name: 'DNSSEC key status', meta: 'old hidden · new active', value: 'KSK 12345: hidden (retire after DS TTL)\nKSK 54321: active\nZSK 67890: active' })),
      ],
      tags: ['rndc dnssec', 'TTL wait', 'validation'],
    },
    {
      from: 'admin', to: 'parent', badge: 'retire old DS, then old key', channel: 'dnssec',
      detail:
        'Remove the old DS after the wait, verify secure validation again, then retire the old KSK. Keep a rollback path until the new chain has been stable through at least one full TTL cycle.\n\nZSK rollover is simpler because it does not touch the parent DS; the same monitoring discipline still applies.',
      vault: [
        add('parent', ITEM.ds({ id: 'finalds', name: 'Final DS', meta: 'new tag only', value: 'example.com. 86400 IN DS 54321 13 2 123456...' })),
        add('dnslogs', ITEM.record({ id: 'verify', name: 'Post-rollover validation', meta: 'delv secure · AD=1', value: 'delv: fully validated\nAD=1 from two validating resolvers\nno SERVFAIL observed' })),
      ],
      tags: ['DS retirement', 'delv', 'AD=1', 'ZSK rollover'],
    },
  ],
  notes: [
    'Publish the child DNSKEY before the parent DS; remove the DS before the key.',
    'Keep both DS records during the transition and wait for TTLs.',
    'A ZSK rollover stays inside the zone; a KSK rollover crosses the parent.',
    'Back up the key directory and test restore, not just backup.',
  ],
  config: [
    cfg('Policy-driven signing', [
      '`dnssec-policy "default" { keys { ksk ...; zsk ...; }; };`',
      '`inline-signing yes;` keeps the unsigned source separate.',
      '`key-directory "/var/cache/bind/keys";` writable by BIND only.',
      '`rndc dnssec -status <zone>` for key state and next actions.',
    ]),
  ],
  pitfalls: [
    'Publishing the DS before the DNSKEY is visible.',
    'Removing the old DS immediately after the switch.',
    'Losing the key directory or restoring an old copy without the journal.',
    'Using a high NSEC3 iteration count on a busy zone.',
  ],
  productionChecks: [
    'Both DS records are monitored during the transition.',
    'Secondaries have the new keys and signatures.',
    '`delv` reports secure from multiple resolvers.',
    'Rollback includes DS, DNSKEY and key-directory state.',
  ],
};

export const bindPrimarySecondary = {
  id: 'bind-primary-secondary',
  title: 'Primary and secondary — NOTIFY, AXFR/IXFR and TSIG',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-replication',
  level: 'advanced',
  minutes: 12,
  tags: ['AXFR', 'IXFR', 'NOTIFY', 'secondary', 'TSIG', 'journal', 'EXPIRE'],
  summary:
    'Replicate a zone safely: bump the serial, send NOTIFY, authenticate the transfer with TSIG, apply an IXFR delta, verify both servers and understand what happens when the primary disappears.',
  nodes: ['admin', 'primary', 'secondary', 'monitor'],
  stores: ['authority', 'transfer', 'dnslogs', 'dnssec'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'admin', to: 'primary', badge: 'publish a new serial', channel: 'cli',
      detail:
        'A secondary only transfers when the primary’s SOA serial is newer. Bump the serial and reload/validate the zone before expecting replication.\n\nIf the serial did not increase (or wrapped), the secondary can silently keep serving old data.',
      http: {
        req: 'SOA serial 2026110501 → 2026110502\n$ rndc reload example.com',
        res: 'zone loaded, serial 2026110502',
      },
      vault: [
        add('authority', ITEM.record({ id: 'soa', name: 'Primary SOA', meta: 'serial 2026110502', value: 'example.com. 3600 IN SOA ns1.example.com. hostmaster.example.com. ( 2026110502 3600 900 1209600 300 )' })),
      ],
      tags: ['SOA serial', 'reload', 'replication trigger'],
    },
    {
      from: 'primary', to: 'secondary', badge: 'NOTIFY example.com', channel: 'xfer',
      detail:
        'The primary sends NOTIFY to the zone’s NS set and any `also-notify` addresses. NOTIFY is a hint, not the transfer itself; the secondary still checks the SOA serial.\n\nIf NOTIFY is blocked, replication can still happen on the REFRESH timer, but changes arrive late.',
      http: {
        req: 'NOTIFY example.com serial 2026110502',
        res: 'secondary acknowledges NOTIFY',
      },
      vault: [
        add('transfer', ITEM.record({ id: 'notify', name: 'NOTIFY', meta: 'serial hint · UDP 53', value: 'NOTIFY example.com 2026110502' })),
      ],
      tags: ['NOTIFY', 'also-notify', 'REFRESH'],
    },
    {
      from: 'secondary', to: 'primary', badge: 'SOA query, then IXFR with TSIG', channel: 'xfer',
      detail:
        'The secondary queries the primary SOA. If the serial is newer, it requests IXFR and offers its current serial. The primary may return a delta from the journal or fall back to a full AXFR.\n\nAXFR and IXFR use TCP/53. A firewall that allows only UDP breaks transfers.',
      http: {
        req: '$ dig @192.0.2.53 example.com IXFR=2026110501\n;; TSIG key xfr-key',
        res: 'IXFR 2026110501 → 2026110502\n+ www A 192.0.2.80',
      },
      vault: [
        add('transfer', ITEM.tsig({ id: 'key', name: 'xfr-key', meta: 'hmac-sha256 · shared secret', value: 'key "xfr-key" {\n  algorithm hmac-sha256;\n  secret "BASE64-SECRET";\n};' })),
        add('transfer', ITEM.journal({ id: 'ixfr', name: 'IXFR delta', meta: 'old → new serial', value: 'IXFR 2026110501 → 2026110502\n+ www.example.com. A 192.0.2.80' })),
      ],
      tags: ['IXFR', 'TCP/53', 'TSIG', 'hmac-sha256'],
    },
    {
      from: 'secondary', to: 'secondary', badge: 'apply the delta and journal', channel: 'internal',
      detail:
        'The secondary writes the new zone state and journal, then serves it authoritatively. The journal supports IXFR and crash recovery; do not delete it casually.\n\nA full AXFR can be large and expensive. Keep IXFR journals healthy and monitor journal size and disk space.',
      vault: [
        add('transfer', ITEM.journal({ id: 'jnl', name: 'Secondary journal', meta: 'applied IXFR · disk-backed', value: 'db.example.com.jnl\nstate: applied, serial 2026110502' })),
        add('authority', ITEM.answer({ id: 'sec', name: 'Secondary answer', meta: 'AA=1 · serial 2026110502', value: ';; flags: qr aa\nwww.example.com. 3600 IN A 192.0.2.80' })),
      ],
      tags: ['journal', 'disk space', 'crash recovery'],
    },
    {
      from: 'admin', to: 'monitor', badge: 'compare serials and zone status', channel: 'report',
      detail:
        'Verify with `rndc zonestatus example.com` on both servers and `dig @server example.com SOA`. Compare serials, refresh/retry/expire and the served answers.\n\nA “successful” NOTIFY does not prove the transfer succeeded. Check the secondary’s loaded serial.',
      http: {
        req: '$ rndc zonestatus example.com\n$ dig @ns2.example.net example.com SOA +short',
        res: 'serial: 2026110502\nns1.example.com. hostmaster.example.com. 2026110502 ...',
      },
      vault: [
        add('dnslogs', ITEM.record({ id: 'compare', name: 'Serial comparison', meta: 'primary = secondary', value: 'primary serial: 2026110502\nsecondary serial: 2026110502\ntransfer: IXFR OK' })),
      ],
      tags: ['zonestatus', 'serial comparison', 'verification'],
    },
    {
      from: 'secondary', to: 'monitor', badge: 'primary down → serve until EXPIRE', channel: 'report',
      detail:
        'If the primary is unreachable, the secondary keeps serving the last good copy until the SOA EXPIRE interval. After EXPIRE it must stop answering authoritatively to avoid serving stale data indefinitely.\n\nIf EXPIRE is shorter than REFRESH + RETRY, normal jitter can cause an outage. Size the timers together.',
      vault: [
        add('dnslogs', ITEM.dnserror({ id: 'expired', name: 'Zone expired', meta: 'no primary before EXPIRE', value: 'zone example.com: expired\nlast successful transfer: 14 days ago\nEXPIRE: 1209600 s' })),
      ],
      tags: ['EXPIRE', 'REFRESH', 'RETRY', 'stale data'],
    },
    {
      from: 'admin', to: 'primary', badge: 'fix transfer policy and test TCP', channel: 'cli',
      detail:
        'For transfer failures check: primary `allow-transfer`, TSIG key name/algorithm/secret, clock skew, TCP/53 reachability, firewall, journal corruption and disk space.\n\nUse `dig AXFR example.com @primary -y hmac-sha256:key:secret` for a controlled test, then remove the key from shell history. Better: use a temporary key file with `-k`.',
      vault: [
        add('dnslogs', ITEM.record({ id: 'policy', name: 'Transfer policy', meta: 'global none · zone allow by key', value: 'options { allow-transfer { none; }; };\nzone "example.com" {\n  allow-transfer { 192.0.2.54; key "xfr-key"; };\n};' })),
      ],
      tags: ['allow-transfer', 'TSIG test', 'clock skew', 'troubleshooting'],
    },
  ],
  notes: [
    'AXFR/IXFR use TCP/53. Test TCP explicitly.',
    'TSIG authenticates the transfer; source-address ACLs alone are weaker.',
    'The secondary keeps serving until EXPIRE, then stops.',
    'A hidden primary is not in the public NS set; only secondaries transfer from it.',
  ],
  config: [
    cfg('Primary transfer policy', [
      '`options { allow-transfer { none; }; };` — default deny.',
      '`zone "example.com" { allow-transfer { 192.0.2.54; key "xfr-key"; }; };`',
      '`notify yes; also-notify { 192.0.2.54; };`',
      '`key "xfr-key" { algorithm hmac-sha256; secret "..."; };`',
    ]),
    cfg('Secondary zone', [
      '`zone "example.com" { type secondary; primaries { 192.0.2.53 key "xfr-key"; }; file "/var/cache/bind/db.example.com"; };`',
      '`request-ixfr yes;` where supported.',
      'Monitor serial lag and journal/disk usage.',
    ]),
  ],
  pitfalls: [
    'Allowing transfers from `any` or relying only on source addresses.',
    'Blocking TCP/53 at the firewall.',
    'A serial that does not increase.',
    'EXPIRE shorter than the normal refresh/retry window.',
  ],
  productionChecks: [
    'Transfers are TSIG-authenticated and scoped.',
    'Both servers report the same serial.',
    'TCP/53 and NOTIFY paths are tested.',
    'Serial lag, journal size and EXPIRE are monitored.',
  ],
};

export const bindDynamicUpdate = {
  id: 'bind-dynamic-update',
  title: 'Dynamic update — TSIG, update-policy and the journal',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-replication',
  level: 'advanced',
  minutes: 10,
  tags: ['RFC 2136', 'dynamic update', 'TSIG', 'update-policy', 'journal', 'DHCP'],
  summary:
    'Let a DHCP server update forward and reverse records without opening the zone. Use a dedicated TSIG key, a narrow update-policy, the journal and a transfer to the secondary.',
  nodes: ['home', 'router', 'primary', 'secondary', 'monitor'],
  stores: ['home', 'router', 'authority', 'transfer', 'dnssec', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'home', to: 'router', badge: 'DHCP lease for laptop', channel: 'network',
      detail:
        'A home or office DHCP server hands out an address and may register a DNS name. The DHCP server acts as a DNS UPDATE client; the laptop itself does not need a TSIG key.\n\nUse a dedicated key per DHCP server or site, not one shared key for every client.',
      vault: [
        add('home', ITEM.record({ id: 'lease', name: 'DHCP lease', meta: 'laptop.lan · 192.0.2.150', value: 'hostname: laptop\naddress: 192.0.2.150\nlease: 24h' })),
      ],
      tags: ['DHCP', 'lease', 'DNS registration'],
    },
    {
      from: 'router', to: 'primary', badge: 'UPDATE with TSIG', channel: 'update',
      detail:
        'The DHCP server sends an RFC 2136 UPDATE with a TSIG signature. The key name, algorithm and secret must match the primary configuration.\n\nTSIG authenticates the message and protects integrity. It does not encrypt the update; DNS UPDATE is plaintext unless you use an encrypted transport.',
      http: {
        req: 'UPDATE example.com\nadd laptop.example.com. 300 IN A 192.0.2.150\n;; TSIG dhcp-key hmac-sha256',
        res: 'UPDATE accepted',
      },
      vault: [
        add('transfer', ITEM.tsig({ id: 'dhcpkey', name: 'dhcp-key', meta: 'dedicated DHCP update key', value: 'key "dhcp-key" {\n  algorithm hmac-sha256;\n  secret "BASE64-SECRET";\n};' })),
        add('router', ITEM.dnsacl({ id: 'policy', name: 'update-policy', meta: 'self *.dhcp.example.com A AAAA PTR', value: 'update-policy {\n  grant "dhcp-key" self *.dhcp.example.com. A AAAA PTR;\n};' })),
      ],
      tags: ['RFC 2136', 'TSIG', 'UPDATE'],
    },
    {
      from: 'primary', to: 'primary', badge: 'authorize name and type', channel: 'internal',
      detail:
        '`update-policy` decides which key may change which names and types. Use `self` for DHCP names, restrict to A/AAAA/PTR, and never grant `any` or the whole zone.\n\n`allow-update` is the older, broader form. Prefer `update-policy` for least privilege.',
      vault: [
        add('authority', ITEM.record({ id: 'allowed', name: 'Allowed update', meta: 'laptop.dhcp.example.com A', value: 'grant "dhcp-key" self *.dhcp.example.com. A AAAA PTR;' })),
        add('authority', ITEM.dnserror({ id: 'denied', name: 'Denied update', meta: 'wrong name or type → REFUSED', value: 'status: REFUSED\nname not permitted by update-policy' })),
      ],
      tags: ['update-policy', 'self', 'least privilege', 'REFUSED'],
    },
    {
      from: 'primary', to: 'primary', badge: 'write the journal', channel: 'internal',
      detail:
        'BIND records the change in a journal. The on-disk master file may not change until BIND rewrites it. Do not copy the text file over a running server without considering the journal.\n\nBack up the journal with the zone. A restore that ignores the journal can silently roll back dynamic records.',
      vault: [
        add('transfer', ITEM.journal({ id: 'jnl', name: 'Dynamic update journal', meta: 'laptop A added', value: '+ laptop.example.com. 300 IN A 192.0.2.150' })),
      ],
      tags: ['journal', 'master file', 'backup'],
    },
    {
      from: 'primary', to: 'secondary', badge: 'NOTIFY → IXFR', channel: 'xfer',
      detail:
        'The secondary receives NOTIFY and transfers the new serial through IXFR. Dynamic updates must replicate like any other zone change.\n\nIf secondaries serve stale data, clients may resolve the old address. Verify the loaded serial on every secondary.',
      vault: [
        add('transfer', ITEM.record({ id: 'notify', name: 'NOTIFY after update', meta: 'serial incremented', value: 'NOTIFY example.com\nIXFR contains + laptop A' })),
      ],
      tags: ['NOTIFY', 'IXFR', 'replication'],
    },
    {
      from: 'home', to: 'primary', badge: 'forward and reverse lookup', channel: 'dns',
      detail:
        'After the update, forward (A) and reverse (PTR) records should agree. DHCP may update both; if only one exists, forward-confirmed reverse DNS fails.\n\nTest from the client and from an authoritative query, not only through a cache.',
      http: {
        req: '$ dig laptop.dhcp.example.com A +short\n$ dig -x 192.0.2.150 +short',
        res: '192.0.2.150\nlaptop.dhcp.example.com.',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'fwd', name: 'Forward answer', meta: 'A 192.0.2.150', value: 'laptop.dhcp.example.com. 300 IN A 192.0.2.150' })),
        add('authority', ITEM.record({ id: 'ptr', name: 'Reverse PTR', meta: 'matches forward name', value: '150.2.0.192.in-addr.arpa. 300 IN PTR laptop.dhcp.example.com.' })),
      ],
      tags: ['forward DNS', 'reverse DNS', 'FCrDNS'],
    },
    {
      from: 'monitor', to: 'primary', badge: 'audit update logs and rate', channel: 'report',
      detail:
        'Log the `update` category and monitor update rate, failures and unexpected names. A key leak allows an attacker to create or remove records within its policy scope.\n\nRotate keys, scope them to a site, and alert on update spikes or updates outside the expected name pattern.',
      vault: [
        add('dnslogs', ITEM.record({ id: 'audit', name: 'Update audit', meta: 'key · name · type · result', value: 'update: client 192.0.2.1\nkey dhcp-key\nname laptop.dhcp.example.com A\nresult: success' })),
      ],
      tags: ['logging', 'audit', 'key rotation'],
    },
  ],
  notes: [
    'Never use `allow-update { any; };`. Use TSIG plus a narrow `update-policy`.',
    'The journal is part of the zone state; back it up and restore it with the zone.',
    'Dynamic updates are authenticated, not encrypted.',
    'Reverse DNS often lives in a separate zone; update both if the client expects FCrDNS.',
  ],
  config: [
    cfg('Scoped dynamic update', [
      '`key "dhcp-key" { algorithm hmac-sha256; secret "..."; };`',
      '`update-policy { grant "dhcp-key" self *.dhcp.example.com. A AAAA PTR; };`',
      '`journal` and `file` on a writable directory.',
      '`allow-transfer { ... key "xfr-key"; };` for secondaries.',
    ]),
  ],
  pitfalls: [
    'Using one shared key for every DHCP server and client.',
    'Granting updates for the whole zone or `any` type.',
    'Editing the master file while the journal is active.',
    'Forgetting reverse-zone updates.',
  ],
  productionChecks: [
    'Keys are scoped and rotated.',
    'Update-policy is least privilege and tested with denied cases.',
    'Journal and zone backups are restored together.',
    'Update rate and failures are monitored.',
  ],
};

export const bindOpenResolver = {
  id: 'bind-open-resolver',
  title: 'Open resolver — recursion exposure and amplification',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-security',
  level: 'core',
  minutes: 10,
  tags: ['open resolver', 'recursion', 'allow-recursion', 'amplification', 'RRL', 'cookies', 'cache'],
  summary:
    'See how an unrestricted BIND resolver becomes an abuse tool, then scope recursion and cache access, add rate limits and verify from an untrusted network.',
  nodes: ['client', 'resolver', 'root', 'router', 'admin', 'monitor'],
  stores: ['dnsclient', 'resolver', 'internet', 'home', 'router', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'client', to: 'resolver', badge: 'recursive query from anywhere', channel: 'front',
      detail:
        'A resolver with `recursion yes;` and no restrictive `allow-recursion` will resolve for any client that can reach UDP/TCP 53. That includes spoofed queries.\n\nAn authoritative-only server should use `recursion no;`. A resolver should allow only known client networks.',
      http: {
        req: '$ dig @203.0.113.53 example.com A +recurse',
        res: ';; flags: qr rd ra\n;; ANSWER SECTION:\nexample.com. 300 IN A 192.0.2.80',
      },
      vault: [
        add('dnsclient', ITEM.query({ id: 'q', name: 'recursive query from untrusted client', meta: 'RD=1 · spoofable UDP', value: ';example.com. IN A' })),
        add('resolver', ITEM.cache({ id: 'open', name: 'Open recursion', meta: 'allow-recursion any', value: 'recursion yes;\nallow-recursion { any; };' })),
      ],
      tags: ['open resolver', 'allow-recursion', 'spoofing'],
    },
    {
      from: 'resolver', to: 'root', badge: 'attacker makes the resolver work', channel: 'dns',
      detail:
        'The resolver performs full recursion: root, TLD and authoritative queries. An attacker can cause this work with a spoofed source address, then direct a larger response at a victim.\n\nThis is DNS amplification/reflection. The resolver becomes the unwitting source of the attack traffic.',
      vault: [
        add('internet', ITEM.answer({ id: 'amp', name: 'Amplified response', meta: 'small query → larger answer', value: 'spoofed source: 198.51.100.10\nresponse size: larger than query' })),
        add('dnslogs', ITEM.dnserror({ id: 'abuse', name: 'Abuse signal', meta: 'high qps · random names · spoofed clients', value: 'query rate spike\nmany random subdomains\nsource addresses not in client list' })),
      ],
      tags: ['amplification', 'reflection', 'DDoS'],
    },
    {
      from: 'admin', to: 'resolver', badge: 'inspect the policy', channel: 'cli',
      detail:
        'Check `recursion`, `allow-recursion`, `allow-query-cache`, `allow-query` and listener addresses. A broad `allow-query` does not automatically grant recursion, but a broad `allow-recursion` is the critical mistake.\n\nCheck IPv4 and IPv6. A firewall can mask exposure from your test network while leaving the service reachable elsewhere.',
      http: {
        req: '$ rndc status\n$ named-checkconf -p | grep -E "recursion|allow-"',
        res: 'recursion yes\nallow-recursion { any; };\nallow-query-cache { any; };',
      },
      vault: [
        add('resolver', ITEM.dnsacl({ id: 'bad', name: 'Current recursion ACL', meta: 'any — open resolver', value: 'recursion yes;\nallow-recursion { any; };\nallow-query-cache { any; };' })),
        add('resolver', ITEM.dnsacl({ id: 'listen', name: 'Listener addresses', meta: 'wildcard bind', value: 'listen-on { any; };' })),
      ],
      tags: ['rndc status', 'named-checkconf -p', 'IPv6'],
    },
    {
      from: 'admin', to: 'resolver', badge: 'scope recursion and cache', channel: 'cli',
      detail:
        'Replace `any` with explicit client networks or a named ACL. Restrict cache access to the same set. If the server is authoritative-only, set `recursion no;` and remove the cache path entirely.\n\nMake the listener match the intended network too; binding every interface is not the same as allowing every client, but both should be deliberate.',
      http: {
        req: 'acl "clients" { localhost; localnets; 10.20.0.0/16; };\nrecursion yes;\nallow-recursion { clients; };\nallow-query-cache { clients; };',
        res: 'policy tightened',
      },
      vault: [
        add('resolver', ITEM.dnsacl({ id: 'good', name: 'Scoped recursion ACL', meta: 'localhost + localnets + 10.20/16', value: 'acl "clients" {\n  localhost;\n  localnets;\n  10.20.0.0/16;\n};' })),
        add('resolver', ITEM.cache({ id: 'bounded', name: 'Bounded cache', meta: 'max-cache-size · limits', value: 'max-cache-size 512m;\nmax-recursion-queries 100;\nmax-recursion-depth 10;' })),
      ],
      tags: ['allow-recursion', 'allow-query-cache', 'recursion no', 'listeners'],
    },
    {
      from: 'client', to: 'resolver', badge: 'external test now REFUSED', channel: 'dns',
      detail:
        'After the change, an untrusted client gets REFUSED or times out, while an allowed client still resolves. Test from the actual external path, not from localhost.\n\nIf the answer still works from outside, the ACL, a view or the firewall is not doing what you think.',
      http: {
        req: '$ dig @203.0.113.53 example.com A +recurse',
        res: ';; ->>HEADER<<- status: REFUSED',
      },
      vault: [
        add('dnslogs', ITEM.answer({ id: 'refused', name: 'External REFUSED', meta: 'ACL enforced', value: 'status: REFUSED\nclient not in clients ACL' })),
      ],
      tags: ['REFUSED', 'external test', 'verification'],
    },
    {
      from: 'router', to: 'resolver', badge: 'home LAN forwarding', channel: 'network',
      detail:
        'At home, the router may forward DNS to BIND, or hand out BIND directly via DHCP. Either is fine if the resolver only accepts the LAN and the router does not expose port 53 to the internet.\n\nIf the router’s DNS forwarder is enabled, know which component caches, which validates DNSSEC and which upstream is used.',
      vault: [
        add('router', ITEM.dnsacl({ id: 'lan', name: 'LAN-only resolver', meta: '192.168.1.0/24', value: 'allow-recursion { 192.168.1.0/24; };\nallow-query-cache { 192.168.1.0/24; };' })),
        add('home', ITEM.answer({ id: 'home', name: 'Home client answer', meta: 'cached · validated', value: 'www.example.com. 300 IN A 192.0.2.80' })),
      ],
      tags: ['home lab', 'DHCP DNS', 'LAN', 'upstream'],
    },
    {
      from: 'admin', to: 'monitor', badge: 'RRL, cookies and monitoring', channel: 'report',
      detail:
        'Add defence in depth: response rate limiting (RRL), DNS cookies, bounded cache and recursion limits, patched BIND, and monitoring for query spikes and random-subdomain patterns.\n\nRRL and cookies reduce abuse but do not replace a correct recursion ACL. Patch promptly; resolver bugs are high impact.',
      vault: [
        add('resolver', ITEM.record({ id: 'rrl', name: 'RRL + cookies', meta: 'rate-limit · cookie-secret', value: 'rate-limit {\n  responses-per-second 20;\n  window 5;\n  slip 2;\n};' })),
        add('dnslogs', ITEM.record({ id: 'alert', name: 'Abuse alert', meta: 'qps spike · REFUSED · RRL drops', value: 'alert: query rate 20x baseline\ntop qname: random.example\nRRL dropped: 42%' })),
      ],
      tags: ['RRL', 'DNS cookies', 'patching', 'monitoring'],
    },
  ],
  notes: [
    'An open resolver is an abuse risk even when the content is public.',
    'Test recursion from an untrusted network, not from localhost.',
    '`allow-query` and `allow-recursion` are different controls.',
    'RRL and cookies are defence in depth, not a substitute for ACLs.',
  ],
  config: [
    cfg('Resolver hardening', [
      '`recursion yes;` only where required.',
      '`allow-recursion { clients; };` and `allow-query-cache { clients; };`',
      '`max-cache-size 512m;`',
      '`max-recursion-queries 100;` / `max-recursion-depth 10;`',
      '`rate-limit { responses-per-second 20; };` where appropriate.',
      '`dnssec-validation auto;`',
    ]),
    cfg('Authoritative-only', [
      '`recursion no;`',
      '`allow-query { any; };` for public authoritative zones.',
      '`allow-transfer { none; };` then explicit secondaries.',
      'Do not run a cache on a public authoritative server.',
    ]),
  ],
  pitfalls: [
    'Leaving `allow-recursion { any; };` because “it works”.',
    'Restricting `allow-query` but not `allow-recursion`.',
    'Forgetting IPv6 listeners and firewall rules.',
    'Assuming an upstream ISP resolver protects your own resolver.',
  ],
  productionChecks: [
    'External recursion test returns REFUSED.',
    'Cache, recursion and rate limits are bounded.',
    'IPv4 and IPv6 exposure are both tested.',
    'Query spikes and REFUSED rates are alerted.',
  ],
};

export const bindSplitHorizon = {
  id: 'bind-split-horizon',
  title: 'Split horizon — views, match-clients and RPZ',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-security',
  level: 'advanced',
  minutes: 12,
  tags: ['views', 'split horizon', 'match-clients', 'RPZ', 'internal DNS', 'policy'],
  summary:
    'Serve different answers to internal and external clients with ordered views, then add a response policy zone. Test view selection, fallback order and DNSSEC consistency.',
  nodes: ['client', 'resolver', 'primary', 'parent', 'admin', 'monitor'],
  stores: ['dnsclient', 'resolver', 'authority', 'parent', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'client', to: 'resolver', badge: 'internal client queries wiki', channel: 'front',
      detail:
        'A client from 10.20.0.0/16 asks for wiki.corp.example. The resolver must select the internal view before any catch-all view.\n\nViews are ordered. The first matching `match-clients` wins; a later view is unreachable for that client.',
      vault: [
        add('dnsclient', ITEM.query({ id: 'q', name: 'wiki.corp.example A', meta: 'source 10.20.0.10', value: ';wiki.corp.example. IN A' })),
        add('resolver', ITEM.dnsacl({ id: 'view', name: 'View selection', meta: 'internal first', value: 'view "internal" { match-clients { 10.20.0.0/16; }; ... };\nview "external" { match-clients { any; }; ... };' })),
      ],
      tags: ['views', 'match-clients', 'ordering'],
    },
    {
      from: 'resolver', to: 'primary', badge: 'internal answer 10.20.0.10', channel: 'dns',
      detail:
        'The internal view has its own zone data and recursion policy. It returns the private address and may allow recursion for internal clients.\n\nDNSSEC state is per view. A signed internal view and an unsigned external view are different zones, even if they share a name.',
      http: {
        req: '$ dig @192.0.2.53 wiki.corp.example A +short',
        res: '10.20.0.10',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'internal', name: 'Internal answer', meta: 'private address', value: 'wiki.corp.example. 300 IN A 10.20.0.10' })),
        add('authority', ITEM.zone({ id: 'intzone', name: 'db.corp.example.internal', meta: 'internal view zone', value: '$ORIGIN corp.example.\nwiki IN A 10.20.0.10' })),
      ],
      tags: ['internal view', 'private address', 'per-view zone'],
    },
    {
      from: 'client', to: 'resolver', badge: 'external client queries the same name', channel: 'front',
      detail:
        'A client outside 10.20.0.0/16 falls through to the external view. It must not see internal names or private addresses.\n\nIf the catch-all view is first, every client sees the external data. If the internal view is too broad, internal names leak.',
      vault: [
        add('dnsclient', ITEM.query({ id: 'q2', name: 'wiki.corp.example A', meta: 'source 198.51.100.10', value: ';wiki.corp.example. IN A' })),
      ],
      tags: ['external view', 'fallback', 'leak test'],
    },
    {
      from: 'resolver', to: 'primary', badge: 'external answer NXDOMAIN or public data', channel: 'back',
      detail:
        'The external view returns either public data or NXDOMAIN. It should not contain the internal zone. Test the actual external path and multiple source addresses, including IPv6.\n\nA view error can expose internal names or hide public zones. Treat the view order as security policy.',
      http: {
        res: ';; ->>HEADER<<- status: NXDOMAIN\n;; AUTHORITY SECTION:\ncorp.example. 300 IN SOA ...',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'external', name: 'External answer', meta: 'NXDOMAIN · no internal data', value: 'status: NXDOMAIN\nno private address returned' })),
      ],
      tags: ['NXDOMAIN', 'leak prevention', 'source testing'],
    },
    {
      from: 'admin', to: 'primary', badge: 'add an RPZ policy zone', channel: 'cli',
      detail:
        'A Response Policy Zone lets a resolver block or rewrite answers. Use it for malware domains or local policy, not as a general firewall.\n\nRPZ requires recursion. A bad feed can break legitimate services, so use observe-only mode and monitor hit rates before enforcing.',
      http: {
        req: 'options { response-policy { zone "rpz.example"; }; };',
        res: 'RPZ attached',
      },
      vault: [
        add('authority', ITEM.zone({ id: 'rpz', name: 'rpz.example', meta: 'block · sinkhole · rewrite', value: '$ORIGIN rpz.example.\nbad.example CNAME .\nsinkhole.example A 192.0.2.250' })),
        add('authority', ITEM.record({ id: 'policy', name: 'response-policy', meta: 'zone rpz.example', value: 'response-policy { zone "rpz.example"; };' })),
      ],
      tags: ['RPZ', 'response policy', 'observe-only'],
    },
    {
      from: 'client', to: 'resolver', badge: 'blocked name → NXDOMAIN/sinkhole', channel: 'back',
      detail:
        'A blocked name returns the policy action: NXDOMAIN, a fixed address or a rewritten CNAME. Log the policy hit and the rule that matched.\n\nDo not let an RPZ feed silently override DNSSEC-validated data without understanding the validation interaction.',
      http: {
        res: ';; ->>HEADER<<- status: NXDOMAIN\n;; policy: rpz.example',
      },
      vault: [
        add('dnslogs', ITEM.record({ id: 'hit', name: 'RPZ hit', meta: 'bad.example · blocked', value: 'policy zone: rpz.example\nqname: bad.example\naction: NXDOMAIN' })),
      ],
      tags: ['RPZ hit', 'NXDOMAIN', 'sinkhole'],
    },
    {
      from: 'admin', to: 'resolver', badge: 'test view order + DNSSEC per view', channel: 'cli',
      detail:
        'Test every client class: internal IPv4, internal IPv6, external IPv4, external IPv6 and NAT boundaries. Verify that the expected view answers and that no internal zone leaks.\n\nIf both views are signed, each needs its own keys, DS and signatures. Do not assume a DS from one view applies to the other.',
      vault: [
        add('dnslogs', ITEM.record({ id: 'matrix', name: 'View test matrix', meta: 'internal/external · IPv4/IPv6', value: '10.20.0.10 → internal 10.20.0.10\n198.51.100.10 → external NXDOMAIN\n2001:db8:20::10 → internal\n2001:db8:99::10 → external' })),
      ],
      tags: ['test matrix', 'IPv6', 'per-view DNSSEC'],
    },
  ],
  notes: [
    'Views are evaluated in order; the first match wins.',
    'A catch-all view before a specific view makes the specific view unreachable.',
    'Keep internal and external zone files separate and reviewed independently.',
    'RPZ requires recursion and can break legitimate names if the feed is bad.',
  ],
  config: [
    cfg('Two views', [
      '`view "internal" { match-clients { 10.20.0.0/16; }; recursion yes; allow-recursion { 10.20.0.0/16; }; ... };`',
      '`view "external" { match-clients { any; }; recursion no; ... };`',
      'Keep zone files and DNSSEC state separate per view.',
    ]),
    cfg('RPZ', [
      '`options { response-policy { zone "rpz.example"; }; };`',
      '`zone "rpz.example" { type primary; file "db.rpz.example"; };`',
      'Test with observe-only and monitor hits before enforcing.',
    ]),
  ],
  pitfalls: [
    'Ordering the catch-all view first.',
    'Forgetting IPv6 in match-clients and tests.',
    'Sharing one zone file between views with different data.',
    'Assuming DP/DS state is shared across views.',
  ],
  productionChecks: [
    'View order and fallback are documented and tested.',
    'Internal names are not visible externally.',
    'RPZ feed changes are reviewed and monitored.',
    'DNSSEC is validated separately per view.',
  ],
};

export const bindHomeLab = {
  id: 'bind-home-lab',
  title: 'Home lab — BIND, DHCP and a private DNS domain',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-security',
  level: 'core',
  minutes: 10,
  tags: ['home lab', 'DHCP', 'private DNS', 'forwarder', 'DoT', 'DoH', 'cache', 'privacy'],
  summary:
    'Build a small home DNS service: router DHCP hands out BIND, BIND serves a private domain, forwards public names, caches and optionally encrypts upstream traffic. Includes BIND versus Pi-hole/AdGuard/dnsmasq guidance.',
  nodes: ['home', 'router', 'resolver', 'root', 'monitor'],
  stores: ['home', 'router', 'resolver', 'internet', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'home', to: 'router', badge: 'DHCP hands out DNS', channel: 'network',
      detail:
        'The router’s DHCP server tells clients which DNS resolver to use. Set it to the BIND host, not the ISP router, if you want local names and consistent policy.\n\nIf the router also runs a DNS forwarder, decide which component is authoritative for the LAN and which one caches.',
      vault: [
        add('router', ITEM.record({ id: 'dhcp', name: 'DHCP option 6', meta: 'DNS = 192.168.1.53', value: 'option domain-name-servers 192.168.1.53;' })),
        add('home', ITEM.record({ id: 'client', name: 'Home client', meta: 'laptop · phone · IoT', value: 'resolv.conf / DHCP DNS: 192.168.1.53' })),
      ],
      tags: ['DHCP option 6', 'LAN DNS', 'router'],
    },
    {
      from: 'router', to: 'resolver', badge: 'local queries to BIND', channel: 'dns',
      detail:
        'Client queries arrive at BIND on the LAN interface. Restrict recursion to the LAN and bind only to the intended addresses.\n\nA home resolver is still a resolver: do not expose port 53 to the internet, and do not enable recursion on a public interface.',
      http: {
        req: 'options {\n  listen-on { 127.0.0.1; 192.168.1.53; };\n  recursion yes;\n  allow-recursion { 192.168.1.0/24; };\n};',
        res: 'LAN resolver ready',
      },
      vault: [
        add('resolver', ITEM.dnsacl({ id: 'lan', name: 'LAN recursion ACL', meta: '192.168.1.0/24 only', value: 'allow-recursion { 192.168.1.0/24; };\nallow-query-cache { 192.168.1.0/24; };' })),
      ],
      tags: ['listen-on', 'allow-recursion', 'LAN'],
    },
    {
      from: 'resolver', to: 'resolver', badge: 'serve home.arpa / lan', channel: 'internal',
      detail:
        'Serve a private zone for your own names, for example `home.arpa` or `lan`. Use a real zone file with SOA and NS; do not rely on wildcard hacks.\n\nFor reverse DNS, create the matching `in-addr.arpa` zone if local PTR lookups matter. Many home services tolerate missing reverse, but mail and monitoring often do not.',
      vault: [
        add('resolver', ITEM.zone({ id: 'homezone', name: 'db.home.arpa', meta: 'SOA + NS + A records', value: '$ORIGIN home.arpa.\n$TTL 300\n@ IN SOA ns1.home.arpa. hostmaster.home.arpa. ( 2026110501 3600 900 1209600 300 )\n@ IN NS ns1.home.arpa.\nns1 IN A 192.168.1.53\nrouter IN A 192.168.1.1\nnas IN A 192.168.1.20' })),
      ],
      tags: ['home.arpa', 'private zone', 'reverse DNS'],
    },
    {
      from: 'resolver', to: 'root', badge: 'resolve or forward public names', channel: 'dns',
      detail:
        'You can recurse directly from the root (privacy, independence) or forward to an upstream resolver (simpler, policy-controlled). Either way, understand who sees your queries and whether DNSSEC is validated.\n\nForwarding to a public resolver is not automatically more private; it moves trust to that resolver.',
      http: {
        req: '// direct recursion\nrecursion yes;\ndnssec-validation auto;\n\n// or forward\nforwarders { 192.0.2.1; };\nforward only;',
        res: 'upstream path selected',
      },
      vault: [
        add('resolver', ITEM.cache({ id: 'cache', name: 'Local cache', meta: 'TTL-bound · validated', value: 'cache: 512 MB\nvalidation: auto\nforwarders: none (direct recursion)' })),
        add('internet', ITEM.answer({ id: 'public', name: 'Public answer', meta: 'root/TLD path', value: 'www.example.com. 3600 IN A 192.0.2.80' })),
      ],
      tags: ['recursion', 'forwarders', 'DNSSEC validation', 'privacy'],
    },
    {
      from: 'resolver', to: 'monitor', badge: 'cache, query log and retention', channel: 'report',
      detail:
        'Keep query logging off by default, or use a short retention and restrict access. DNS logs reveal browsing and device behaviour.\n\nMonitor cache hit ratio, SERVFAIL, disk space and resolver health. A home resolver that silently fails makes every device look broken.',
      vault: [
        add('dnslogs', ITEM.record({ id: 'privacy', name: 'Logging policy', meta: 'no query log by default', value: 'querylog: off\nsecurity/dnssec: on\nretention: 7 days\naccess: admin only' })),
      ],
      tags: ['query logging', 'privacy', 'retention'],
    },
    {
      from: 'home', to: 'resolver', badge: 'optional DoT/DoH upstream', channel: 'dns',
      detail:
        'DNS-over-TLS (port 853) and DNS-over-HTTPS (443) protect the path between BIND and an upstream resolver. They do not replace DNSSEC and they move trust to the upstream provider.\n\nFor a home lab, DoT to a trusted resolver is often simpler than exposing BIND’s own DoH endpoint. If you terminate TLS in BIND, you add certificate and web-stack operations.',
      http: {
        req: '// BIND forwarder over TLS (example shape)\nforwarders { 192.0.2.1; };\n// TLS configuration depends on BIND version and build',
        res: 'encrypted upstream selected',
      },
      vault: [
        add('resolver', ITEM.record({ id: 'dot', name: 'Encrypted upstream', meta: 'DoT/DoH · trust moved upstream', value: 'transport: TLS 853 / HTTPS 443\nvalidation: DNSSEC still required\ncertificate expiry monitored' })),
      ],
      tags: ['DoT', 'DoH', 'privacy', 'trust'],
    },
    {
      from: 'home', to: 'resolver', badge: 'verify local and public names', channel: 'dns',
      detail:
        'Verify a local name, a public name and a deliberately missing name. Check the resolver from a client, not only from the server. If local names fail but public names work, the zone or view is the problem.\n\nKeep a note of the resolver address, zone files and upstream policy so the next change is reversible.',
      http: {
        req: '$ dig @192.168.1.53 nas.home.arpa A +short\n$ dig @192.168.1.53 example.com A +short\n$ dig @192.168.1.53 missing.home.arpa A',
        res: '192.168.1.20\n192.0.2.80\nstatus: NXDOMAIN',
      },
      vault: [
        add('dnslogs', ITEM.record({ id: 'verify', name: 'Home verification', meta: 'local + public + negative', value: 'nas.home.arpa → 192.168.1.20\nexample.com → 192.0.2.80\nmissing.home.arpa → NXDOMAIN' })),
      ],
      tags: ['verification', 'local zone', 'NXDOMAIN'],
    },
  ],
  notes: [
    'Pi-hole/AdGuard Home are DNS forwarders with filtering; BIND is a full DNS server. You can combine them, but decide which one is authoritative and which one caches.',
    'dnsmasq is common on routers and small Linux hosts; it is simpler but less capable for DNSSEC and views.',
    'A home resolver should never be reachable from the internet on port 53.',
    'Query logs are sensitive. Keep retention short and access controlled.',
  ],
  config: [
    cfg('Minimal home resolver', [
      '`listen-on { 127.0.0.1; 192.168.1.53; };`',
      '`recursion yes;` with `allow-recursion { 192.168.1.0/24; };`',
      '`dnssec-validation auto;`',
      '`zone "home.arpa" { type primary; file "/etc/bind/db.home.arpa"; };`',
      'A reverse zone for `1.168.192.in-addr.arpa` if PTR matters.',
    ]),
  ],
  pitfalls: [
    'Handing out the ISP router as DNS and wondering why local names fail.',
    'Exposing BIND to the internet to “make it work from outside”.',
    'Turning off DNSSEC validation because one domain fails.',
    'Keeping query logs forever on a shared family network.',
  ],
  productionChecks: [
    'LAN clients use the intended resolver.',
    'Recursion is restricted to the LAN.',
    'Local and public names both resolve.',
    'Upstream privacy and DNSSEC validation are deliberate.',
  ],
};

export const bindTroubleshootServfail = {
  id: 'bind-troubleshoot-servfail',
  title: 'Troubleshooting SERVFAIL — delegation, DNSSEC and timeouts',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-ops',
  level: 'core',
  minutes: 12,
  tags: ['SERVFAIL', 'dig', 'delv', 'DNSSEC', 'delegation', 'timeout', 'support'],
  summary:
    'Work a SERVFAIL like a level-3 support engineer: prove whether the authoritative server, the delegation, the DNSSEC chain, the firewall or the resolver is at fault, then verify the fix.',
  nodes: ['client', 'resolver', 'root', 'tld', 'parent', 'primary', 'admin', 'monitor'],
  stores: ['dnsclient', 'resolver', 'internet', 'parent', 'authority', 'dnssec', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'client', to: 'resolver', badge: 'SERVFAIL for www.example.com', channel: 'front',
      detail:
        'Start with the exact symptom: query name, type, resolver, time and RCODE. SERVFAIL is a server-side failure, not “the name does not exist”. The resolver could not produce a trustworthy answer.\n\nDo not restart services yet. First separate authoritative data, delegation, DNSSEC and network reachability.',
      http: {
        req: '$ dig www.example.com A',
        res: ';; ->>HEADER<<- status: SERVFAIL, flags: qr rd ra',
      },
      vault: [
        add('dnsclient', ITEM.dnserror({ id: 'symptom', name: 'SERVFAIL', meta: 'resolver 192.0.2.53 · www A', value: ';; ->>HEADER<<- status: SERVFAIL' })),
      ],
      tags: ['SERVFAIL', 'symptom', 'scope'],
    },
    {
      from: 'admin', to: 'primary', badge: 'query the authoritative server directly', channel: 'cli',
      detail:
        'Use `dig @ns1.example.com www.example.com A +norecurse`. If this answers AA=1, the zone and server are healthy and the problem is above the server: delegation, DNSSEC or the resolver path.\n\nIf it times out, check listeners, firewall, TCP/UDP 53 and whether named is running.',
      http: {
        req: '$ dig @192.0.2.53 www.example.com A +norecurse',
        res: ';; flags: qr aa\n;; ANSWER SECTION:\nwww.example.com. 3600 IN A 192.0.2.80',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'direct', name: 'Direct authoritative answer', meta: 'AA=1 · server healthy', value: 'www.example.com. 3600 IN A 192.0.2.80' })),
      ],
      tags: ['+norecurse', 'authoritative', 'timeout'],
    },
    {
      from: 'admin', to: 'parent', badge: 'check the delegation', channel: 'cli',
      detail:
        'Ask the parent for the NS set and DS. Compare with the child apex NS and DNSKEY. Missing glue, a lame delegation or a wrong DS all produce failures above an otherwise healthy server.\n\nUse `dig +trace` to see the actual referral path from the root.',
      http: {
        req: '$ dig @a.gtld-servers.net example.com NS +norecurse\n$ dig @a.gtld-servers.net example.com DS +dnssec\n$ dig +trace www.example.com A',
        res: 'example.com. NS ns1.example.com.\nexample.com. DS 12345 13 2 ...',
      },
      vault: [
        add('parent', ITEM.record({ id: 'ns', name: 'Parent NS', meta: 'matches child apex', value: 'example.com. 172800 IN NS ns1.example.com.\nexample.com. 172800 IN NS ns2.example.net.' })),
        add('parent', ITEM.ds({ id: 'ds', name: 'Parent DS', meta: 'must match child DNSKEY', value: 'example.com. 86400 IN DS 12345 13 2 ABCDEF...' })),
      ],
      tags: ['delegation', '+trace', 'glue', 'DS'],
    },
    {
      from: 'admin', to: 'resolver', badge: 'separate DNSSEC from transport', channel: 'dnssec',
      detail:
        'Query with `+dnssec +cd` to disable validation and see the raw signed data. If that works but normal validation fails, the chain or signatures are the problem, not the network.\n\nThen run `delv +rtrace` or `delv +vtrace` to see exactly which link failed.',
      http: {
        req: '$ dig @192.0.2.53 www.example.com A +dnssec +cd\n$ delv @192.0.2.53 www.example.com A +rtrace',
        res: ';; flags: qr rd ra cd\nwww.example.com. 3600 IN A 192.0.2.80\n;; validation: bogus (RRSIG expired)',
      },
      vault: [
        add('resolver', ITEM.answer({ id: 'cd', name: 'CD=1 raw answer', meta: 'bypasses validation for diagnosis', value: ';; flags: qr rd ra cd\nwww.example.com. 3600 IN A 192.0.2.80' })),
        add('dnssec', ITEM.dnserror({ id: 'bogus', name: 'Validation failure', meta: 'RRSIG expired', value: 'delv: resolution failed: RRSIG example.com/A expired' })),
      ],
      tags: ['+cd', 'delv +rtrace', 'bogus', 'RRSIG'],
    },
    {
      from: 'admin', to: 'primary', badge: 'inspect signatures and key state', channel: 'cli',
      detail:
        'Check the earliest RRSIG expiry, the DNSKEY set and the zone’s DNSSEC policy. If signatures expired, the signer is broken, the key directory is missing or the server clock is wrong.\n\n`rndc dnssec -status` and the `dnssec` log category are the first places to look.',
      http: {
        req: '$ rndc dnssec -status example.com\n$ dig @192.0.2.53 example.com DNSKEY +dnssec',
        res: 'key 12345: active\nRRSIG expiry: 2026-11-01 (expired)',
      },
      vault: [
        add('dnssec', ITEM.rrsig({ id: 'expired', name: 'Expired RRSIG', meta: 'expiry in the past', value: 'RRSIG A 13 3 3600 20261101000000 20261001000000 12345 example.com.' })),
        add('dnslogs', ITEM.record({ id: 'log', name: 'dnssec log', meta: 'signing failure · expired signature', value: 'zone example.com: RRSIG A expired\nkey-directory: read-only or missing' })),
      ],
      tags: ['RRSIG expiry', 'rndc dnssec', 'key-directory', 'clock'],
    },
    {
      from: 'primary', to: 'resolver', badge: 'fix and revalidate', channel: 'dnssec',
      detail:
        'Fix the signer, key directory or clock, reload and verify with `delv`. Then check multiple validating resolvers and wait for caches to expire.\n\nIf the fix changes the DS or keys, follow the rollover order: DNSKEY first, DS alongside the old, then retire.',
      vault: [
        add('dnssec', ITEM.answer({ id: 'fixed', name: 'Revalidated answer', meta: 'delv secure · AD=1', value: 'delv: fully validated\nwww.example.com. 3600 IN A 192.0.2.80' })),
      ],
      tags: ['fix', 'revalidate', 'cache expiry'],
    },
    {
      from: 'monitor', to: 'admin', badge: 'verify from outside + record evidence', channel: 'report',
      detail:
        'Verify from an external resolver and from the authoritative servers. Record the exact commands and outputs in the incident. A SERVFAIL that disappears can return when caches refill.\n\nAdd an alert for earliest RRSIG expiry and DNSSEC validation failures so the next incident is detected before users report it.',
      vault: [
        add('dnslogs', ITEM.record({ id: 'evidence', name: 'Incident evidence', meta: 'commands · times · resolvers', value: 'before: SERVFAIL from 1.1.1.1 and 8.8.8.8\nauthoritative: AA=1\ncause: expired RRSIG\nafter: AD=1 from both resolvers' })),
      ],
      tags: ['external verification', 'evidence', 'alerting'],
    },
  ],
  notes: [
    'SERVFAIL is not NXDOMAIN. Do not “fix” it by adding a wildcard.',
    'Check the authoritative server before changing the resolver.',
    '`+cd` shows raw data but must not be used as a production workaround.',
    'A broken DNSSEC chain is an outage for validating clients even if the unsigned answer looks fine.',
  ],
  config: [
    cfg('Diagnostic commands', [
      '`dig @auth www.example.com A +norecurse`',
      '`dig @parent example.com NS +norecurse`',
      '`dig @parent example.com DS +dnssec`',
      '`dig +trace www.example.com A`',
      '`dig @resolver www.example.com A +dnssec +cd`',
      '`delv @resolver www.example.com A +rtrace`',
    ]),
  ],
  pitfalls: [
    'Restarting BIND before collecting evidence.',
    'Testing only through one resolver.',
    'Disabling DNSSEC validation globally.',
    'Forgetting TCP/53 and IPv6 in the network tests.',
  ],
  productionChecks: [
    'RRSIG expiry is alerted before it fails.',
    'Authoritative and recursive checks are separate.',
    'External and internal resolvers are both tested.',
    'Incident evidence includes exact commands and timestamps.',
  ],
};

export const bindChangeWorkflow = {
  id: 'bind-change-workflow',
  title: 'DNS change workflow — validate, diff, deploy and roll back',
  topic: 'bind',
  layout: 'bind',
  category: 'bind-ops',
  level: 'core',
  minutes: 10,
  tags: ['change control', 'named-checkconf', 'named-checkzone', 'diff', 'reload', 'rollback'],
  summary:
    'Take a DNS change from edit to verified production: inspect the include tree, analyze the diff, validate with the real BIND tools, stage the transfer, reload, verify and keep a rollback.',
  nodes: ['admin', 'primary', 'secondary', 'monitor'],
  stores: ['authority', 'zonedata', 'transfer', 'dnslogs'],
  nodeLabels: LABELS,
  steps: [
    {
      from: 'admin', to: 'admin', badge: 'inspect and analyze the workspace', channel: 'cli',
      detail:
        'Before editing, map the files: entry point, includes, zone declarations, zone files and keys. A change in an included file can affect several views or zones.\n\nUse a static analyzer for structural and security findings, but treat it as review support, not as a compiler.',
      vault: [
        add('authority', ITEM.namedconf({ id: 'entry', name: 'named.conf entry point', meta: 'includes + zones', value: 'named.conf\n├── named.conf.options\n├── named.conf.local\n└── zones/db.example.com' })),
      ],
      tags: ['include tree', 'analysis', 'review'],
    },
    {
      from: 'admin', to: 'primary', badge: 'named-checkconf + named-checkzone', channel: 'cli',
      detail:
        'Run both validators with the production binary and the production paths. `named-checkconf -z` loads all zones; `named-checkzone` checks one master file in detail.\n\nKeep the output with the change record. “It looked fine in the browser” is not a validation result.',
      http: {
        req: '$ named-checkconf -z /etc/bind/named.conf\n$ named-checkzone example.com /etc/bind/zones/db.example.com',
        res: 'zone example.com/IN: loaded serial 2026110502\nOK',
      },
      vault: [
        add('authority', ITEM.record({ id: 'valid', name: 'Validation output', meta: 'checkconf + checkzone OK', value: 'named-checkconf: no errors\nzone example.com/IN: loaded serial 2026110502\nOK' })),
      ],
      tags: ['named-checkconf', 'named-checkzone', 'production binary'],
    },
    {
      from: 'admin', to: 'primary', badge: 'semantic diff before publish', channel: 'cli',
      detail:
        'A line diff is necessary but not sufficient. Compare records by owner, type and canonical RDATA: added/removed records, TTL changes, SOA serial changes and directive-level named.conf changes.\n\nThis catches reordered files that are semantically identical and highlights a serial change hidden by formatting.',
      vault: [
        add('zonedata', ITEM.record({ id: 'diff', name: 'Semantic zone diff', meta: '+ www A · serial changed', value: '+ www.example.com. 3600 IN A 192.0.2.80\n~ SOA serial 2026110501 → 2026110502' })),
      ],
      tags: ['semantic diff', 'SOA serial', 'RDATA'],
    },
    {
      from: 'primary', to: 'secondary', badge: 'stage and transfer', channel: 'xfer',
      detail:
        'Stage the change on a secondary or a test instance first when possible. If production is the only target, at least verify the secondary transfer and keep the old files.\n\nA staged secondary can prove the zone loads and transfers before every public server changes.',
      vault: [
        add('transfer', ITEM.answer({ id: 'stage', name: 'Staged secondary', meta: 'serial 2026110502 · IXFR OK', value: 'secondary loaded serial 2026110502\ntransfer: IXFR OK' })),
      ],
      tags: ['staging', 'IXFR', 'secondary'],
    },
    {
      from: 'admin', to: 'primary', badge: 'reload and observe', channel: 'cli',
      detail:
        'Reload with `rndc reload` or `rndc reconfig` as appropriate, then check `rndc status`, `rndc zonestatus` and the logs. A command returning zero does not guarantee the new zone loaded.\n\nWatch error rates, SERVFAIL and transfer lag after the change.',
      http: {
        req: '$ rndc reload\n$ rndc zonestatus example.com\n$ rndc status',
        res: 'zone example.com/IN: loaded serial 2026110502\nserver is up and running',
      },
      vault: [
        add('authority', ITEM.answer({ id: 'loaded', name: 'Loaded zone', meta: 'serial 2026110502', value: 'zone example.com/IN: loaded serial 2026110502' })),
      ],
      tags: ['rndc reload', 'zonestatus', 'logs'],
    },
    {
      from: 'admin', to: 'monitor', badge: 'verify authoritative + recursive + DNSSEC', channel: 'report',
      detail:
        'Verify from an authoritative server, a recursive resolver and a DNSSEC-aware client. Check positive, negative and DNSSEC cases. If the zone is signed, confirm AD=1 or `delv` secure.\n\nCompare the observed serial and answers with the change record.',
      http: {
        req: '$ dig @ns1.example.com www.example.com A +norecurse\n$ dig @1.1.1.1 www.example.com A +dnssec\n$ delv @1.1.1.1 www.example.com A +rtrace',
        res: 'AA=1 · 192.0.2.80\nAD=1 · secure',
      },
      vault: [
        add('dnslogs', ITEM.record({ id: 'verify', name: 'Post-change verification', meta: 'authoritative + recursive + DNSSEC', value: 'authoritative: AA=1\nrecursive: AD=1\ndelv: secure\nserial: 2026110502' })),
      ],
      tags: ['verification', 'AD=1', 'delv', 'serial'],
    },
    {
      from: 'admin', to: 'primary', badge: 'rollback if verification fails', channel: 'cli',
      detail:
        'If verification fails, restore the previous files, serial and keys, reload and verify again. Do not “fix forward” during an outage unless the fix is understood and tested.\n\nKeep the old zone, journal and key state together. A partial restore can leave the zone inconsistent or unsigned.',
      vault: [
        add('authority', ITEM.record({ id: 'rollback', name: 'Rollback bundle', meta: 'previous config + zone + journal + keys', value: 'restore: named.conf, db.example.com, db.example.com.jnl\nprevious serial: 2026110501\nreload + verify' })),
      ],
      tags: ['rollback', 'journal', 'keys', 'recovery'],
    },
  ],
  notes: [
    'A browser analyzer is not a compiler; run the real BIND tools.',
    'Compare semantically, then verify live from more than one vantage point.',
    'A successful reload command is not proof the zone loaded.',
    'Rollback must include journals and DNSSEC key state, not only the text file.',
  ],
  config: [
    cfg('Change gate', [
      'Inspect every include and zone declaration.',
      '`named-checkconf -z` and `named-checkzone` with the production binary.',
      'Semantic diff: records, TTLs, SOA serial, directives.',
      'Stage on a secondary where possible.',
      'Reload, verify authoritative + recursive + DNSSEC.',
      'Keep a tested rollback bundle.',
    ]),
  ],
  pitfalls: [
    'Editing production without a saved previous version.',
    'Skipping `named-checkconf` because the analyzer passed.',
    'Copying a zone over a running server without the journal.',
    'Treating one resolver’s cached answer as authoritative truth.',
  ],
  productionChecks: [
    'Change record includes commands, outputs and serials.',
    'Secondary transfer is verified.',
    'DNSSEC state is verified after the change.',
    'Rollback is tested, not just documented.',
  ],
};
