import { add, del, ITEM, cfg } from './helpers.js';

const BASE_NODES = ['client', 'haproxy', 'web1', 'web2', 'monitor'];

export const haproxyHttpsRequest = {
  id: 'haproxy-https-request',
  title: 'HTTPS request — bind, TLS, ACL, backend and server',
  topic: 'haproxy',
  layout: 'haproxy',
  category: 'haproxy',
  level: 'core',
  minutes: 10,
  tags: ['HTTPS', 'frontend', 'backend', 'ACL', 'TLS termination', 'routing'],
  summary:
    'Follow one HTTPS request from the client to a backend server: TLS termination, Host ACLs, use_backend order, server selection, response headers and logs.',
  nodes: BASE_NODES,
  stores: ['haproxy', 'certs', 'servers', 'logs'],
  nodeLabels: {
    client: { name: 'Client', sub: 'browser · TLS' },
    web1: { name: 'Web server 1', sub: 'app · HTTP/8080' },
  },
  steps: [
    {
      from: 'client', to: 'haproxy.fe', badge: 'TCP + TLS handshake', channel: 'front',
      detail:
        'The client opens a connection to the frontend bind, for example `bind :443 ssl crt /etc/haproxy/certs/example.pem`.\n\nHAProxy presents the certificate, negotiates TLS and only then reads the HTTP request. The certificate must cover the requested hostname; matching the SNI is not the same as terminating a valid certificate.',
      http: {
        req: `CONNECT example.com:443\nTLS ClientHello servername=example.com`,
        res: `TLS ServerHello · certificate CN/SAN example.com\nHTTP/1.1 GET / HTTP/1.1`,
      },
      vault: [
        add('certs', ITEM.certificate({ id: 'edge', name: 'Edge certificate', meta: 'CN=example.com · chain' })),
        add('haproxy', ITEM.request({ id: 'req', name: 'HTTPS request', meta: 'Host: example.com · GET /' })),
      ],
      tags: ['bind', 'TLS termination', 'SNI'],
    },
    {
      from: 'haproxy.fe', to: 'haproxy.acl', badge: 'evaluate http-request + ACLs', channel: 'internal',
      detail:
        'HAProxy parses the request and evaluates `http-request` rules, then `use_backend` rules in order. The first matching rule wins.\n\n`http-request deny` or `return` can answer before any backend is selected. Host, path, method, source and TLS state are common ACL inputs; unsupported expressions in a learning model should be treated as no-match.',
      vault: [add('haproxy', ITEM.acl({ id: 'host', name: 'Host ACL', meta: 'hdr(host) -i example.com' }))],
      tags: ['ACL order', 'http-request', 'Host'],
    },
    {
      from: 'haproxy.acl', to: 'haproxy.be', badge: 'use_backend app_servers', channel: 'internal',
      detail:
        'A matching rule chooses a backend. If no rule matches, `default_backend` is used; if there is none, HAProxy returns 503.\n\nThe frontend does not know server health yet. It only decides which backend should handle the request.',
      vault: [add('haproxy', ITEM.backend({ id: 'app', name: 'app_servers', meta: 'roundrobin · check' }))],
      tags: ['use_backend', 'default_backend', '503'],
    },
    {
      from: 'haproxy.be', to: 'web1', badge: 'select a healthy server', channel: 'back',
      detail:
        'The backend chooses a server according to its balance algorithm, weights and health state. A server marked DOWN is skipped; a backup server is used only when normal servers are unavailable.\n\nHAProxy sends the request to the upstream address and port. The application sees HAProxy as the client unless forwarded headers are configured.',
      http: {
        req: `GET / HTTP/1.1\nHost: example.com\nX-Forwarded-For: 203.0.113.10\nX-Forwarded-Proto: https`,
        res: `HTTP/1.1 200 OK\nContent-Type: text/html`,
      },
      vault: [add('servers', ITEM.server({ id: 'web1', name: 'web1', meta: '10.0.0.11:8080 · UP' }))],
      tags: ['balance', 'server', 'X-Forwarded-*'],
    },
    {
      from: 'web1', to: 'client', badge: '200 OK through HAProxy', channel: 'back',
      detail:
        'The response travels back through HAProxy. The client sees the frontend’s TLS certificate and response status; HAProxy may add, rewrite or remove headers configurable in the frontend/backend.\n\nCheck the actual response headers and HAProxy logs before assuming the backend set them.',
      vault: [add('haproxy', ITEM.response({ id: 'res', name: 'Response', meta: '200 · backend app_servers/web1' }))],
      tags: ['response', 'headers', 'TLS'],
    },
    {
      from: 'haproxy.fe', to: 'haproxy.logs', badge: 'request log + timers', channel: 'internal',
      detail:
        'The request log records the frontend, backend/server, status and timers. That is how you distinguish a routing miss (503/no backend), a backend connect failure (502) and a slow response (timeout).\n\nMetrics aggregate rates and latency; logs preserve individual requests. Both matter.',
      vault: [add('logs', ITEM.log({ id: 'reqlog', name: 'Request log', meta: '200 · app_servers/web1 · timers' }))],
      tags: ['logs', 'timers', 'diagnosis'],
    },
  ],
  notes: [
    'A frontend selects a backend; a backend selects a server. Keep those decisions separate when debugging.',
    'TLS termination means HAProxy sees HTTP. TLS passthrough means it sees encrypted bytes and can only route on connection metadata such as SNI.',
    'ACL order is security-sensitive. An early broad allow can make a later specific rule unreachable.',
    'The lab teaches the model; validate the exact config with `haproxy -c -f <file>` on the target version.',
  ],
  config: [
    cfg('Frontend that terminates TLS', [
      '`bind :443 ssl crt /etc/haproxy/certs/example.pem` — listen, terminate TLS and load certificate/chain.',
      '`mode http` — HTTP parsing and ACLs; use `mode tcp` for passthrough.',
      '`option httplog` — include HTTP details in request logs.',
      '`acl is_example hdr(host) -i example.com` — named condition.',
      '`use_backend app_servers if is_example` — first matching rule wins.',
      '`default_backend app_servers` — fallback; otherwise unmatched requests get 503.',
    ]),
    cfg('Backend and servers', [
      '`backend app_servers` — logical pool of upstream servers.',
      '`balance roundrobin` — distribute across healthy servers.',
      '`server web1 10.0.0.11:8080 check` — address, port and active health checking.',
      '`server web2 10.0.0.12:8080 check backup` — only used when normal servers fail.',
      '`option httpchk GET /health` — application-aware health check (if used).',
      '`http-reuse safe` — connection reuse policy; choose deliberately.',
    ]),
  ],
  pitfalls: [
    'Assuming a 503 is an application error; it often means no backend or no healthy server.',
    'An ACL matching the wrong Host because a proxy or load balancer rewrote it.',
    'TLS certificate not covering the requested hostname, despite SNI matching.',
    'Forwarded headers trusted by the app when clients can reach HAProxy directly.',
    'Changing config without `haproxy -c` and a safe reload.',
  ],
  productionChecks: [
    'TLS certificate chain, hostname coverage and expiry are monitored.',
    'ACL order and default backend are reviewed and tested.',
    'Backend health checks are active and backup behavior is intentional.',
    'Logs and metrics are collected; 4xx/5xx and timeouts are alerted.',
  ],
};

