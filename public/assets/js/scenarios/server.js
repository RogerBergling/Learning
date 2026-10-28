import { add, del, ITEM, CFG, cfg } from './helpers.js';

export const webappConfidential = {
  id: 'webapp-confidential',
  title: 'Confidential web app — server-side code flow',
  category: 'server',
  level: 'core',
  minutes: 11,
  summary:
    'The classic, still-best pattern for a web application: the browser only ever holds a session cookie, while the server holds the tokens and talks to OneGate with its client ID and secret. This is where you see exactly what a back-channel token request looks like.',
  nodes: ['user', 'onegate', 'frontend', 'backend'],
  nodeLabels: {
    frontend: { name: 'Web app server', sub: 'Node / .NET / Java · confidential' },
  },
  steps: [
    {
      from: 'user', to: 'frontend', badge: 'GET /dashboard',
      detail: 'The user asks for a protected page. The web app finds no session cookie, so the user is not authenticated yet.',
      http: { req: 'GET /dashboard HTTP/1.1\nHost: app.example.com\n(no session cookie)' },
      tags: ['no session'],
    },
    {
      from: 'frontend', to: 'user', badge: '302 /authorize',
      detail:
        'The server creates a small, temporary **login transaction** in its own session: `state`, `nonce`, `code_verifier` and the URL the user wanted. Then it redirects the browser to OneGate.\n\nNote the direction: the server *tells the browser where to go*. The browser is a courier, not a participant.',
      http: {
        res: `HTTP/1.1 302 Found
Set-Cookie: APP_TX=tx_91af…; HttpOnly; Secure; SameSite=Lax
Location: https://login.example.com/mg-local/portal/authorize?
  response_type=code
  &client_id=portal-web
  &redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
  &scope=openid%20profile%20orders.read
  &state=8f2c1d…
  &nonce=3b91ae…
  &code_challenge=Q1x7Yk…
  &code_challenge_method=S256`,
      },
      vault: [add('frontend', ITEM.session({ id: 'tx', name: 'Login transaction', meta: 'state · nonce · verifier · returnTo' }))],
      tags: ['state', 'nonce', 'PKCE'],
    },
    {
      from: 'user', to: 'og.op', badge: 'GET /authorize',
      detail:
        'The browser follows the redirect. OneGate validates the client, the exact `redirect_uri`, the requested scopes and the PKCE parameters before showing anything.',
      tags: ['front channel', 'no tokens'],
    },
    {
      from: 'og.op', to: 'user', badge: 'login page',
      detail: 'OneGate shows its login page (or silently reuses an existing SSO session for this browser).',
    },
    {
      from: 'user', to: 'og.op', badge: 'POST credentials',
      detail: 'Credentials are posted to OneGate only. The application never sees the password — that is a core benefit of federation.',
      vault: [add('onegate', ITEM.session({ name: 'OneGate SSO session', meta: 'server-side' }))],
      tags: ['no password sharing'],
    },
    {
      from: 'og.op', to: 'user', badge: '302 ?code=…',
      detail: 'OneGate redirects to the app\'s callback with a one-time code and the original `state`.',
      vault: [add('browser', ITEM.code())],
      tags: ['code in URL'],
    },
    {
      from: 'user', to: 'frontend', badge: 'GET /callback?code',
      detail:
        'The app receives the code. Before doing anything else it checks that `state` matches the login transaction it stored in step 2 — and that the transaction is fresh and unused. If not: stop, do not redeem the code.\n\nThe code is now in the browser\'s history, but it is one-time and expires quickly.',
      tags: ['state check', 'CSRF defence'],
    },
    {
      from: 'frontend', to: 'og.token', badge: 'POST /token + Basic',
      detail:
        'Now the **back channel**. The server authenticates itself with `client_id:client_secret` base64-encoded in the `Authorization: Basic` header, and sends the code plus the `code_verifier`.\n\nThe secret never touches the browser, and this request is invisible to the user. This is what "server-to-server with client ID and client password" means in practice.',
      channel: 'back',
      http: {
        req: `POST /mg-local/portal/token HTTP/1.1
Host: login.example.com
Authorization: Basic cG9ydGFsLXdlYjpzM2NyM3QtdjRsdWU=
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=ac_7Kd2…
&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`,
        res: `HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{ "access_token":"…", "id_token":"…", "refresh_token":"…",
  "token_type":"Bearer", "expires_in":900,
  "scope":"openid profile orders.read" }`,
      },
      tags: ['Basic auth', 'client secret', 'PKCE proof'],
    },
    {
      from: 'og.token', to: 'og.token', badge: 'decode Basic',
      detail:
        '`Authorization: Basic cG9ydGFsLXdlYjpzM2NyM3QtdjRsdWU=` is just `base64("portal-web:s3cr3t-v4lue")`. Base64 is **encoding, not encryption** — the secret is only protected by TLS.\n\nOneGate verifies the pair, checks that the code belongs to the same client, that it has not been used, and that the PKCE verifier matches. Any failure is `invalid_grant`.',
      channel: 'internal',
      tags: ['base64 ≠ encryption', 'invalid_grant'],
    },
    {
      from: 'og.token', to: 'frontend', badge: 'AT + ID + RT', channel: 'back',
      detail:
        'The tokens are returned over the back channel, directly to the server. The browser was never part of this exchange and will never see these values.',
      vault: [
        add('frontend', ITEM.access()),
        add('frontend', ITEM.id()),
        add('frontend', ITEM.refresh()),
        del('frontend', 'code'),
        del('browser', 'code'),
      ],
      tags: ['tokens server-side'],
    },
    {
      from: 'frontend', to: 'frontend', badge: 'keep tokens server-side',
      detail:
        'Store them in a server-side session store (memory cache, Redis, database) — never in a cookie the browser can read. Validate the ID token (`iss`, `aud`, `nonce`, signature) and read the user identity from it. The access token is a separate thing: it is for calling APIs, not for identifying the user to your own app.',
      channel: 'internal',
      tags: ['session store', 'validate id_token'],
    },
    {
      from: 'frontend', to: 'user', badge: 'Set-Cookie session',
      detail:
        'The browser gets only an opaque session cookie: `HttpOnly` (no JavaScript), `Secure` (HTTPS only), `SameSite=Lax` (blocks most cross-site POSTs), and a narrow `Path`. This cookie is the *only* credential in the browser.',
      http: {
        res: `HTTP/1.1 302 Found
Set-Cookie: APP_SESSION=sess_4c1f…; HttpOnly; Secure; SameSite=Lax; Path=/
Location: /dashboard`,
      },
      vault: [add('browser', ITEM.cookie({ id: 'app', name: 'APP_SESSION', meta: 'HttpOnly · Secure · SameSite=Lax' }))],
      tags: ['opaque session id', 'HttpOnly'],
    },
    {
      from: 'user', to: 'frontend', badge: 'GET /dashboard + cookie',
      detail: 'On the next request the browser automatically sends the session cookie. The server looks up the session and finds the tokens it stored earlier.',
      tags: ['cookie', 'server-side lookup'],
    },
    {
      from: 'frontend', to: 'backend', badge: 'GET /api/profile Bearer',
      detail:
        'The server calls the API with the user\'s access token. The API sees a normal bearer token and has no idea whether the caller is a browser, a server or a batch job.',
      channel: 'back',
      http: {
        req: `GET /api/profile HTTP/1.1
Host: api.internal.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6…`,
      },
      tags: ['server-to-server'],
    },
    {
      from: 'backend', to: 'og.op', badge: 'JWKS / introspect', channel: 'back',
      detail: 'The API validates signature (or introspects), `iss`, `aud`, `exp` and scope before trusting a single claim.',
      tags: ['validate'],
    },
    {
      from: 'backend', to: 'frontend', badge: '200 profile', channel: 'back',
      detail: 'The API returns data for the `sub` in the token. The web app renders the page.',
      vault: [add('backend', ITEM.claims())],
      tags: ['authorised by claims'],
    },
    {
      from: 'frontend', to: 'user', badge: '200 HTML',
      detail:
        'The user sees the page. Count the credentials in the browser: **one opaque session cookie**. No access token, no refresh token, no client secret. That is the whole point of a confidential web app.',
      tags: ['done'],
    },
  ],
  notes: [
    'This pattern has three trust levels: the browser (untrusted), the web tier (holds secrets and tokens), and the API (only trusts tokens).',
    'PKCE is still worth using here: it protects against code injection even when a secret exists.',
    'The ID token identifies the user **to the app**. The access token authorises calls **to the API**. Do not mix them.',
    'If the web tier is compromised, the tokens are compromised. Short token lifetimes and refresh-token rotation limit the damage.',
  ],
  config: [
    cfg('OpenID Connect → Remote Clients → portal-web (confidential)', [
      '`client_id = portal-web`, `client_secret = …` (long, random, stored in a secret manager).',
      '`token_endpoint_auth_method = client_secret_basic` — matches the Basic header above. `client_secret_post` also exists; pick one and stay consistent.',
      'Exact `redirect_uris = https://app.example.com/callback`.',
      '`grant_types = authorization_code` plus `refresh_token` if you use it.',
      '`scope = openid profile orders.read email`.',
    ]),
    CFG.localProvider,
    CFG.remoteClient('portal-web'),
    cfg('Realm Settings → ID Token Attribute Profile', [
      'Map `sub`, `name`, `email` and anything else the app needs from the local user store.',
      'Use `PARM{oidcclient.*}` local properties if two clients need different values for the same claim.',
    ]),
  ],
  pitfalls: [
    '`invalid_client` — Basic header malformed, secret rotated, or the client uses `client_secret_post` while OneGate expects `client_secret_basic`.',
    '`invalid_grant` — the code was already used, expired, sent with a different `redirect_uri`, or the PKCE verifier does not match.',
    'Logging the `Authorization` header or the token response. Secrets and tokens in logs are a breach waiting to happen.',
    'Skipping the `state` check because "it usually works". That is exactly how login CSRF gets in.',
    'Putting tokens in a readable cookie to "make the frontend simpler". You have just rebuilt the SPA problem with extra steps.',
  ],
};

