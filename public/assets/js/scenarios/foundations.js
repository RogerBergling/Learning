import { add, ITEM, CFG, cfg } from './helpers.js';

export const clientCredentials = {
  id: 'client-credentials',
  title: 'Client credentials — machine to machine',
  category: 'foundation',
  level: 'core',
  minutes: 6,
  tags: ['client credentials', 'machine to machine', 'service', 'client secret', 'no user'],
  summary:
    'A background service needs data from an API. There is no user and no browser: the service authenticates itself with a client ID and a secret, and receives an access token that represents the service — not a person.',
  nodes: ['onegate', 'frontend', 'backend'],
  nodeLabels: {
    frontend: { name: 'Fulfilment service', sub: 'backend job · confidential client' },
  },
  steps: [
    {
      from: 'frontend', to: 'og.token', badge: 'POST /token',
      detail:
        'The service posts to the token endpoint with `grant_type=client_credentials`. It authenticates with **HTTP Basic**: `Authorization: Basic base64(client_id:client_secret)`. There is no code, no PKCE and no user — only the client itself.\n\nThis is a **back channel** call: it happens server-to-server, never in a browser.',
      channel: 'back',
      http: {
        req: `POST /mg-local/portal/token HTTP/1.1
Host: login.example.com
Authorization: Basic ZnVsZmlsbWVudC1zdmM6czNjcjN0LXY0bHVl
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=orders.read`,
        res: `HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Im9nLXNpZy0yMDI2LTA3In0…",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "orders.read"
}`,
      },
      vault: [add('frontend', ITEM.secret())],
      tags: ['no user', 'back channel', 'Basic auth'],
    },
    {
      from: 'og.token', to: 'og.token', badge: 'validate client',
      detail:
        'OneGate looks up the remote client and verifies the secret. It then checks three things that are easy to forget:\n\n- is `client_credentials` in the client\'s allowed **grant_types**?\n- is `orders.read` inside the client\'s allowed **scope**?\n- which **audience** should the token carry?\n\nA wrong secret is `401 invalid_client`. A scope the client may not use is `400 invalid_scope`.',
      channel: 'internal',
      tags: ['grant check', 'scope check', 'audience'],
    },
    {
      from: 'og.token', to: 'frontend', badge: 'AT · 15 min', channel: 'back',
      detail:
        'The response contains **only an access token** — no ID token and no refresh token. That is correct: there is no end user to identify (`sub` will be the client ID) and no long-lived session to refresh. When the token expires the service simply asks again.',
      vault: [add('frontend', ITEM.access({ meta: 'sub = client_id · aud=api.orders · 15 min' }))],
      tags: ['no id_token', 'no refresh token'],
    },
    {
      from: 'frontend', to: 'backend', badge: 'GET /api/orders',
      detail:
        'The service calls the API with `Authorization: Bearer <access_token>`. Nothing about the original client secret travels with this request. Secrets are only used to *get* tokens; tokens are what you present to APIs.',
      channel: 'back',
      http: {
        req: `GET /api/orders HTTP/1.1
Host: api.internal.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6…`,
        res: `HTTP/1.1 200 OK

{ "orders": [ … ] }`,
      },
      tags: ['bearer token', 'secret stays home'],
    },
    {
      from: 'backend', to: 'og.op', badge: 'JWKS / introspect',
      detail:
        'The API validates the token. With a **JWT** it fetches the public keys once from `jwks_uri` and verifies the signature offline. With an **opaque** token it has to ask OneGate (`/introspect`) on every uncached call.\n\nThe validation contract is always the same: signature (or introspection), `iss`, `aud`, `exp`, and the scope needed for this endpoint.',
      channel: 'back',
      tags: ['aud check', 'exp check', 'scope check'],
    },
    {
      from: 'backend', to: 'backend', badge: 'authorise',
      detail:
        'Only after validation does the API build a principal. For client credentials the principal is a **service**, not a person. `orders.read` maps to read access; anything else is a `403`.',
      channel: 'internal',
      vault: [add('backend', ITEM.claims({ claims: { sub: 'fulfilment-svc', scope: 'orders.read', aud: 'api.orders', client_id: 'fulfilment-svc' } }))],
      tags: ['authorisation', 'no user context'],
    },
    {
      from: 'backend', to: 'frontend', badge: '200 OK', channel: 'back',
      detail: 'The data comes back. The API keeps no copy of the token beyond the request.',
      tags: ['least data'],
    },
    {
      from: 'frontend', to: 'frontend', badge: 'cache until exp−60s',
      detail:
        'A well-behaved service **caches** the token in memory until shortly before `exp` instead of requesting a new one for every call — otherwise the token endpoint becomes your bottleneck.\n\nAt the same time it must handle `401` by discarding the cached token and asking for a new one once, not in a loop.',
      channel: 'internal',
      tags: ['cache', 'single retry'],
    },
  ],
  notes: [
    '**Manual caveat:** the Administration Manual does not describe the `client_credentials` grant. This scenario is generic OAuth 2.0 background; confirm that your OneGate version and licence expose the grant before designing around it.',
    'Client credentials is for **confidential clients only**. A SPA or mobile app cannot keep a secret, so it must never use this grant for user data.',
    'Prefer one client per service with the narrowest scope list that works. A shared "integration client" with `*` scope is how incidents happen.',
    'There is no consent screen and no user. If an audit needs to know *who* did something, the service must log the correlation ID, or use token exchange / on-behalf-of instead.',
    'For higher assurance, OneGate clients can use stronger authentication than a shared secret (for example `private_key_jwt` or mTLS) where the deployment supports it. A secret in an environment variable is the baseline, not the goal.',
  ],
  config: [
    cfg('Federation → OpenID Connect → Local Providers → Remote Clients → fulfilment-svc', [
      '`grant_types` must allow `client_credentials` (leave `authorization_code` off if the client never acts for a user).',
      '`scope = orders.read` — the exact scopes this service needs.',
      'The client authenticates with `client_id` + `client_secret`; the manual’s recommended metadata method is `client_secret_basic`.',
      'Under **Access Token JWT**, set the **default resource (aud)** to `api.orders`, or allow the client to ask with the `resource` parameter.',
    ]),
    cfg('Federation → OpenID Connect → Local Providers → Provider Settings', [
      'Access token lifetime: short, e.g. 5–15 minutes. There is no refresh token, so the service just re-authenticates.',
      'Access Token Type: `jwt` if the API can verify offline, `opaque` if the API introspects (where that endpoint is available).',
    ]),
    CFG.localProvider(),
  ],
  pitfalls: [
    '`invalid_client` — the Basic header is wrong or the secret was rotated on one side only.',
    '`unauthorized_client` — `client_credentials` is missing from the client\'s grant types.',
    '`invalid_scope` — the scope is not in the client\'s allowed list, or it maps to no audience.',
    'The service works, then breaks every 15 minutes: it is not caching the token, or it caches it past `exp`.',
    'The API accepts a token issued for a different audience because nobody checks `aud`. Fix that before anything else.',
  ],
};