export const haproxyAclRouting = {
  id: 'haproxy-acl-routing',
  title: 'ACL routing — first match, default backend and 503',
  topic: 'haproxy',
  layout: 'haproxy',
  category: 'haproxy',
  level: 'core',
  minutes: 9,
  tags: ['ACL', 'use_backend', 'default_backend', 'path', 'method', '503'],
  summary:
    'Build a small routing table with Host, path and method ACLs. See why order matters, how a broad rule can shadow a specific one, and why no match means a 503 rather than a random backend.',
  nodes: BASE_NODES,
  stores: ['haproxy', 'servers', 'logs'],
  steps: [
    {
      from: 'client', to: 'haproxy.fe', badge: 'GET /api/orders', channel: 'front',
      detail:
        'The request arrives at the HTTP frontend. It carries a Host, path, method and source address. Each can be tested by an ACL.\n\nHAProxy does not consult DNS or guess a service; routing is based on the configured rules and the request as HAProxy sees it.',
      vault: [add('haproxy', ITEM.request({ id: 'api', name: 'API request', meta: 'GET /api/orders · Host api.example.com' }))],
      tags: ['Host', 'path', 'method'],
    },
    {
      from: 'haproxy.fe', to: 'haproxy.acl', badge: 'evaluate in order', channel: 'internal',
      detail:
        'Rules are ordered. This example checks an explicit API host/path before a generic site rule. If the generic rule came first, it would capture API traffic.\n\nPut narrow/security rules before broad convenience rules, and test the negative case.',
      http: {
        req: `acl is_api hdr(host) -i api.example.com\nacl api_orders path_beg /api/orders\nuse_backend api_servers if is_api api_orders`,
      },
      vault: [
        add('haproxy', ITEM.acl({ id: 'api-host', name: 'is_api', meta: 'hdr(host) -i api.example.com' })),
        add('haproxy', ITEM.acl({ id: 'api-path', name: 'api_orders', meta: 'path_beg /api/orders' })),
      ],
      tags: ['named ACL', 'AND conditions', 'ordering'],
    },
    {
      from: 'haproxy.acl', to: 'haproxy.be', badge: 'api_servers selected', channel: 'internal',
      detail:
        'Both conditions are true, so `api_servers` is selected. The backend then chooses a server.\n\nAn ACL only selects a backend; authorization still belongs in the application or a dedicated policy layer unless HAProxy is explicitly enforcing it.',
      vault: [add('haproxy', ITEM.backend({ id: 'api', name: 'api_servers', meta: 'API pool' }))],
      tags: ['backend selection', 'authorization boundary'],
    },
    {
      from: 'haproxy.be', to: 'web1', badge: 'forward to API server', channel: 'back',
      detail:
        'The request is forwarded to an API server with the original path and configured headers. The backend must still authorize the caller; a matching route is not a permission check.',
      tags: ['forward', 'authorization'],
    },
    {
      from: 'web1', to: 'client', badge: '200 JSON', channel: 'back',
      detail:
        'The response goes back through HAProxy. The frontend/backend can add security headers, remove internal headers and rewrite paths; document those transformations.',
      vault: [add('haproxy', ITEM.response({ id: 'api-res', name: 'API response', meta: '200 · api_servers' }))],
      tags: ['response', 'headers'],
    },
    {
      from: 'haproxy.acl', to: 'haproxy.acl', badge: 'no rule matches', channel: 'internal',
      detail:
        'A request for an unknown host/path reaches the end of the rule list. If `default_backend` exists, it is used; otherwise HAProxy returns 503.\n\nA generic default backend is convenient but can hide routing mistakes. Choose it deliberately.',
      tags: ['no match', 'default_backend', '503'],
    },
    {
      from: 'haproxy.fe', to: 'monitor', badge: '503 logged', channel: 'back',
      detail:
        'HAProxy answers 503 itself when it cannot select a backend. The log shows the frontend and no valid backend/server. This is a proxy routing result, not necessarily an app error.\n\nCheck the exact ACL order and the default backend before restarting the application.',
      vault: [add('logs', ITEM.log({ id: 'miss', name: '503 routing miss', meta: 'no backend selected' }))],
      tags: ['503', 'logs', 'triage'],
    },
  ],
  notes: [
    'First match wins. There is no “most specific rule” scoring unless you build it.',
    'Use named ACLs to keep rules readable; combine conditions with spaces for AND.',
    'A 503 from HAProxy is often a routing/health result, not an application response.',
    'The lab does not include a live config editor; validate changes with your own HAProxy binary.',
  ],
  config: [
    cfg('Routing order', [
      '`acl is_api hdr(host) -i api.example.com`',
      '`acl api_orders path_beg /api/orders`',
      '`use_backend api_servers if is_api api_orders` — AND conditions.',
      '`use_backend web_servers if is_site` — broader rule after the narrow rule.',
      '`default_backend fallback_servers` — explicit fallback.',
    ]),
  ],
  pitfalls: [
    'A broad `use_backend` before a specific one, shadowing the specific route.',
    'No `default_backend`, then treating the resulting 503 as an app crash.',
    'Using an ACL as authorization without a policy decision.',
    'Testing only the happy path, not the no-match and wrong-host cases.',
  ],
  productionChecks: [
    'Routing table has explicit positive and negative tests.',
    '404/503 behavior is intentional and monitored.',
    'Security headers/rewrites are documented and tested.',
    'Config validated on the exact HAProxy version.',
  ],
};

