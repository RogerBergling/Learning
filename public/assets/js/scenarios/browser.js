import { add, ITEM, CFG, cfg } from './helpers.js';

export const spaPkce = {
  id: 'spa-pkce',
  title: 'Public SPA — Authorization Code + PKCE',
  category: 'browser',
  level: 'core',
  minutes: 9,
  tags: ['SPA', 'PKCE', 'public client', 'code flow', 'CORS', 'XSS', 'no secret'],
  summary:
    'A single-page app has no backend and cannot keep a secret. PKCE makes the code flow safe for it — but the access token still ends up in the browser, which is exactly the problem the BFF pattern solves.',
  nodes: ['user', 'onegate', 'frontend', 'backend'],
  nodeLabels: {
    frontend: { name: 'Static SPA host', sub: 'nginx / CDN — no secrets' },
  },
  steps: [
    {
      from: 'user', to: 'frontend', badge: 'GET /',
      detail: 'The browser loads static HTML and JavaScript. The SPA host is just a file server: it has no session, no client secret and never talks to OneGate.',
      http: { req: 'GET / HTTP/1.1\nHost: app.example.com', res: 'HTTP/1.1 200 OK\nContent-Type: text/html\n\n<!doctype html> …' },
      tags: ['static files', 'no secret'],
    },
    {
      from: 'frontend', to: 'user', badge: 'HTML + JS',
      detail: 'The SPA is a **public client**. Anyone can read its code and its configuration. Whatever it knows, the user knows — so there must be no `client_secret` anywhere in it.',
      tags: ['public client'],
    },
    {
      from: 'user', to: 'og.op', badge: 'GET /authorize',
      detail:
        'The SPA redirects to the authorization endpoint. The request contains `client_id`, `redirect_uri`, `scope`, a random `state`, a `nonce`, and — crucially — a **PKCE** `code_challenge` (SHA-256 of a random `code_verifier` that stays in the browser).\n\nThe redirect itself carries no token and no secret.',
      http: {
        req: `GET /mg-local/portal/authorize?
  response_type=code
  &client_id=portal-spa
  &redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
  &scope=openid%20profile%20orders.read
  &state=8f2c1d…
  &nonce=3b91ae…
  &code_challenge=Q1x7Yk…
  &code_challenge_method=S256 HTTP/1.1
Host: login.example.com`,
      },
      vault: [add('browser', ITEM.session({ id: 'verifier', name: 'PKCE verifier', meta: 'kept in JS memory, never sent until /token' }))],
      tags: ['PKCE', 'state', 'nonce'],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'validate request',
      detail:
        'OneGate checks that the client exists, that `redirect_uri` **matches the configured whitelist**, that `openid` is present, that every requested scope is allowed, and that the response type is allowed. A bad `redirect_uri` must never redirect — it gets an error page instead.',
      channel: 'internal',
      tags: ['redirect_uri whitelist', 'scope check'],
    },
    {
      from: 'og.op', to: 'user', badge: 'login page',
      detail: 'The user authenticates at OneGate. If a valid OneGate SSO session already exists, this step is skipped entirely — that is single sign-on.',
    },
    {
      from: 'user', to: 'og.op', badge: 'POST credentials',
      detail: 'On success OneGate creates a server-side session and sets a **session cookie** for `login.example.com`. The session lives on the server; the cookie is only a pointer.',
      vault: [add('onegate', ITEM.session({ name: 'OneGate SSO session', meta: 'cookie points at server-side state' }))],
      tags: ['SSO session', 'server-side'],
    },
    {
      from: 'og.op', to: 'user', badge: '302 ?code=…',
      detail:
        'OneGate redirects back to the SPA with a short-lived, **single-use authorization code** and the unchanged `state`.\n\nThe code is visible in the browser\'s address bar and history. That is acceptable: without the `code_verifier` it is useless, and it expires in about a minute.',
      http: {
        res: `HTTP/1.1 302 Found
Location: https://app.example.com/callback?code=ac_7Kd2…&state=8f2c1d…`,
      },
      vault: [add('browser', ITEM.code())],
      tags: ['front channel', 'single use', '60 s'],
    },
    {
      from: 'user', to: 'og.token', badge: 'POST /token + verifier',
      detail:
        'The SPA exchanges the code at the token endpoint — from the browser, with **no client secret**. It proves it is the same client that started the flow by sending the original `code_verifier`. OneGate hashes it and compares with the `code_challenge`.\n\nThis is why PKCE exists: an attacker who steals the code still cannot redeem it.',
      channel: 'back',
      http: {
        req: `POST /mg-local/portal/token HTTP/1.1
Host: login.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=ac_7Kd2…
&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
&client_id=portal-spa
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`,
        res: `HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://app.example.com
Cache-Control: no-store

{ "access_token":"…", "id_token":"…", "token_type":"Bearer",
  "expires_in":900, "scope":"openid profile orders.read" }`,
      },
      tags: ['no client secret', 'CORS', 'PKCE proof'],
    },
    {
      from: 'og.token', to: 'user', badge: 'AT + ID token',
      detail:
        'The SPA gets an access token and an ID token. Both now live where JavaScript can read them. A refresh token is deliberately **not** issued: a public client cannot protect one, so the SPA simply re-runs the flow (usually silently, via the OP session) when the access token expires.',
      channel: 'back',
      vault: [add('browser', ITEM.access({ kind: 'jwt', meta: 'in JS memory · aud=api.orders' })), add('browser', ITEM.id())],
      tags: ['tokens in browser', 'no refresh token'],
    },
    {
      from: 'user', to: 'backend', badge: 'GET /api/me + CORS',
      detail:
        'The SPA calls the API with `Authorization: Bearer …`. Because the request crosses origins, the browser first sends a CORS preflight (`OPTIONS`). The API must allow the origin and the `Authorization` header — but CORS is a browser control, **not** an API security control.',
      http: {
        req: `OPTIONS /api/me HTTP/1.1
Origin: https://app.example.com
Access-Control-Request-Method: GET
Access-Control-Request-Headers: authorization`,
      },
      tags: ['CORS preflight', 'bearer'],
    },
    {
      from: 'backend', to: 'og.op', badge: 'JWKS / introspect', channel: 'back',
      detail: 'The API validates the token exactly as in the JWT vs opaque simulation: signature or introspection, then `iss`, `aud`, `exp` and scope.',
      tags: ['validate'],
    },
    {
      from: 'backend', to: 'user', badge: '200 JSON', channel: 'back',
      detail: 'The API answers. It never sees the user\'s ID token, only the access token and the claims it can verify from it.',
      tags: ['least privilege'],
    },
    {
      from: 'user', to: 'user', badge: 'XSS = takeover',
      detail:
        'Everything the SPA can read, injected JavaScript can steal. One successful XSS and the attacker has a working access token until it expires.\n\nStorage guidance, in order: **in memory** (reload = re-auth), never `localStorage` (survives and is readable by every script). Even in memory the token is exposed to any XSS. This is the argument for the BFF: keep the token out of the browser completely.',
      channel: 'internal',
      vault: [add('browser', ITEM.claims({ name: 'Risk', claims: { exposed_to: 'any script on the page', stolen_token_valid: '15 min', refresh_token: 'none' } }))],
      tags: ['XSS', 'trust boundary'],
    },
  ],
  notes: [
    '**Manual caveat:** the Administration Manual’s Remote Client fields do not document `token_endpoint_auth_method = none`, and do not describe a public-client flow. This scenario is generic OAuth 2.0 + PKCE background. Verify public-client support in your OneGate version; if it is absent, use the BFF instead.',
    'PKCE (`S256`) is mandatory for public clients and recommended for confidential ones. It turns a stolen code into a useless string.',
    '`state` protects the redirect back to your app against CSRF and mix-ups; `nonce` binds the ID token to your request.',
    'Validate the ID token in the SPA as well: check `iss`, `aud`, `exp`, `nonce`, and the signature via JWKS. Do not use ID token claims as an authorisation decision for APIs.',
    'Never ship a `client_secret` in JavaScript "just for the token call". It is public by definition.',
  ],
  config: [
    cfg('Federation → OpenID Connect → Local Providers → Remote Clients → portal-spa (public client)', [
      '`response_types = code`, `grant_types = authorization_code`.',
      '`token_endpoint_auth_method = none` for a true public client (confirm the exact option in your OneGate version).',
      'Exact `redirect_uris`, e.g. `https://app.example.com/callback`. No wildcards.',
      '`scope = openid profile orders.read` — the SPA can only ask for what is listed here.',
      '**Do not** issue refresh tokens to this client.',
    ]),
    cfg('Federation → OpenID Connect → Local Providers → Advanced Settings', [
      '`code_challenge_methods_supported` must include `S256`.',
      'Keep `response_types_supported = code` only: implicit and hybrid give you tokens in the URL fragment for no good reason.',
    ]),
    CFG.localProvider(),
  ],
  pitfalls: [
    '`redirect_uri mismatch` — a trailing slash, a different port or http vs https. It must match exactly.',
    'Forgetting `state` and accepting any callback → login CSRF / account mix-up.',
    'Storing tokens in `localStorage` "because it survives refresh". It also survives XSS.',
    'Requesting `offline_access` in a SPA and ending up with a long-lived refresh token in JavaScript.',
    'The token endpoint fails from the browser due to CORS: OneGate must allow the SPA origin for the token endpoint, or the SPA must use the BFF instead.',
  ],
};