export const refreshRotation = {
  id: 'refresh-rotation',
  title: 'Refresh token rotation & reuse detection',
  category: 'server',
  level: 'advanced',
  minutes: 9,
  summary:
    'Long sessions need refresh tokens. Rotating them on every use — and detecting reuse of an old one — turns a stolen refresh token from a permanent backdoor into a one-shot alarm.',
  nodes: ['user', 'onegate', 'frontend'],
  nodeLabels: { frontend: { name: 'Web app server', sub: 'confidential client' } },
  initial: {
    frontend: [
      { id: 'at', kind: 'jwt', name: 'Access token', meta: 'expires in 40 s' },
      { id: 'rt', kind: 'rt', name: 'Refresh token #1', meta: 'latest in the family' },
    ],
    browser: [{ id: 'app', kind: 'cookie', name: 'APP_SESSION', meta: 'HttpOnly session cookie' }],
  },
  steps: [
    {
      from: 'frontend', to: 'og.token', badge: 'grant=refresh_token',
      detail:
        'The access token is about to expire, so the server refreshes instead of sending the user through login again. It authenticates as the same confidential client and presents **refresh token #1**.',
      channel: 'back',
      http: {
        req: `POST /mg-local/portal/token HTTP/1.1
Host: login.example.com
Authorization: Basic cG9ydGFsLXdlYjpzM2NyM3QtdjRsdWU=
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=rt_9Kd2…`,
      },
      tags: ['refresh_token grant', 'confidential client'],
    },
    {
      from: 'og.token', to: 'og.token', badge: 'checks',
      detail:
        'OneGate verifies that #1 is the **latest** token in its family, that the family has not exceeded its **total lifetime**, that the token has not exceeded **max idle**, and that the client is still allowed to refresh.',
      channel: 'internal',
      tags: ['latest?', 'total lifetime', 'max idle'],
    },
    {
      from: 'og.token', to: 'frontend', badge: 'AT #2 + RT #2', channel: 'back',
      detail:
        'A new access token and a **new refresh token #2** are issued. #1 is marked as used and must never work again. This is rotation: every refresh consumes one token and produces the next.',
      vault: [
        add('frontend', ITEM.access({ meta: 'new AT · 15 min' })),
        add('frontend', ITEM.refresh({ id: 'rt2', name: 'Refresh token #2', meta: 'new latest in the family' })),
        del('frontend', 'rt'),
      ],
      tags: ['rotation', 'one-time use'],
    },
    {
      from: 'frontend', to: 'frontend', badge: 'replace atomically',
      detail:
        'The server replaces both tokens in the session in one atomic write. If a crash leaves the old token behind, the next refresh looks like reuse — so make this update transactional.',
      channel: 'internal',
      tags: ['atomic update'],
    },
    {
      from: 'frontend', to: 'og.token', badge: 'replay RT #1',
      detail:
        'Now the dangerous case. Someone presents **#1** again — a buggy retry, a leaked token, or an attacker who copied it before the legitimate refresh.\n\nThere is no way to tell an attacker from a client with a race condition, so the protocol must assume the worst.',
      channel: 'back',
      tags: ['stolen token', 'or a race'],
    },
    {
      from: 'og.token', to: 'og.token', badge: 'reuse detected',
      detail:
        '**Reuse detection** fires. #1 is already consumed, so OneGate invalidates the **entire token family** — including the perfectly valid #2. The session is over; the user must authenticate again.\n\nThat is the point: the attacker\'s stolen token becomes worthless at the same moment the legitimate user is forced to re-login.',
      channel: 'internal',
      tags: ['invalidate family', 'security event'],
    },
    {
      from: 'og.token', to: 'frontend', badge: '400 invalid_grant', channel: 'back',
      detail:
        'The response is `400 invalid_grant`. There is deliberately no detail about *why* — do not help an attacker tune their attack.',
      http: {
        res: `HTTP/1.1 400 Bad Request
Content-Type: application/json
Cache-Control: no-store

{ "error": "invalid_grant",
  "error_description": "refresh token is not valid" }`,
      },
      vault: [del('frontend', 'rt2'), del('frontend', 'at')],
      tags: ['generic error'],
    },
    {
      from: 'frontend', to: 'user', badge: 'session ended',
      detail:
        'The app destroys the server session and sends the user to login. An alert should fire in the SIEM: refresh token reuse is a strong signal of token theft.',
      vault: [del('browser', 'app')],
      tags: ['force re-auth', 'alert'],
    },
    {
      from: 'og.token', to: 'og.token', badge: 'grace period',
      detail:
        'Real clients retry. The **reuse grace period** (seconds) allows an old token to be reused within a short window without triggering the family kill — useful for parallel tabs or a lost response. Keep it small: it is a race-condition fix, not a revocation amnesty.',
      channel: 'internal',
      tags: ['race window', 'keep it short'],
    },
    {
      from: 'og.token', to: 'og.token', badge: 'limits',
      detail:
        'Four limits work together: **lifetime** (per token), **total lifetime** (the whole family, counted from the first token), **max idle** (unused for too long → dead) and **update refresh token**. If `Update refresh token` is off, the same token is reused forever and reuse detection has nothing to detect.',
      channel: 'internal',
      tags: ['lifetime', 'total', 'max idle'],
    },
  ],
  notes: [
    'Refresh token rotation is only meaningful with **update refresh token** enabled and reuse detection on.',
    'A family-wide kill is intentionally harsh: it converts a silent long-term compromise into a visible re-login.',
    'If clients run in parallel (multiple tabs, multiple workers), they need a single-flight refresh queue — otherwise they will trip reuse detection on themselves.',
    'Bind refresh tokens to the client and, where possible, to the device/session. A refresh token from another client must be rejected.',
  ],
  config: [
    cfg('Local Provider → Refresh token', [
      '**Refresh token lifetime (min)**: how long one token lives.',
      '**Refresh token total lifetime (min)**: cap for the whole family, counted from the first token.',
      '**Refresh token max idle (min)**: kills a family that stops being used.',
      '**Update refresh token**: ON — issue a new token on every refresh.',
      '**Reuse detection**: ON — the old token must be the latest, otherwise the family dies.',
      '**Reuse grace period (sec)**: small, e.g. 5–15 s, for retries.',
      '**Issue id token**: optional; useful if the app needs fresh identity claims after a refresh.',
    ]),
    cfg('Remote Client', [
      '`grant_types` must include `refresh_token`.',
      '`scope` controls the maximum scope a refresh may return; a refresh must never widen scope.',
    ]),
  ],
  pitfalls: [
    'Turning on reuse detection but not rotation — every second refresh fails for legitimate users.',
    'Two app instances refreshing at the same time and killing each other\'s sessions. Use a lock or single-flight refresh.',
    'Assuming a refresh response can add scopes. It must not — that would be privilege escalation.',
    'Keeping refresh tokens forever because "the user hates logging in". Total lifetime exists for a reason.',
    'Not logging reuse events. You built the alarm and then unplugged it.',
  ],
};