export const haproxyTlsSni = {
  id: 'haproxy-tls-sni',
  title: 'TLS — termination, passthrough and SNI',
  topic: 'haproxy',
  layout: 'haproxy',
  category: 'haproxy-tls',
  level: 'advanced',
  minutes: 11,
  tags: ['TLS', 'SNI', 'termination', 'passthrough', 'certificate', 'loopback'],
  summary:
    'Compare TLS termination with SNI passthrough. See what HAProxy can inspect in each mode, why passthrough cannot read HTTP headers, and how a TCP edge can hand selected SNI hosts to an internal TLS terminator.',
  nodes: BASE_NODES,
  stores: ['haproxy', 'certs', 'servers', 'logs'],
  steps: [
    {
      from: 'client', to: 'haproxy.fe', badge: 'TLS ClientHello · SNI', channel: 'front',
      detail:
        'In passthrough mode the frontend uses `mode tcp` and does not present a certificate. HAProxy sees the TCP connection and the TLS ClientHello, including SNI, but not the HTTP request inside the encrypted stream.\n\nRouting must use connection/TLS metadata; Host headers and paths are unavailable.',
      http: {
        req: `TCP connect :443\nTLS ClientHello servername=shop.example.com`,
        res: `TLS handshake continues end-to-end`,
      },
      vault: [add('certs', ITEM.certificate({ id: 'client-sni', name: 'Requested SNI', meta: 'shop.example.com · not terminated here' }))],
      tags: ['mode tcp', 'SNI', 'no HTTP'],
    },
    {
      from: 'haproxy.fe', to: 'haproxy.be', badge: 'SNI ACL → backend', channel: 'internal',
      detail:
        'A TCP-mode ACL can compare SNI and select a backend. The backend forwards the still-encrypted connection to a server.\n\nTLS passthrough preserves end-to-end encryption, but HAProxy cannot add HTTP security headers, inspect paths or terminate client certificates.',
      vault: [add('haproxy', ITEM.acl({ id: 'sni', name: 'SNI ACL', meta: 'req_ssl_sni -i shop.example.com' }))],
      tags: ['SNI ACL', 'end-to-end TLS'],
    },
    {
      from: 'haproxy.be', to: 'web2', badge: 'encrypted stream', channel: 'back',
      detail:
        'The backend server terminates TLS. It must have the correct certificate and SNI configuration; HAProxy is only a TCP relay here.\n\nHealth checks in TCP mode can check connection/SSL, but they cannot inspect an HTTP /health endpoint unless TLS is terminated.',
      vault: [add('servers', ITEM.server({ id: 'web2', name: 'web2', meta: 'TLS terminator · UP' }))],
      tags: ['server TLS', 'health limits'],
    },
    {
      from: 'web2', to: 'client', badge: 'end-to-end TLS response', channel: 'back',
      detail:
        'The response stays encrypted between the client and web2. HAProxy cannot read or modify HTTP status/headers.\n\nThis is the right pattern when the application must terminate its own TLS or when compliance requires end-to-end encryption.',
      tags: ['end-to-end', 'no HTTP visibility'],
    },
    {
      from: 'client', to: 'haproxy.fe', badge: 'different SNI → loopback terminator', channel: 'front',
      detail:
        'The TCP edge can send another SNI host to an internal frontend on loopback that does terminate TLS. This hybrid is common: a single public TCP edge, with selected hosts decrypted inside HAProxy.\n\nThe internal frontend still needs a valid certificate and a clear trust boundary.',
      vault: [add('haproxy', ITEM.certificate({ id: 'loopback', name: 'Loopback TLS certificate', meta: 'www.example.com' }))],
      tags: ['loopback', 'hybrid', 'SNI switch'],
    },
    {
      from: 'haproxy.fe', to: 'haproxy.tls', badge: 'hand off to loopback frontend', channel: 'internal',
      detail:
        'The TCP edge forwards selected connections to `127.0.0.1:8443` or an internal bind. That frontend uses `mode http` and terminates TLS, so it can apply HTTP ACLs, headers and routing.\n\nDo not expose the loopback frontend publicly; it assumes traffic already passed the edge.',
      tags: ['internal frontend', 'loopback', 'trust boundary'],
    },
    {
      from: 'haproxy.tls', to: 'haproxy.be', badge: 'HTTP routing after termination', channel: 'internal',
      detail:
        'Once TLS is terminated, the internal HTTP frontend can inspect Host/path/method, add security headers and choose a backend. The request is now visible to HAProxy.\n\nThis is where you decide whether the app sees `X-Forwarded-Proto: https` and which client IP headers are trusted.',
      vault: [add('haproxy', ITEM.backend({ id: 'web', name: 'web_servers', meta: 'HTTP after TLS termination' }))],
      tags: ['HTTP ACLs', 'forwarded headers', 'security headers'],
    },
    {
      from: 'haproxy.be', to: 'web1', badge: 'plain HTTP to app', channel: 'back',
      detail:
        'The application receives HTTP from the local terminator. It must trust the proxy headers only if the network path is restricted; otherwise clients can spoof them.',
      tags: ['upstream', 'header trust'],
    },
    {
      from: 'haproxy.fe', to: 'monitor', badge: 'TLS + routing logs', channel: 'back',
      detail:
        'Each mode logs different information. TCP mode sees connection/SNI and byte counts; HTTP mode sees method, Host, path, status and timers.\n\nPick the mode based on what you must inspect, not just what is convenient.',
      vault: [add('logs', ITEM.log({ id: 'tls-log', name: 'TLS/routing log', meta: 'SNI · backend · timers' }))],
      tags: ['logs', 'observability', 'mode choice'],
    },
  ],
  notes: [
    'SNI is not the HTTP Host header. In passthrough mode HAProxy cannot see Host.',
    'Termination gives HAProxy visibility and control; passthrough gives the application control and end-to-end encryption.',
    'A loopback terminator is internal trust, not automatic security. Restrict who can reach it.',
    'Certificate coverage, chain order and expiry are external checks; the config alone cannot prove them.',
  ],
  config: [
    cfg('Passthrough edge', [
      '`frontend tls_edge` → `bind :443`, `mode tcp`.',
      '`tcp-request inspect-delay 5s` and `tcp-request content accept if { req_ssl_hello_type 1 }`.',
      '`acl is_shop req_ssl_sni -i shop.example.com`.',
      '`use_backend shop_tls if is_shop`.',
      '`backend shop_tls` → `mode tcp`, `server shop1 ...`; the server terminates TLS.',
    ]),
    cfg('Loopback termination', [
      'TCP edge → `server loopback 127.0.0.1:8443`.',
      'Internal frontend → `bind 127.0.0.1:8443 ssl crt ...`, `mode http`.',
      'Apply HTTP ACLs, header rules and `default_backend`.',
      'Never expose the loopback bind on a public interface.',
    ]),
  ],
  pitfalls: [
    'Trying to use `hdr(host)` in `mode tcp`; only SNI/connection data is available.',
    'Terminating at HAProxy but forgetting to pass `X-Forwarded-Proto`/client IP safely.',
    'Exposing the loopback TLS frontend to the internet.',
    'Assuming SNI matches certificate coverage; they are different checks.',
    'Using passthrough while requiring HTTP security headers from HAProxy.',
  ],
  productionChecks: [
    'Certificate chain, hostname coverage and expiry monitored.',
    'TLS minimum version/ciphers align with policy.',
    'Forwarded headers trusted only from the proxy path.',
    'Loopback/internal binds restricted to the host or private network.',
  ],
};