const jwtCfg = cfg('Federation → OpenID Connect → Local Providers → Provider Settings → Access Token Type = jwt', [
  'The access token is a signed JWT. The API validates it locally with `jwks_uri`.',
  'Include the claims the API needs in the **Access Token Attribute Profile** — nothing more.',
  'Keep the lifetime short (5–15 min). A JWT cannot be revoked by the OP; it is valid until `exp` unless the API keeps a deny-list.',
  'Key settings: RS256, publish `kid` so clients can pick the right key during rotation.',
]);

const opaqueCfg = cfg('Federation → OpenID Connect → Local Providers → Provider Settings → Access Token Type = opaque', [
  'The access token is an opaque string: no claims are visible to the client or the API.',
  'Where the deployment provides introspection, the API calls that endpoint and authenticates as a confidential client.',
  'Where introspection is available, revocation is immediate: the answer flips to `active: false`.',
  'Cache introspection results for a few seconds/minutes to protect OneGate, but never longer than the token lifetime.',
]);

const sharedSteps = [
  {
    from: 'user', to: 'frontend', badge: 'GET /dashboard',
    detail: 'Assume the web app already completed the Authorization Code flow and holds tokens **server-side**. Only the server session cookie is in the browser.',
    tags: ['already logged in'],
  },
  {
    from: 'frontend', to: 'backend', badge: 'GET /api/orders',
    detail: 'The web tier calls the API on behalf of the user. Everything interesting now happens at the API: how does it know this token is genuine?',
    channel: 'back',
    http: {
      req: `GET /api/orders HTTP/1.1
Host: api.internal.example.com
Authorization: Bearer <access token>
Accept: application/json`,
    },
    tags: ['bearer token'],
  },
];