export const multiAudience = {
  id: 'multi-audience',
  title: 'Audience & resource indicators — one token per API',
  category: 'tokens',
  level: 'advanced',
  minutes: 7,
  summary:
    'A token issued for the orders API must not open the billing API. Audience is what enforces that boundary — and `resource` / scope-to-audience mapping is how you ask for the right one.',
  nodes: ['user', 'onegate', 'backend', 'sp'],
  nodeLabels: {
    backend: { name: 'Orders API', sub: 'aud = api.orders' },
    sp: { name: 'Billing API', sub: 'aud = api.billing' },
  },
  steps: [
    {
      from: 'user', to: 'og.op', badge: 'GET /authorize',
      detail:
        'The client starts a normal code flow, but adds a **resource indicator**: `resource=https://api.orders`. RFC 8707 lets the client say *which* API the token is for, instead of leaving the audience to a global default.',
      http: {
        req: `GET /mg-local/portal/authorize?
  response_type=code&client_id=portal-spa
  &scope=openid%20orders.read
  &resource=https%3A%2F%2Fapi.orders
  &state=8f2c1d… HTTP/1.1`,
      },
      tags: ['RFC 8707', 'resource parameter'],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'map resource',
      detail:
        'OneGate checks the resource against the client\'s **Allowed resources from parameter** list. Unknown resources are rejected — otherwise a client could mint a token for any audience it likes.',
      channel: 'internal',
      tags: ['allow-list', 'reject unknown'],
    },
    {
      from: 'og.op', to: 'user', badge: '302 ?code',
      detail: 'Login proceeds as usual. The resource request is carried through the flow and applied when the token is issued.',
      tags: ['code flow'],
    },
    {
      from: 'user', to: 'og.token', badge: 'POST /token',
      detail: 'The SPA exchanges the code (with PKCE) and repeats the resource indicator. The `resource` must be consistent with the authorisation request.',
      channel: 'back',
      tags: ['PKCE'],
    },
    {
      from: 'og.token', to: 'user', badge: 'AT aud=api.orders', channel: 'back',
      detail:
        'The access token is minted with `aud = api.orders`. The audience can come from the default resource, from the `resource` parameter, or from a **scope → audience** mapping (resource indicator from scope).',
      vault: [add('browser', ITEM.access({ claims: { aud: 'api.orders', scope: 'openid orders.read' } }))],
      tags: ['aud from mapping'],
    },
    {
      from: 'user', to: 'backend', badge: 'GET /api/orders',
      detail: 'The Orders API receives the token, verifies `aud = api.orders` and returns the data. Correct.',
      tags: ['accepted'],
    },
    {
      from: 'backend', to: 'user', badge: '200 OK', channel: 'back',
      detail: 'The token was meant for this API, so the call succeeds.',
    },
    {
      from: 'user', to: 'sp', badge: 'GET /api/invoices (same token)',
      detail:
        'Now the same token is sent to the Billing API. The signature is valid. The user is real. The scope even looks plausible. But `aud` is `api.orders`, not `api.billing`.',
      http: {
        req: `GET /api/invoices HTTP/1.1
Host: api.billing
Authorization: Bearer <token with aud=api.orders>`,
      },
      tags: ['wrong audience'],
    },
    {
      from: 'sp', to: 'user', badge: '401 invalid_token', channel: 'back',
      detail:
        'The Billing API rejects it: `401 invalid_token`. This is the boundary working. Without the `aud` check, one stolen token would open every API in the estate.',
      http: {
        res: `HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token",
  error_description="audience mismatch"`,
      },
      tags: ['aud mismatch', '401'],
    },
    {
      from: 'user', to: 'og.token', badge: 'ask for billing',
      detail: 'To call Billing, the client requests a **separate** token with `resource=https://api.billing` (or a scope that maps to it). One token per audience is the rule.',
      channel: 'back',
      tags: ['one token per API'],
    },
    {
      from: 'og.token', to: 'user', badge: 'AT aud=api.billing', channel: 'back',
      detail:
        'A second token, with a narrower scope (`billing.read`) and the right audience. If it leaks, it only opens Billing — and only to read.',
      vault: [add('browser', ITEM.access({ id: 'at2', name: 'Access token (billing)', meta: 'aud=api.billing · scope=billing.read' }))],
      tags: ['least privilege'],
    },
    {
      from: 'user', to: 'sp', badge: 'GET /api/invoices',
      detail: 'Now the Billing API accepts the call. Two APIs, two tokens, no shared blast radius.',
      tags: ['accepted'],
    },
  ],
  notes: [
    '`aud` is a security boundary, not metadata. Every API must validate it against its own identifier.',
    'A single "god token" with `aud = *` or an enormous scope list is the most common design mistake in microservice estates.',
    'Short lifetimes plus per-API audiences contain a leak to one service for a few minutes.',
    'Some deployments map scope names to audiences (`orders.read` → `api.orders`), which keeps clients simple and still gives each API its own audience.',
  ],
  config: [
    cfg('Remote Client → Access Token JWT', [
      '**Default resource (aud)**: used when the client does not ask for anything specific.',
      '**Allowed resources from parameter**: the URL-encoded list of audiences this client may request with `resource`.',
      '**Resource indicator from scope**: map a scope to an audience, e.g. `orders.read → api.orders`.',
    ]),
    cfg('APIs (resource servers)', [
      'Validate `aud` against your own API identifier — always.',
      'Reject tokens whose `aud` is not yours, even if the signature is valid.',
      'Keep scopes fine-grained enough that one token cannot do everything.',
    ]),
  ],
  pitfalls: [
    'Not checking `aud` at all. Then every token is valid everywhere.',
    'Using the client ID as the only audience for API tokens, so all APIs share one audience.',
    'Allowing `resource` values that are not on the allow-list — that is an audience-confusion vulnerability.',
    'Requesting every scope up front "to avoid extra round trips". You just built a god token.',
  ],
};