export const haproxyHealth = {
  id: 'haproxy-health',
  title: 'Health checks, balancing and the 503 path',
  topic: 'haproxy',
  layout: 'haproxy',
  category: 'haproxy-ops',
  level: 'core',
  minutes: 11,
  tags: ['health checks', 'roundrobin', 'leastconn', 'backup', 'rise', 'fall', '503'],
  summary:
    'Mark a backend server down and watch HAProxy choose another, then run out of healthy servers. Read rise/fall, check intervals, backup roles and the difference between 502, 503 and 504.',
  nodes: BASE_NODES,
  stores: ['haproxy', 'servers', 'logs'],
  initial: {
    servers: [
      ITEM.server({ id: 'web1', name: 'web1', meta: '10.0.0.11:8080 · UP' }),
      ITEM.server({ id: 'web2', name: 'web2', meta: '10.0.0.12:8080 · UP' }),
    ],
  },
  steps: [
    {
      from: 'haproxy.be', to: 'haproxy.health', badge: 'check web1 + web2', channel: 'internal',
      detail:
        'Active health checks run on an interval. `rise` is how many consecutive successes mark a server UP; `fall` is how many failures mark it DOWN. `inter` controls how often checks run.\n\nA check that tests only TCP can be up while the application is broken. Use an HTTP check with a meaningful endpoint when possible.',
      http: {
        req: 'GET /health HTTP/1.1\nHost: web1.internal',
        res: 'HTTP/1.1 200 OK\n\nok',
      },
      vault: [add('haproxy', ITEM.acl({ id: 'health', name: 'Health check', meta: 'check inter 2s rise 2 fall 3' }))],
      tags: ['check', 'rise/fall', 'HTTP health'],
    },
    {
      from: 'haproxy.health', to: 'web2', badge: 'web2 fails 3 checks', channel: 'back',
      detail:
        'After `fall` consecutive failures, web2 is marked DOWN. HAProxy stops sending normal traffic there; the exact transition depends on check timing and state.\n\nLogs and stats show the state change. A single failed check may not remove a server immediately.',
      vault: [add('logs', ITEM.log({ id: 'down', name: 'web2 DOWN', meta: '3 consecutive failures' }))],
      tags: ['DOWN', 'fall', 'state transition'],
    },
    {
      from: 'haproxy.be', to: 'web1', badge: 'route to the healthy server', channel: 'back',
      detail:
        'With web2 down, traffic goes to web1. With `leastconn`, new connections go to the server with fewer active connections; `roundrobin` rotates. Balance is not a health check; both matter.',
      vault: [add('logs', ITEM.metric({ id: 'conns', name: 'Connection distribution', meta: 'web1 active · web2 down' }))],
      tags: ['balance', 'leastconn', 'roundrobin'],
    },
    {
      from: 'web1', to: 'client', badge: '200 from web1', channel: 'back',
      detail:
        'The user is served by the remaining healthy server. Capacity is reduced; monitor saturation and queueing before assuming everything is fine.\n\nA backup server can absorb traffic if configured; otherwise the pool shrinks.',
      tags: ['capacity', 'degraded mode'],
    },
    {
      from: 'haproxy.health', to: 'web1', badge: 'web1 also fails', channel: 'back',
      detail:
        'Now no normal server is UP. If a backup server is configured and healthy, HAProxy can use it. Without one, the backend has no eligible server.\n\n`backup` servers are not used until all non-backup servers are unavailable; this is failover, not extra capacity.',
      vault: [del('servers', 'web1')],
      tags: ['backup', 'no server', 'failover'],
    },
    {
      from: 'haproxy.be', to: 'haproxy.be', badge: 'no healthy server', channel: 'internal',
      detail:
        'HAProxy has no eligible server. The result is typically 503 Service Unavailable, generated by HAProxy rather than the application. 502 usually means it connected but got an invalid upstream response; 504 usually means a timeout.\n\nRead the status and log before changing anything.',
      tags: ['503', '502', '504'],
    },
    {
      from: 'haproxy.fe', to: 'monitor', badge: 'alert on health and capacity', channel: 'back',
      detail:
        'Monitor per-server health, active connections, queue depth and response times. Alert on both a down server and a pool running at reduced capacity.\n\nTest failover deliberately: stop a backend, watch the state transition and verify the error path.',
      vault: [add('logs', ITEM.metric({ id: 'alert', name: 'Capacity alert', meta: '0 healthy servers · queue rising' }))],
      tags: ['monitoring', 'capacity', 'alert'],
    },
  ],
  notes: [
    'Health check success does not prove the full user journey; it proves one endpoint or connection.',
    '`rise` and `fall` prevent flapping but delay recovery/failure detection.',
    'Backup servers are failover, not a second active pool.',
    'Distinguish 502 (bad upstream), 503 (no server/backend) and 504 (timeout).',
  ],
  config: [
    cfg('Backend health and balancing', [
      '`balance roundrobin` or `leastconn` — choose based on request duration.',
      '`option httpchk GET /health` — application-aware check.',
      '`default-server check inter 2s rise 2 fall 3` — shared check policy.',
      '`server web1 10.0.0.11:8080 check`',
      '`server web2 10.0.0.12:8080 check backup`',
      '`retries 3` and `option redispatch` — deliberate retry behavior.',
    ]),
    cfg('What to alert on', [
      'Server DOWN and backend with no healthy servers.',
      'Queue depth and connection saturation.',
      '5xx rate and response-time percentiles.',
      'Health-check latency/failure rate itself.',
    ]),
  ],
  pitfalls: [
    'A TCP check marking a broken HTTP app UP.',
    'Expecting backup servers to add capacity during normal operation.',
    'Retries amplifying a failing request storm.',
    'Not testing the zero-healthy-server path.',
    'Calling every 5xx an HAProxy problem; read 502/503/504 and logs.',
  ],
  productionChecks: [
    'Health endpoint covers the real readiness contract.',
    'Pool capacity survives one server failure.',
    'Alerts cover DOWN state, queueing and 5xx.',
    'Failover and recovery are tested periodically.',
  ],
};