export const tokenFormats = {
  id: 'token-formats',
  title: 'JWT vs opaque — how the API validates',
  category: 'tokens',
  level: 'core',
  minutes: 8,
  tags: ['JWT', 'opaque', 'introspection', 'JWKS', 'revocation', 'latency'],
  modeLabel: 'JWT / opaque',
  summary:
    'The same call, two token formats. Switch the toggle above the stage to see what the API has to do for a self-contained JWT and for an opaque token that must be introspected. This is the single most useful thing to understand about token design.',
  nodes: ['user', 'onegate', 'frontend', 'backend'],
  nodeLabels: { frontend: { name: 'Web app server', sub: 'confidential client' } },
  defaultMode: 'jwt',
  initial: {
    frontend: [
      { id: 'at', kind: 'jwt', name: 'Access token', meta: 'aud=api.orders · 15 min', ttl: 900 },
      { id: 'sess', kind: 'session', name: 'User session', meta: 'AT + ID token server-side' },
      { id: 'csrf', kind: 'csrf', name: 'CSRF token', meta: 'per session' },
    ],
  },
  variants: {
    jwt: {
      label: 'JWT access token',
      initial: {
        frontend: [
          { id: 'at', kind: 'jwt', name: 'Access token', meta: 'aud=api.orders · 15 min', ttl: 900 },
          { id: 'sess', kind: 'session', name: 'User session', meta: 'AT + ID token server-side' },
          { id: 'csrf', kind: 'csrf', name: 'CSRF token', meta: 'per session' },
        ],
      },
      steps: [
        ...sharedSteps,
        {
          from: 'backend', to: 'og.op', badge: 'GET /jwks',
          detail:
            'The API sees three dot-separated parts and a `kid` in the header. It looks in its **JWKS cache** for that `kid`. On a miss it fetches `jwks_uri` — this is a normal, cacheable GET, not a per-request call to OneGate.',
          channel: 'back',
          http: {
            req: `GET /mg-local/portal/jwks HTTP/1.1
Host: login.example.com`,
            res: `HTTP/1.1 200 OK
Cache-Control: public, max-age=86400

{ "keys": [
  { "kty":"RSA", "use":"sig", "kid":"og-sig-2026-07",
    "alg":"RS256", "n":"sXch…", "e":"AQAB" }
]}`,
          },
          vault: [add('backend', ITEM.jwk())],
          tags: ['public keys', 'cacheable'],
        },
        {
          from: 'backend', to: 'backend', badge: 'verify locally',
          detail:
            'Using the public key the API verifies the **RS256 signature**, then checks `iss`, `aud = api.orders`, `exp`/`nbf` with a little clock skew, and finally the scope. No network call to OneGate is needed — this is the big win: the API keeps working even if the OP is briefly unreachable.',
          channel: 'internal',
          vault: [add('backend', ITEM.claims({ claims: { sub: 'a1b2c3d4…', scope: 'openid orders.read', aud: 'api.orders', exp: '15 min from now' } }))],
          tags: ['stateless', 'offline validation'],
        },
        {
          from: 'backend', to: 'frontend', badge: '200 OK', channel: 'back',
          detail: 'The API authorises the request from claims it verified itself. The token never had to leave the request.',
          tags: ['no OP round trip'],
        },
        {
          from: 'backend', to: 'backend', badge: 'key rotation',
          detail:
            'When OneGate rotates keys, there is a short overlap: the JWKS contains the old and the new key. The API sees a new `kid`, refetches, and continues. **Never** hard-code a key — and never disable signature checking because "it kept failing".',
          channel: 'internal',
          tags: ['kid rollover', 'overlap window'],
        },
        {
          from: 'backend', to: 'frontend', badge: 'revocation lag',
          detail:
            'The trade-off: a JWT cannot be un-issued. If the user is disabled, a copy of the token stays valid until it expires. That is why lifetimes are short — and why high-risk APIs sometimes still introspect or keep a deny-list.',
          channel: 'internal',
          tags: ['trade-off'],
        },
      ],
    },
    opaque: {
      label: 'Opaque access token',
      initial: {
        frontend: [
          { id: 'at', kind: 'opaque', name: 'Access token', meta: 'opaque · must be introspected', ttl: 900 },
          { id: 'sess', kind: 'session', name: 'User session', meta: 'AT + ID token server-side' },
          { id: 'csrf', kind: 'csrf', name: 'CSRF token', meta: 'per session' },
        ],
      },
      steps: [
        ...sharedSteps,
        {
          from: 'backend', to: 'backend', badge: 'cannot parse',
          detail:
            'An opaque token is just a high-entropy string. There is no header, no payload, no signature to check. The API cannot learn anything about the user or the scopes by looking at it — that is the point.',
          channel: 'internal',
          tags: ['opaque', 'no claims inside'],
        },
        {
          from: 'backend', to: 'og.token', badge: 'POST /introspect',
          detail:
            'So the API asks the issuer. The introspection call is authenticated as a **confidential client** (Basic auth again) — otherwise anyone could probe tokens. The request is small: just the token.',
          channel: 'back',
          http: {
            req: `POST /mg-local/portal/introspect HTTP/1.1
Host: login.example.com
Authorization: Basic YXBpLW9yZGVyczpzM2NyM3Q…
Content-Type: application/x-www-form-urlencoded

token=at_9fK2…`,
            res: `HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "active": true,
  "scope": "openid orders.read",
  "sub": "a1b2c3d4-7f31-4a1e-9d2c-55e0f1a2b3c4",
  "aud": "api.orders",
  "client_id": "portal-web",
  "exp": 1789000000,
  "token_type": "Bearer"
}`,
          },
          tags: ['back channel', 'per uncached request'],
        },
        {
          from: 'og.token', to: 'backend', badge: 'active: true', channel: 'back',
          detail:
            'OneGate answers with the same information a JWT would have carried: `active`, `scope`, `sub`, `aud`, `exp`. If the token is unknown, expired or revoked, the answer is simply `{ "active": false }` — deliberately uninformative.',
          vault: [add('backend', ITEM.claims({ claims: { sub: 'a1b2c3d4…', scope: 'openid orders.read', aud: 'api.orders', active: true } }))],
          tags: ['claims on demand'],
        },
        {
          from: 'backend', to: 'frontend', badge: '200 OK', channel: 'back',
          detail: 'Now the API can authorise exactly as before. The difference is *when* the information arrived and who holds the truth.',
          tags: ['same authorisation'],
        },
        {
          from: 'og.token', to: 'og.token', badge: 'revoke',
          detail:
            'Here is the payoff: the moment the session ends or an admin revokes it, the next introspection returns `active: false`. **Revocation is immediate** — no waiting for an expiry.',
          channel: 'internal',
          tags: ['instant revocation'],
        },
        {
          from: 'backend', to: 'backend', badge: 'cache 30–60 s',
          detail:
            'The cost is latency and load: every uncached API call becomes a request to OneGate. Cache the introspection result for a short, deliberate time (30–60 s), never longer than `exp`. The shorter the cache, the closer you are to instant revocation.',
          channel: 'internal',
          tags: ['trade-off', 'throttling'],
        },
      ],
    },
  },
  notes: [
    '**Manual caveat:** the manual documents **Access Token Type** (`opaque` or `jwt`) and mentions token introspection as a claim context, but it does not describe an introspection endpoint or its settings. This scenario is generic OAuth background; verify endpoint support in your deployment.',
    '**JWT**: the API can validate alone → great for scale, many APIs, and offline resilience. Cost: revocation lag and larger tokens.',
    '**Opaque**: the OP stays the source of truth → instant revocation, tiny tokens, no claims leak. Cost: a round trip and a dependency on the OP.',
    'A common production shape: short-lived JWT access tokens (5–15 min) plus refresh tokens, and introspection only for the highest-risk operations.',
    'Either way the API must check `aud`. A token issued for `api.orders` must be rejected by `api.billing`, even if the signature is perfect.',
  ],
  config: [jwtCfg, opaqueCfg, CFG.localProvider()],
  pitfalls: [
    'Using a JWT but never checking the signature (or accepting `alg: none`) — this is the classic fatal bug.',
    'No `aud` check, so a token for one API is accepted by every API in the estate.',
    'Introspecting on every single request without caching, then blaming OneGate for latency.',
    'Caching an introspection result longer than the token lifetime, so revocation silently stops working.',
    'Hard-coding signing keys instead of following `kid` in the JWKS.',
    'Letting the client choose the algorithm. Pin RS256 (or your chosen algorithm) on the verifier side.',
  ],
};