export const haproxyTimeouts = {
  id: 'haproxy-timeouts',
  title: 'Timeouts and logs — 504, queue and slow upstream',
  topic: 'haproxy',
  layout: 'haproxy',
  category: 'haproxy-ops',
  level: 'advanced',
  minutes: 10,
  tags: ['timeouts', 'client', 'server', 'connect', 'queue', '504', 'logs'],
  summary:
    'A request is slow. Decide whether the client is slow, the backend is slow, the connection cannot be established, or the queue is full — using timeouts, status codes and log timers instead of guessing.',
  nodes: BASE_NODES,
  stores: ['haproxy', 'servers', 'logs'],
  steps: [
    {
      from: 'client', to: 'haproxy.fe', badge: 'request enters · timer starts', channel: 'front',
      detail:
        'HAProxy starts tracking the request. `timeout client` bounds inactivity on the client side; it is not the same as the backend response timeout.\n\nA slow upload can hit the client timeout even if the application is healthy.',
      vault: [add('haproxy', ITEM.request({ id: 'slow', name: 'Slow request', meta: 'GET /report · large response' }))],
      tags: ['timeout client', 'timers'],
    },
    {
      from: 'haproxy.fe', to: 'haproxy.be', badge: 'backend selected', channel: 'internal',
      detail:
        'The frontend selects a backend and server. Queueing can happen here if all servers are busy and `maxconn` limits are reached.\n\n`timeout queue` bounds how long a request waits for a connection slot; a queue timeout is not an application timeout.',
      tags: ['queue', 'maxconn'],
    },
    {
      from: 'haproxy.be', to: 'web1', badge: 'connect to upstream', channel: 'back',
      detail:
        'HAProxy attempts the connection. `timeout connect` bounds connection establishment. A firewall drop, wrong port or overloaded server can consume this budget before any HTTP request is sent.\n\nCheck server address/port, network path and listen backlog.',
      http: {
        req: 'TCP connect 10.0.0.11:8080',
        res: 'connected · request sent',
      },
      tags: ['timeout connect', 'server reachability'],
    },
    {
      from: 'web1', to: 'haproxy.be', badge: 'upstream takes too long', channel: 'back',
      detail:
        'The server accepted the connection but does not respond. `timeout server` bounds inactivity waiting for the upstream. If it expires, HAProxy can return 504 Gateway Timeout.\n\nThe application may still be working; the proxy has stopped waiting.',
      tags: ['timeout server', '504'],
    },
    {
      from: 'haproxy.fe', to: 'client', badge: '504 Gateway Timeout', channel: 'back',
      detail:
        'HAProxy returns 504. The log shows timers and server/backend selection. 504 is usually an upstream response timeout; 502 is a bad response/connection; 503 is no eligible server.\n\nDo not increase timeouts blindly; find which phase consumed the budget.',
      vault: [add('haproxy', ITEM.response({ id: '504', name: 'Gateway timeout', meta: '504 · timeout server' }))],
      tags: ['504', 'response', 'triage'],
    },
    {
      from: 'haproxy.fe', to: 'monitor', badge: 'read timers in the log', channel: 'back',
      detail:
        'HAProxy request logs include total time, queue, connect, response and other timers. Use them to identify the phase. `stats` shows current queue and response-time trends.\n\nCorrelate the proxy log with the application log by timestamp/request ID.',
      vault: [add('logs', ITEM.log({ id: 'timers', name: 'Request timers', meta: 'queue / connect / response / total' }))],
      tags: ['logs', 'stats', 'latency'],
    },
    {
      from: 'haproxy.be', to: 'web1', badge: 'retry/redispatch decision', channel: 'back',
      detail:
        'Retries can mask transient failures but can also multiply load. A retry may hit a different server with `option redispatch`; decide whether the request is safe to replay.\n\nA timed-out POST may have been processed; retrying can duplicate the side effect.',
      tags: ['retries', 'idempotency', 'redispatch'],
    },
  ],
  notes: [
    'Timeouts are budgets per phase, not one global “request timeout”.',
    'A timeout is not proof the backend did nothing; a POST may have completed after the proxy stopped waiting.',
    'Queue depth is a capacity signal; increasing timeouts can hide it.',
    'Correlate HAProxy logs with application logs before changing configuration.',
  ],
  config: [
    cfg('Timeout baseline', [
      '`timeout connect 5s` — establish upstream connection.',
      '`timeout client 30s` — client inactivity.',
      '`timeout server 30s` — upstream inactivity.',
      '`timeout queue 30s` — wait for a server slot.',
      '`timeout http-request 10s` — complete HTTP request headers.',
      '`retries 3` + `option redispatch` — only with idempotency considered.',
    ]),
    cfg('Log/stats interpretation', [
      'Status 502: bad gateway/upstream response.',
      'Status 503: no server or no backend.',
      'Status 504: gateway timeout.',
      'Queue timer: capacity shortage before the request is sent.',
      'Connect timer: server/network handshake slow or unreachable.',
    ]),
  ],
  pitfalls: [
    'Setting every timeout to 1h to “fix” latency.',
    'Retrying non-idempotent POSTs and duplicating side effects.',
    'Blaming the application for a 503 with no healthy servers.',
    'Ignoring queue time while tuning server timeout.',
    'No request IDs to correlate proxy and app logs.',
  ],
  productionChecks: [
    'Timeouts are set per phase and reviewed under load.',
    'Queue depth and 5xx/504 rates are alerted.',
    'Retries are limited and idempotency-aware.',
    'Logs retain enough detail for correlation without leaking secrets.',
  ],
};

export const haproxySecurity = {
  id: 'haproxy-security',
  title: 'HAProxy security — TLS, headers and trust boundaries',
  topic: 'haproxy',
  layout: 'haproxy',
  category: 'haproxy-ops',
  level: 'advanced',
  minutes: 11,
  tags: ['TLS', 'HSTS', 'security headers', 'client certificates', 'forwarded headers', 'stats socket'],
  summary:
    'Harden the edge: certificate handling, TLS policy, security headers, client-certificate caveats, trusted forwarded headers, stats/runtime exposure and a config that fails closed.',
  nodes: BASE_NODES,
  stores: ['haproxy', 'certs', 'servers', 'logs'],
  steps: [
    {
      from: 'client', to: 'haproxy.fe', badge: 'TLS policy + certificate', channel: 'front',
      detail:
        'A secure edge needs a valid certificate chain, a modern minimum TLS version and deliberate cipher policy. The certificate must cover the hostname the client requested; SNI selection alone does not prove coverage.\n\nAutomate renewal and monitor expiry; a config can look perfect right up to an expired certificate.',
      vault: [add('certs', ITEM.certificate({ id: 'edge', name: 'Edge certificate', meta: 'valid · chain · expiry monitored' }))],
      tags: ['TLS minimum', 'certificate chain', 'expiry'],
    },
    {
      from: 'haproxy.fe', to: 'haproxy.tls', badge: 'terminate and inspect', channel: 'internal',
      detail:
        'At termination HAProxy can enforce `http-request` rules, add security headers and reject unsafe methods/paths before traffic reaches the app.\n\nDecide which controls belong at the edge and which belong in the application; duplicating them without ownership causes drift.',
      tags: ['termination', 'http-request', 'policy boundary'],
    },
    {
      from: 'haproxy.tls', to: 'haproxy.acl', badge: 'headers + ACLs', channel: 'internal',
      detail:
        'Use `http-request set-header`/`del-header` carefully. Never trust a client-supplied `X-Forwarded-For`, `X-Forwarded-Proto` or user identity header; overwrite or strip it at the edge.\n\nIf clients can bypass HAProxy and hit the app directly, header trust is broken.',
      tags: ['security headers', 'header spoofing', 'trust boundary'],
    },
    {
      from: 'haproxy.acl', to: 'haproxy.be', badge: 'route to backend', channel: 'internal',
      detail:
        'Route only after the security rules. A deny/return should happen before backend selection where possible. Keep a clear default-deny or explicit fallback policy.\n\nA broad default backend can expose a service you did not intend to publish.',
      tags: ['default deny', 'routing order'],
    },
    {
      from: 'haproxy.be', to: 'web1', badge: 'trusted upstream headers', channel: 'back',
      detail:
        'If the app uses client certificates, decide exactly how HAProxy verifies them and which header carries the result. Forwarding an unverified client certificate header is misleading and dangerous.\n\nUse `verify required` where clients must be authenticated, and restrict the backend network.',
      tags: ['client certificate', 'verify required', 'upstream trust'],
    },
    {
      from: 'haproxy.fe', to: 'monitor', badge: 'stats socket locked down', channel: 'back',
      detail:
        'The runtime/stats socket can change server state and read sensitive operational data. Bind it to localhost or a protected admin network, set permissions and do not expose it publicly.\n\nMetrics/logs should not contain secrets, full tokens or sensitive query strings.',
      tags: ['stats socket', 'admin plane', 'logging'],
    },
    {
      from: 'haproxy.be', to: 'haproxy.be', badge: 'fail closed review', channel: 'internal',
      detail:
        'Test failure paths: no healthy backend, missing certificate, invalid ACL, backend timeout. Decide whether each fails closed and what the user sees.\n\nA 503 is safer than silently routing to an unintended default service.',
      tags: ['fail closed', 'error paths', 'review'],
    },
  ],
  notes: [
    'TLS termination is not the same as TLS security; certificate and version policy matter.',
    'Never trust client-supplied identity/forwarding headers at the app.',
    'Stats/runtime sockets are an admin control plane; isolate them.',
    'Client-certificate headers are only meaningful if verification actually happened.',
    'The lab is not a config editor or live debugger; validate with the real binary.',
  ],
  config: [
    cfg('Edge security checklist', [
      'Valid certificate chain, automated renewal and expiry alerts.',
      'Modern TLS minimum; deliberate cipher suites; HSTS only when HTTPS is guaranteed.',
      '`http-request set-header X-Forwarded-Proto https` at the trusted terminator.',
      'Strip/overwrite inbound forwarding and identity headers.',
      'Default backend or default-deny; no accidental public fallback.',
      'Stats/runtime socket on localhost/admin network with permissions.',
    ]),
    cfg('Client certificates', [
      '`bind ... ssl crt ... verify required ca-file ...` if clients must authenticate.',
      'Forward a header only after successful verification.',
      'Do not treat an unverified certificate field as identity.',
      'Test expired/revoked/unknown client certificates.',
    ]),
  ],
  pitfalls: [
    'Trusting `X-Forwarded-For` from any client.',
    'Publishing the stats socket or HAProxy admin port.',
    'HSTS on a site that still serves HTTP fragments.',
    'Forwarding an unverified client-cert header to the app.',
    'A default backend that exposes an internal service by accident.',
  ],
  productionChecks: [
    'TLS/certificate monitoring and renewal ownership.',
    'Header trust model documented and enforced at the app.',
    'Admin socket/stats interface isolated and access-controlled.',
    'Security controls tested on failure paths, not only happy path.',
  ],
};

export const haproxyUpgrade = {
  id: 'haproxy-upgrade',
  title: 'HAProxy operations and upgrades — validate, reload, observe',
  topic: 'haproxy',
  layout: 'haproxy',
  category: 'haproxy-ops',
  level: 'advanced',
  minutes: 10,
  tags: ['haproxy -c', 'reload', '2.8', '3.x', 'removed directives', 'operations'],
  summary:
    'Treat the config as code: validate with the target binary, reload without dropping connections, watch errors/queues, and understand the 3.x changes that break old configs. No editor, no live debug console — just the operational path.',
  nodes: BASE_NODES,
  stores: ['haproxy', 'servers', 'logs'],
  steps: [
    {
      from: 'haproxy.fe', to: 'haproxy.be', badge: 'read the config as code', channel: 'internal',
      detail:
        'The config defines global settings, defaults, frontends, backends and supporting sections. Keep it in version control and review changes like code.\n\nThe Learning Lab deliberately does not include a config editor or active debug console. Production changes belong in your normal change process.',
      vault: [add('haproxy', ITEM.file({ id: 'config', name: 'haproxy.cfg', meta: 'tracked · reviewed · versioned' }))],
      tags: ['config as code', 'review', 'no editor'],
    },
    {
      from: 'haproxy.fe', to: 'haproxy.logs', badge: 'haproxy -c -f haproxy.cfg', channel: 'internal',
      detail:
        'Run `haproxy -c -f <file>` with the exact binary/version that will serve traffic. A config parser in a browser or a different version is not a substitute.\n\nA successful validation does not prove certificates resolve, DNS works, ports are free or the upstream app is healthy.',
      http: {
        req: 'haproxy -c -f /etc/haproxy/haproxy.cfg',
        res: 'Configuration file is valid',
      },
      tags: ['validate', 'exact version', 'limits'],
    },
    {
      from: 'haproxy.logs', to: 'haproxy.fe', badge: 'prepare graceful reload', channel: 'internal',
      detail:
        'Reload/restart behavior depends on the service manager and HAProxy version. Preserve listening sockets where supported, drain old processes and watch for connection errors during the change.\n\nDo not reload a broken config; have a rollback file and know how to revert.',
      tags: ['reload', 'zero downtime', 'rollback'],
    },
    {
      from: 'haproxy.fe', to: 'haproxy.be', badge: '2.8 → 3.x compatibility', channel: 'internal',
      detail:
        'HAProxy 3.x removed/deprecated several constructs. Check for removed `program`/mailers, duplicate names, dynamic-server `enabled`, renamed OCSP tuning and default balance changes.\n\nRead the release notes for the exact target branch and test the config with that binary.',
      tags: ['3.x', 'removed directives', 'release notes'],
    },
    {
      from: 'haproxy.be', to: 'web1', badge: 'post-reload traffic', channel: 'back',
      detail:
        'After reload, verify backend selection, health states, TLS and latency. Watch for a new default balance (e.g. 3.3 changed defaults) or a rule that now matches differently.\n\nA green process state is not proof that routing is unchanged.',
      tags: ['verification', 'routing drift', 'balance'],
    },
    {
      from: 'haproxy.fe', to: 'monitor', badge: 'logs, errors and queue', channel: 'back',
      detail:
        'Watch 4xx/5xx, connection errors, queue depth and response time during the change window. Compare against baseline; roll back if the error rate or latency regresses.\n\nLogs/stats are the operational feedback loop, not an optional dashboard.',
      vault: [add('logs', ITEM.metric({ id: 'post', name: 'Post-reload metrics', meta: 'errors · queue · latency' }))],
      tags: ['observability', 'change window', 'rollback'],
    },
    {
      from: 'haproxy.be', to: 'haproxy.be', badge: 'document the change', channel: 'internal',
      detail:
        'Record what changed, why, the validation command, the version, and how to roll back. The next operator should not need to reconstruct the reasoning from a diff.\n\nCapture certificate/version/health evidence; “it works” is not an audit trail.',
      tags: ['change record', 'audit', 'rollback'],
    },
  ],
  notes: [
    'This track intentionally has no active debug console or config editor. Use the official HAProxy tools and your normal deployment pipeline.',
    '`haproxy -c` validates syntax/structure for the exact binary; it does not prove runtime reachability.',
    'Read the release notes for the exact target branch before upgrading.',
    'Keep the previous config and know the rollback command before reloading.',
  ],
  config: [
    cfg('Operational checklist', [
      'Config in version control and reviewed.',
      '`haproxy -c -f <file>` with the production binary.',
      'Certificate/DNS/port/upstream checks independent of syntax.',
      'Graceful reload/restart procedure and rollback file.',
      'Post-change logs, health, queue and latency comparison.',
      'Documented change record and owner.',
    ]),
    cfg('Upgrade checks', [
      'Removed sections/directives and renamed options.',
      'Duplicate-name enforcement and dynamic server changes.',
      'Default balance/behavior changes.',
      'Runtime API/stats socket behavior.',
      'Version-specific configuration manual and release notes.',
    ]),
  ],
  pitfalls: [
    'Validating with a different HAProxy version than production.',
    'Reloading a config that passed syntax but references a missing certificate.',
    'Assuming a green service status means routing is unchanged.',
    'No rollback plan or previous config.',
    'Using an editor/debug console as the only change record.',
  ],
  productionChecks: [
    'Exact-version validation and staged rollout.',
    'Rollback tested and documented.',
    'Monitoring compares pre/post error rate, queue and latency.',
    'Config and change records retained for audit.',
  ],
};
