import { add, del, ITEM, CFG, cfg } from './helpers.js';

export const bffLogin = {
  id: 'bff-login',
  title: 'BFF login — OneGate as OP and RP at the same time',
  category: 'bff',
  level: 'core',
  minutes: 13,
  tags: ['BFF', 'cookie', 'CSRF', 'PKCE', 'OneGate as OP and RP', 'no tokens in browser'],
  summary:
    'The flagship flow. The SPA has no tokens and no secret. OneGate\'s BFF drives an ordinary Authorization Code flow against its own local OpenID Provider, keeps every token server-side, and hands the browser nothing but an HttpOnly cookie.',
  nodes: ['user', 'onegate', 'frontend', 'backend'],
  nodeLabels: {
    frontend: { name: 'SPA host', sub: 'static files only' },
  },
  steps: [
    {
      from: 'user', to: 'og.bff', badge: 'GET /bff/login',
      detail:
        'The SPA sends the user to the BFF login endpoint. The example passes only the return URL, which is checked against the **Client Redirect URIs** prefix whitelist.\n\nThe manual documents the `/bff/logout` and `/bff/accessToken` endpoints. The login, RP-callback and exchange paths shown in this lab are illustrative — treat them as examples and read your own deployment.\n\nOneGate creates a login transaction in its server-side session: `state`, `nonce`, `code_verifier`, the return URL. Nothing is issued yet.',
      http: {
        req: `GET /mg-local/portal/bff/login?redirect_uri=https%3A%2F%2Fapp.example.com%2F
Host: app.example.com`,
        res: `HTTP/1.1 302 Found
Set-Cookie: OG_BFF_TX=tx_71c…; HttpOnly; Secure; SameSite=Lax; Path=/mg-local/portal/bff
Location: /mg-local/portal/authorize?…`,
      },
      vault: [add('onegate', ITEM.session({ id: 'tx', name: 'Login transaction', meta: 'state · nonce · verifier · returnTo' }))],
      tags: ['redirect whitelist', 'state', 'PKCE'],
    },
    {
      from: 'og.bff', to: 'og.rp', badge: 'use RP config',
      detail:
        'Here is the part that surprises people: the BFF does not invent a login. It delegates to its **RP Authentication** configuration, which is an ordinary OpenID Connect Relying Party.\n\nThat RP has a **Remote Provider** whose endpoints are… OneGate\'s own Local Provider. So OneGate talks to itself using the exact same protocol it would use with Entra or a partner. Same code path, same validation, no special case.',
      channel: 'internal',
      tags: ['BFF → RP', 'OneGate ↔ OneGate'],
    },
    {
      from: 'og.rp', to: 'user', badge: '302 /authorize',
      detail:
        'The browser is redirected to the Local Provider with a normal authorization request. The `redirect_uri` points back into OneGate\'s **RP callback** — not the SPA and not the BFF callback; the exact path is deployment-specific.\n\nThe RP authenticates as the remote client `bff-portal`, which is a **confidential** client registered on the local provider.',
      http: {
        res: `HTTP/1.1 302 Found
Location: https://login.example.com/mg-local/portal/authorize?
  response_type=code
  &client_id=bff-portal
  &redirect_uri=https%3A%2F%2Flogin.example.com%2Fmg-local%2Fportal%2Frp%2Fcallback
  &scope=openid%20profile%20orders.read
  &state=8f2c1d…
  &nonce=3b91ae…
  &code_challenge=Q1x7Yk…&code_challenge_method=S256`,
      },
      tags: ['confidential client', 'same host'],
    },
    {
      from: 'user', to: 'og.op', badge: 'GET /authorize',
      detail:
        'The browser requests the authorize endpoint. OneGate validates the client, matches `redirect_uri` against the configured whitelist, and checks the scopes and PKCE parameters where enabled. A request with a foreign `redirect_uri` gets an error page, never a redirect.',
      tags: ['validation'],
    },
    {
      from: 'og.op', to: 'user', badge: 'login page / SSO',
      detail:
        'If the browser already has an OneGate SSO session, the login page is skipped. That is why a user who logged into another OneGate app does not have to type a password again.',
      tags: ['SSO'],
    },
    {
      from: 'user', to: 'og.op', badge: 'POST credentials',
      detail: 'The user authenticates at OneGate. A server-side SSO session is created and referenced by a session cookie scoped to the OneGate host.',
      vault: [add('onegate', ITEM.session({ name: 'OneGate SSO session', meta: 'server-side · cookie pointer' }))],
      tags: ['SSO session'],
    },
    {
      from: 'og.op', to: 'user', badge: '302 ?code=…',
      detail: 'OneGate redirects to the **RP callback** with a one-time code. The browser carries it for exactly one hop.',
      vault: [add('browser', ITEM.code())],
      tags: ['front channel', 'single use'],
    },
    {
      from: 'user', to: 'og.rp', badge: 'GET RP callback',
      detail:
        'The **RP callback** checks `state` against the RP transaction, then consumes it. An unknown or replayed `state` is rejected — this is what stops login CSRF and session fixation. The BFF then completes its own login transaction and creates the BFF session.',
      tags: ['state check'],
    },
    {
      from: 'og.rp', to: 'og.token', badge: 'POST /token (Basic)',
      detail:
        'The back channel. Even though RP and provider live in the same product, the exchange follows the spec: `client_id:client_secret` in HTTP Basic, the code, the `redirect_uri`, and the PKCE `code_verifier`.\n\nNo shortcut, no "trusted local call". That is a feature: the flow you test is the flow you get.',
      channel: 'back',
      http: {
        req: `POST /mg-local/portal/token HTTP/1.1
Host: login.example.com
Authorization: Basic YsZmZi1wb3J0YWw6…
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=ac_7Kd2…
&redirect_uri=https%3A%2F%2Flogin.example.com%2Fmg-local%2Fportal%2Frp%2Fcallback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`,
        res: `HTTP/1.1 200 OK
Cache-Control: no-store

{ "access_token":"…", "id_token":"…", "refresh_token":"…",
  "token_type":"Bearer", "expires_in":900 }`,
      },
      tags: ['back channel', 'client secret', 'PKCE'],
    },
    {
      from: 'og.token', to: 'og.rp', badge: 'AT + ID + RT', channel: 'back',
      detail:
        'The tokens land in the RP session, server-side. The access token is what the BFF/proxy will use towards APIs. The ID token establishes the user identity. The refresh token lets the session renew silently when configured.',
      vault: [
        add('onegate', ITEM.access({ name: 'Access token (BFF session)', meta: 'aud=api.orders · server-side' })),
        add('onegate', ITEM.id()),
        add('onegate', ITEM.refresh()),
        del('onegate', 'tx'),
        del('browser', 'code'),
      ],
      tags: ['server-side tokens'],
    },
    {
      from: 'og.bff', to: 'user', badge: 'Set-Cookie BFF',
      detail:
        'The browser finally gets something: a **BFF session cookie**. `HttpOnly` so scripts cannot read it, `Secure` so it only travels over TLS, `SameSite=Lax` so it is not sent on cross-site POSTs, and `Path` limited to the BFF. Then the user is redirected back to the SPA.\n\nThere is no token in the URL, none in the response body, none in JavaScript.',
      http: {
        res: `HTTP/1.1 302 Found
Set-Cookie: ONEGATE_BFF=sess_4c1f…; HttpOnly; Secure; SameSite=Lax; Path=/mg-local/portal/bff
Location: https://app.example.com/`,
      },
      vault: [add('browser', ITEM.cookie({ meta: 'HttpOnly · Secure · SameSite=Lax' }))],
      tags: ['only a cookie', 'no tokens in browser'],
    },
    {
      from: 'user', to: 'frontend', badge: 'GET /',
      detail: 'The SPA is loaded from its static host. The cookie for `app.example.com` is not sent to a different host, but the SPA calls the API on the same host, through the proxy — so it will be sent there.',
      tags: ['same-origin API path'],
    },
    {
      from: 'frontend', to: 'user', badge: 'JS bundle',
      detail: 'Nothing secret is in the bundle: no client secret, no token, no user data. An attacker who reads every byte of your JavaScript learns the API paths, and nothing more.',
      tags: ['public by definition'],
    },
    {
      from: 'user', to: 'og.proxy', badge: 'GET /bff/api/orders',
      detail:
        'The SPA calls a relative path such as `/mg-local/portal/bff/api/orders`. The browser attaches the BFF cookie automatically. For state-changing requests the SPA must also send the **CSRF header** (`X-CSRFTOKEN`) with the value from the session bootstrap endpoint.',
      http: {
        req: `GET /mg-local/portal/bff/api/orders HTTP/1.1
Host: app.example.com
Cookie: ONEGATE_BFF=sess_4c1f…`,
      },
      tags: ['cookie sent automatically', 'CSRF for writes'],
    },
    {
      from: 'og.bff', to: 'og.bff', badge: 'validate session',
      detail:
        'OneGate validates the cookie, loads the server-side session, checks that the user is still enabled and the session is not expired, and refreshes the access token if needed. For `POST`/`PUT`/`DELETE` it also verifies the CSRF header.',
      channel: 'internal',
      tags: ['session check', 'CSRF check', 'silent refresh'],
    },
    {
      from: 'og.proxy', to: 'backend', badge: 'Bearer AT',
      detail:
        'The proxy attaches the access token as `Authorization: Bearer …` and forwards the request. This is the moment the BFF earns its name: it *is* the frontend\'s backend.\n\nThe API cannot tell that the caller was a browser — it only sees a bearer token.',
      channel: 'back',
      http: {
        req: `GET /api/orders HTTP/1.1
Host: api.internal.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6…`,
      },
      tags: ['token injection', 'trust boundary'],
    },
    {
      from: 'backend', to: 'og.op', badge: 'JWKS / introspect', channel: 'back',
      detail: 'The API validates the token as always: signature or introspection, then `iss`, `aud`, `exp` and scope.',
      tags: ['validate'],
    },
    {
      from: 'backend', to: 'og.proxy', badge: '200 JSON', channel: 'back',
      detail: 'The API returns the data. The proxy passes it through unchanged (minus any headers it must strip).',
      vault: [add('backend', ITEM.claims())],
      tags: ['data'],
    },
    {
      from: 'og.proxy', to: 'user', badge: '200 JSON',
      detail:
        'The browser receives JSON. Count what it holds: one HttpOnly cookie. No access token, no refresh token, no ID token, no client secret. The BFF pattern is working.',
      tags: ['done'],
    },
  ],
  notes: [
    'The BFF exists to remove tokens from the browser. If you enable the debug `accessToken` endpoint in production, you have undone the entire design.',
    'OneGate-as-OP plus OneGate-as-RP is not a hack: it means one consistent protocol implementation, and the same flow works identically when the RP points at an external IdP.',
    'The BFF cookie is a **session credential**. Treat it like one: HttpOnly, Secure, SameSite, short idle timeout, and logout that actually invalidates it server-side.',
    'Because the API is on the same origin as the SPA (through the proxy), there is no CORS and no token storage problem. That is a large operational win.',
  ],
  config: [
    CFG.bff('portal', [
      '**RP Authentication**: the OIDC RP that points at the local provider (or at a partner IdP).',
      '**Local Provider**: the OneGate OP that issues the tokens.',
      '**Remote Client**: `bff-portal` — the client the BFF authenticates as at the token endpoint.',
      '**Client Redirect URIs**: `https://app.example.com/` — prefix whitelist for the post-login redirect.',
      '**Logout URL**: where the browser goes after `/mg-local/portal/bff/logout`.',
      '**Authenticate users from tokens**: leave **off** — the user is authenticated by the same OneGate, not a third-party OP.',
      '**Enable AT Endpoint (debug)**: leave **off**.',
    ]),
    cfg('Federation → OpenID Connect RP → RP Authentication → bff-portal-rp', [
      '**Remote Provider**: points at the OneGate Local Provider (discovery or manual metadata).',
      '**client_id = bff-portal**, **client_secret = …** — a confidential client on the local provider.',
      '**response_types = code**, **token_endpoint_auth_method = client_secret_basic**, **scope = openid profile orders.read**.',
    ]),
    CFG.remoteClient('bff-portal', [
      'Redirect URI must be the RP callback, e.g. `https://login.example.com/mg-local/portal/rp/callback` (illustrative).',
      'Grant `authorization_code` and, if the session renews, `refresh_token`.',
    ]),
    CFG.webResource,
  ],
  pitfalls: [
    'The RP callback is not in the remote client\'s redirect whitelist → `redirect_uri mismatch` and the login never completes.',
    'The BFF cookie is set on the wrong domain (login host instead of app host), so the SPA never sends it.',
    '`SameSite=None` without `Secure`, or a cookie the SPA cannot use because the API path is not proxied.',
    'Forgetting the CSRF header on `POST`/`PUT`/`DELETE` and getting a 403 that looks like an auth failure.',
    'A redirect whitelist of `*`, or a prefix like `https://app.example.com` that also matches `https://app.example.com.evil.tld`. Use full prefixes with a trailing `/`.',
    'Enabling the debug access-token endpoint "temporarily" and shipping it.',
  ],
};

export const bffThirdParty = {
  id: 'bff-thirdparty',
  title: 'BFF with a partner IdP — federated login into a SPA',
  category: 'bff',
  level: 'advanced',
  minutes: 12,
  tags: ['BFF', 'federation', 'partner IdP', 'JIT', 'user mapping', 'token normalisation'],
  summary:
    'A partner\'s employees log in with their own identity provider. OneGate acts as RP towards the partner and as OP towards your SPA — and the SPA still only ever sees a cookie.',
  nodes: ['user', 'onegate', 'frontend', 'backend', 'idp'],
  nodeLabels: {
    frontend: { name: 'SPA host', sub: 'static files only' },
    idp: { name: 'Partner IdP', sub: 'Entra / Okta / SAML' },
  },
  steps: [
    {
      from: 'user', to: 'og.bff', badge: 'GET /bff/login',
      detail: 'Same entry point as a local login (the `/bff/login` path is illustrative). The difference is entirely in configuration: the BFF\'s RP Authentication points at a **partner** remote provider instead of the local one.',
      vault: [add('onegate', ITEM.session({ id: 'tx', name: 'Login transaction', meta: 'state · nonce · verifier' }))],
      tags: ['same BFF', 'different RP'],
    },
    {
      from: 'og.bff', to: 'og.rp', badge: 'partner RP',
      detail:
        'The RP loads its Remote Provider: a discovery document (or manual metadata) with the partner\'s `authorization_endpoint`, `token_endpoint`, `jwks_uri` and `issuer`.',
      channel: 'internal',
      tags: ['discovery', 'trust anchor'],
    },
    {
      from: 'og.rp', to: 'user', badge: '302 partner /authorize',
      detail:
        'The browser is sent to the partner IdP with OneGate\'s registered `client_id`, the **RP callback** as `redirect_uri`, and `state`/`nonce`/PKCE. The user\'s password never touches OneGate.\n\nThe exact RP callback path is deployment-specific; the value below is illustrative.',
      http: {
        res: `HTTP/1.1 302 Found
Location: https://login.partner.com/oauth2/v2.0/authorize?
  client_id=og-federation
  &response_type=code
  &redirect_uri=https%3A%2F%2Flogin.example.com%2Fmg-local%2Fportal%2Frp%2Fcallback
  &scope=openid%20profile%20email
  &state=8f2c1d…&nonce=3b91ae…`,
      },
      tags: ['front channel'],
    },
    {
      from: 'user', to: 'idp', badge: 'GET /authorize',
      detail: 'The partner IdP applies its own policy: password, MFA, conditional access, device compliance. OneGate has no say in — and no visibility into — how the partner authenticates its people.',
      tags: ['partner policy', 'MFA'],
    },
    {
      from: 'idp', to: 'user', badge: 'partner login',
      detail: 'The user authenticates at the partner. This is the whole point of federation: credentials stay with the identity owner.',
      tags: ['no password sharing'],
    },
    {
      from: 'user', to: 'idp', badge: 'POST credentials',
      detail: 'The partner creates its own session. OneGate is not involved and learns nothing about the credential exchange.',
      vault: [add('idp', ITEM.session({ name: 'Partner session', meta: 'at the partner IdP' }))],
      tags: ['partner session'],
    },
    {
      from: 'idp', to: 'user', badge: '302 OneGate callback',
      detail: 'The partner redirects back to OneGate with an authorization code issued **by the partner**.',
      vault: [add('browser', ITEM.code({ meta: 'issued by the partner IdP' }))],
      tags: ['code'],
    },
    {
      from: 'user', to: 'og.rp', badge: 'GET RP callback',
      detail: 'The **RP callback** validates `state` and redeems the code at the **partner\'s** token endpoint. Once the RP has a session, the BFF completes its own login transaction. The path is deployment-specific.',
      tags: ['state check'],
    },
    {
      from: 'og.rp', to: 'idp', badge: 'POST /token',
      detail:
        'Back channel to the partner, authenticated with OneGate\'s client ID and secret (or a stronger method such as a certificate, depending on the partner). The response contains the partner\'s access token, ID token and possibly a refresh token.',
      channel: 'back',
      http: {
        req: `POST /oauth2/v2.0/token HTTP/1.1
Host: login.partner.com
Authorization: Basic b2ctZmVkZXJhdGlvbjp…
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=…&redirect_uri=…
&code_verifier=…`,
        res: `HTTP/1.1 200 OK

{ "access_token":"…", "id_token":"…", "expires_in":3600,
  "token_type":"Bearer" }`,
      },
      tags: ['back channel', 'partner secret'],
    },
    {
      from: 'idp', to: 'og.rp', badge: 'ID token (partner)', channel: 'back',
      detail:
        'The partner\'s ID token says who the user is **at the partner**: `iss`, `sub` (an object ID), `email`, maybe `groups`. OneGate verifies the signature with the partner\'s JWKS, plus `iss`, `aud`, `exp` and `nonce`.',
      vault: [add('onegate', ITEM.id({ name: 'Partner ID token', meta: 'iss=partner · sub=partner object id' }))],
      tags: ['verify', 'nonce'],
    },
    {
      from: 'og.rp', to: 'og.bff', badge: 'authenticated session', channel: 'internal',
      detail: 'The RP now has a verified federated identity and a local session. The BFF completes its own login transaction and reads the identity/tokens from the RP context. The SPA still has nothing but a cookie.',
      tags: ['RP → BFF', 'local session'],
    },
    {
      from: 'og.bff', to: 'og.bff', badge: 'map to local user',
      detail:
        'OneGate resolves the federated identity to a local user. The RP settings and the BFF **Authenticate users from tokens** flag decide which path is used. Strategies in the RP config:\n\n- **Custom user id attribute** — map by email, UPN or employee ID.\n- **Map it to a custom attribute** — store the partner `sub` on the local user for next time.\n- **Handle unknown users** — reject, allow, or skip the local user database check (just-in-time provisioning).\n\nIf the mapping fails you get a login loop, not an error page. Log the decision.',
      channel: 'internal',
      tags: ['user mapping', 'JIT provisioning'],
    },
    {
      from: 'og.bff', to: 'og.token', badge: 'issue local tokens',
      detail:
        'The SPA and the APIs trust **OneGate** tokens, not partner tokens. So OneGate issues its own access token and ID token for the mapped local user, using the configured Local Provider and Remote Client. From here on, the partner is out of the picture.',
      channel: 'internal',
      vault: [add('onegate', ITEM.access({ meta: 'local token · aud=api.orders' })), add('onegate', ITEM.refresh())],
      tags: ['token normalisation'],
    },
    {
      from: 'og.bff', to: 'user', badge: 'Set-Cookie BFF',
      detail: 'The browser gets only the BFF cookie. The partner tokens stay in the session and are used only if you need to call partner APIs.',
      vault: [add('browser', ITEM.cookie({ meta: 'HttpOnly' })), del('browser', 'code')],
      tags: ['cookie only'],
    },
    {
      from: 'user', to: 'og.proxy', badge: 'GET /bff/api/orders',
      detail: 'The SPA calls its API through the proxy, exactly as with a local login. It cannot tell — and does not need to know — which IdP authenticated the user.',
      tags: ['same app code'],
    },
    {
      from: 'og.proxy', to: 'backend', badge: 'Bearer local AT',
      detail: 'The proxy attaches the **local** access token. The API only ever needs to trust OneGate.',
      channel: 'back',
      tags: ['single trust anchor for APIs'],
    },
    {
      from: 'backend', to: 'og.op', badge: 'validate', channel: 'back',
      detail: 'Validation is unchanged. Federation is an authentication concern; authorisation still comes from the local token\'s claims and scopes.',
      tags: ['iss = OneGate'],
    },
    {
      from: 'backend', to: 'user', badge: '200 OK', channel: 'back',
      detail: 'A partner employee is using your app with their corporate identity, and your APIs never had to learn anything about the partner.',
      vault: [add('backend', ITEM.claims({ claims: { sub: 'local-user-4711', email: 'anna@partner.com', idp: 'partner-entra' } }))],
      tags: ['done'],
    },
  ],
  notes: [
    'Decide early what the identity key is: email changes, object IDs are tenant-specific, employee numbers are stable. Pick one and document it.',
    '**Reject unknown users** is the safe default. Just-in-time provisioning is convenient but means anyone the partner authenticates can create an account.',
    'The local `sub` must stay stable for the user even if the partner re-issues their object ID. Otherwise every mapping change looks like a new person.',
    'Entra External Authentication Method is a **Remote Client** setting: the **UserId Claim** from `id_token_hint`, the local parameter to compare it with, plus `acr`/`amr` values. See the Local Provider chapter.',
    'Partner tokens are for partner APIs. Do not forward them to your own APIs — normalise to OneGate tokens and keep one trust anchor.',
  ],
  config: [
    CFG.rp('partner-entra'),
    cfg('Federation → OpenID Connect RP → Remote Providers → partner-entra', [
      '**Use Discovery URL**: `https://login.partner.com/.well-known/openid-configuration` (or manual metadata).',
      'Connect/read timeout, and keep **Skip SSL check** off in production.',
      '`subject_types_supported = public` unless the partner requires pairwise.',
    ]),
    cfg('Federation → OpenID Connect RP → RP Authentication → Local user handling', [
      '**Custom User Id attribute** → `email` (or `upn`).',
      '**Map it to a custom attribute** → `partnerObjectId`, so the next login can match on it directly.',
      '**Handle unknown users** → Reject (default), Allow, or No user db check for JIT.',
      '**Session Properties** → e.g. `profile = PARM{prop-oidc.realm.userinfo.profile}`.',
    ]),
    CFG.bff('portal', [
      '**Authenticate users from tokens**: ON — the user is authenticated by a third-party OP.',
      '**RP Authentication**: `partner-entra`.',
      '**Local Provider** + **Remote Client**: the OneGate client that will issue the local tokens.',
    ]),
  ],
  pitfalls: [
    'The partner `redirect_uri` is not registered at the partner, so you get `redirect_uri mismatch` at *their* IdP.',
    'Clock skew between OneGate and the partner → `invalid ID token` because `exp` looks expired. Allow a small leeway.',
    'Mapping on email while the partner lets users change their email → duplicate accounts and lost access.',
    'Unknown user policy set to Allow by accident, silently granting access to anyone in the partner tenant.',
    'Trying to use the partner access token against your own API. Different issuer, different audience — rejected, correctly.',
  ],
};

export const bffExchange = {
  id: 'bff-exchange',
  title: 'BFF exchange — acting for someone else (delegation)',
  category: 'bff',
  level: 'advanced',
  minutes: 10,
  tags: ['exchange', 'delegation', 'actor claim', 'impersonation', 'BFF', 'audit'],
  summary:
    'A support agent needs to see a customer\'s data. Instead of handing out a customer token, the BFF exchanges its session for a narrower token that carries both identities: the customer as subject, the agent as actor.',
  nodes: ['user', 'onegate', 'frontend', 'backend'],
  nodeLabels: {
    frontend: { name: 'Support SPA', sub: 'static files only' },
  },
  initial: {
    onegate: [
      { id: 'at', kind: 'jwt', name: 'Access token (agent)', meta: 'sub = agent · aud=api.support' },
      { id: 'id', kind: 'id', name: 'ID token (agent)' },
    ],
    browser: [{ id: 'bff', kind: 'cookie', name: 'BFF cookie', meta: 'HttpOnly · Secure · SameSite=Lax', cookieName: 'ONEGATE_BFF', cookiePath: '/mg-local/portal/bff' }],
  },
  steps: [
    {
      from: 'user', to: 'frontend', badge: 'click "open customer"',
      detail: 'The agent selects a customer in the support UI. The SPA cannot simply ask the API for that customer: the agent\'s own token is scoped to the agent, not to the customer.',
      tags: ['delegation need'],
    },
    {
      from: 'frontend', to: 'og.bff', badge: 'POST /bff/exchange',
      detail:
        'The SPA calls the BFF exchange endpoint with the CSRF header and a small body: the requested subject, an optional audience, realm and `ext`. It never sends a token — the BFF already knows who is logged in from the cookie.',
      http: {
        req: `POST /mg-local/portal/bff/exchange HTTP/1.1
Host: app.example.com
Cookie: ONEGATE_BFF=sess_4c1f…
X-CSRFTOKEN: 7d1c…

{
  "requested_subject": {
    "subject": "customer-4711",
    "ext": { "reason": "ticket-88213" }
  },
  "audience": "api.customer",
  "realm": "support"
}`,
      },
      tags: ['CSRF header', 'no token from browser'],
    },
    {
      from: 'og.bff', to: 'og.bff', badge: 'authorise delegation',
      detail:
        'Before exchanging anything, OneGate must answer: **is this agent allowed to act for this customer?** That is an authorisation decision, usually backed by an attribute source or a role/entitlement check. Without it, exchange becomes an impersonation API for anyone with a login.',
      channel: 'internal',
      tags: ['entitlement check', 'critical'],
    },
    {
      from: 'og.bff', to: 'og.token', badge: 'BFF exchange',
      detail:
        'The BFF performs an exchange using the token it already holds for the logged-in user. The manual describes the request as `requested_subject` with a `subject` and optional `ext`, plus optional `audience` and `realm`; it does not name the internal endpoint or wire format, so the HTTP below is illustrative.\n\nThe new token is strictly narrower: different subject, one audience, short lifetime.',
      channel: 'back',
      http: {
        req: `POST /mg-local/portal/bff/exchange HTTP/1.1
Host: login.example.com
Cookie: ONEGATE_BFF=sess_4c1f…
X-CSRFTOKEN: 7d1c…

{
  "requested_subject": {
    "subject": "customer-4711",
    "ext": { "reason": "ticket-88213" }
  },
  "audience": "api.customer",
  "realm": "support"
}`,
        res: `HTTP/1.1 200 OK

{ "access_token":"…", "token_type":"Bearer", "expires_in":300 }`,
      },
      tags: ['BFF exchange', 'narrower token'],
    },
    {
      from: 'og.token', to: 'og.bff', badge: 'AT with act claim', channel: 'back',
      detail:
        'The new access token has `sub = customer-4711` and an **`act` (actor) claim** containing the agent\'s `sub` — plus any extra actor claims you configured. Both identities travel together, so the API and the audit log can see who really did it.',
      vault: [
        add('onegate', ITEM.access({
          id: 'at2', name: 'Exchanged access token',
          meta: 'sub=customer · act=agent · aud=api.customer · 5 min',
          claims: { sub: 'customer-4711', aud: 'api.customer', scope: 'customer.read', act: { sub: 'agent-2231', name: 'Roger Lind' } },
        })),
      ],
      tags: ['act claim', 'audit trail'],
    },
    {
      from: 'og.bff', to: 'og.bff', badge: 'PARM{bffN.subject}',
      detail:
        'The session parameter `PARM{bffN.subject}` now holds `customer-4711`, and `ext`, `audience`, `realm` hold the exchanged values. Attribute profiles and downstream rules can react to them — that is how OneGate keeps the "current context" without inventing a second session.',
      channel: 'internal',
      tags: ['session parameters', 'context switch'],
    },
    {
      from: 'og.bff', to: 'frontend', badge: '200 context switched',
      detail: 'The BFF answers the SPA. The browser still has no token — only the same cookie, now pointing at the delegated context.',
      tags: ['still no tokens'],
    },
    {
      from: 'frontend', to: 'user', badge: 'customer view',
      detail: 'The UI now shows the customer. Nothing about the agent\'s original token was exposed, and the delegated token lives server-side.',
    },
    {
      from: 'user', to: 'og.proxy', badge: 'GET /bff/api/customer/4711',
      detail: 'The SPA calls the API through the proxy as usual. OneGate uses the exchanged token for this context, not the agent\'s original one.',
      tags: ['cookie'],
    },
    {
      from: 'og.proxy', to: 'backend', badge: 'Bearer delegated AT',
      detail: 'The API receives a token whose subject is the customer and whose actor is the agent. It can authorise on `sub` and audit on `act`.',
      channel: 'back',
      tags: ['sub = customer', 'act = agent'],
    },
    {
      from: 'backend', to: 'backend', badge: 'authorise + audit',
      detail:
        'The API checks `aud = api.customer`, `scope = customer.read`, and records **both** identities. If the agent later switches to another customer, a new exchange produces a new token — the old one is not reused.',
      channel: 'internal',
      vault: [add('backend', ITEM.claims({ claims: { sub: 'customer-4711', act: { sub: 'agent-2231' }, scope: 'customer.read' } }))],
      tags: ['dual identity audit'],
    },
    {
      from: 'backend', to: 'user', badge: '200 customer data', channel: 'back',
      detail: 'The data is returned. The blast radius of this token is one customer, one audience, a few minutes.',
      tags: ['least privilege'],
    },
    {
      from: 'og.bff', to: 'og.token', badge: 'exchange back',
      detail:
        'When the agent closes the customer view, the SPA calls exchange again for **its own** subject. The **Initial subject / ext / audience / realm** settings define what "back to normal" means, and the **Default exchange** values fill in anything the request omitted.',
      channel: 'back',
      tags: ['restore context', 'defaults'],
    },
  ],
  notes: [
    'Delegation is not impersonation. `sub = customer, act = agent` keeps accountability; a token that just says `sub = customer` destroys the audit trail.',
    'Exchange must be an **authorised** operation. Check entitlements server-side, never trust the `requested_subject` from the SPA alone.',
    'Exchanged tokens should be narrower and shorter-lived than the original. If exchange can widen scope, it is a privilege-escalation feature.',
    '`act` is a nested claim. Decide how downstream APIs read it and log it consistently.',
    'If you do not need delegation, do not enable exchange. Fewer moving parts is a security feature.',
  ],
  config: [
    CFG.bff('portal', [
      '**Initial subject / ext / audience / realm**: the context after a normal login.',
      '**Default exchange ext / audience / realm**: fallbacks when the exchange request omits them.',
      '**Actor claims**: comma-separated claims copied from the original token into `act`, e.g. `name,email,department`.',
      '**CSRF Token header name**: `X-CSRFTOKEN` — exchange is a state-changing call.',
    ]),
    cfg('Authorisation for exchange', [
      'Back the "may this agent act for this customer?" decision with an attribute source or a role check.',
      'Log every exchange: who, for whom, which audience, which reason (`ext`).',
      'Rate-limit exchange. It is a sensitive endpoint.',
    ]),
    cfg('Federation → OpenID Connect → Local Providers → Remote Clients → Access Token JWT', [
      'The exchanged token needs the right `aud` for the target API.',
      'Keep the exchange token lifetime shorter than the session token.',
    ]),
  ],
  pitfalls: [
    'Trusting `requested_subject` without an entitlement check — instant horizontal privilege escalation.',
    'Losing the actor claim, so the audit log says the customer did it.',
    'Returning the exchanged token to the browser "so the SPA can call the API directly". That is the debug endpoint mistake again.',
    'Forgetting to switch back, so the agent keeps browsing as the last customer.',
    'Reusing one exchanged token across customers to "save a round trip".',
  ],
};

export const logout = {
  id: 'logout',
  title: 'Logout — ending the session everywhere',
  category: 'bff',
  level: 'core',
  minutes: 8,
  tags: ['logout', 'revocation', 'back-channel logout', 'SSO', 'session'],
  summary:
    'Login is the easy part. Logout has to clear the BFF session, the OneGate SSO session, and any downstream app session — otherwise the next "login" is silent and the user is back in instantly.',
  nodes: ['user', 'onegate', 'frontend'],
  nodeLabels: { frontend: { name: 'Web app server', sub: 'has its own session' } },
  initial: {
    onegate: [
      { id: 'at', kind: 'jwt', name: 'Access token', meta: 'valid ~12 min' },
      { id: 'rt', kind: 'rt', name: 'Refresh token', meta: 'family #7781' },
    ],
    browser: [
      { id: 'bff', kind: 'cookie', name: 'BFF cookie', meta: 'HttpOnly · Secure · SameSite=Lax', cookieName: 'ONEGATE_BFF', cookiePath: '/mg-local/portal/bff' },
      { id: 'sso', kind: 'cookie', name: 'OneGate SSO cookie', meta: 'HttpOnly · Secure · SameSite=Lax', cookieName: 'ONEGATE_SSO', cookiePath: '/' },
    ],
    frontend: [{ id: 'app', kind: 'session', name: 'App session', meta: 'created from the ID token' }],
  },
  steps: [
    {
      from: 'user', to: 'og.bff', badge: 'POST /bff/logout',
      detail:
        'Logout should be a `POST` with the CSRF header, not a link. A `GET` logout can be triggered by any image tag on any website — a trivial denial-of-service against your users.',
      http: {
        req: `POST /mg-local/portal/bff/logout HTTP/1.1
Host: app.example.com
Cookie: ONEGATE_BFF=sess_4c1f…
X-CSRFTOKEN: 7d1c…`,
      },
      tags: ['POST', 'CSRF'],
    },
    {
      from: 'og.bff', to: 'og.bff', badge: 'destroy session',
      detail:
        'The BFF deletes the server-side session: access token, refresh token, ID token and any cached attributes. The cookie is only a pointer, so deleting the session is what actually ends access.',
      channel: 'internal',
      vault: [del('onegate', 'at'), del('onegate', 'rt')],
      tags: ['server-side delete'],
    },
    {
      from: 'og.bff', to: 'og.token', badge: 'revoke refresh token',
      detail:
        'Deleting your copy of a refresh token is not the same as revoking it. If the provider supports token revocation (RFC 7009), call it so a stolen copy cannot be used later — the Administration Manual does not document a revocation endpoint, so confirm support in your deployment first.\n\nAccess tokens usually cannot be revoked (JWT) — they simply expire; that is the argument for short lifetimes.',
      channel: 'back',
      http: {
        req: `POST /mg-local/portal/revoke HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Authorization: Basic YsZmZi1wb3J0YWw6…

token=rt_9Kd2…&token_type_hint=refresh_token`,
      },
      tags: ['revocation (if supported)', 'refresh token'],
    },
    {
      from: 'og.bff', to: 'user', badge: '302 + clear cookie',
      detail: 'The BFF expires its cookie and redirects to the configured **Logout URL**.',
      http: {
        res: `HTTP/1.1 302 Found
Set-Cookie: ONEGATE_BFF=; Max-Age=0; Path=/mg-local/portal/bff
Location: https://app.example.com/logged-out`,
      },
      vault: [del('browser', 'bff')],
      tags: ['clear cookie'],
    },
    {
      from: 'user', to: 'og.op', badge: 'GET /logout',
      detail:
        'Now the SSO session. If you skip this, the BFF session is gone but the OneGate session is alive — so the next login completes with no password prompt and the user believes logout failed. They are right.',
      tags: ['SSO session'],
    },
    {
      from: 'og.op', to: 'user', badge: 'SSO ended',
      detail: 'OneGate ends the session server-side and expires its cookie. Any other app relying on this SSO session is now logged out at the identity layer.',
      vault: [del('browser', 'sso')],
      tags: ['central logout'],
    },
    {
      from: 'og.op', to: 'frontend', badge: 'back-channel logout',
      detail:
        'Applications that created their own session from the ID token need to be told. **Back-channel logout** posts a signed `logout_token` (a JWT with `events` and `sid`/`sub`) directly server-to-server to the app\'s logout endpoint — no browser involved.\n\nThe Administration Manual does not describe an OIDC back-channel logout endpoint. Treat this as the generic OIDC pattern and verify whether your version supports it.',
      channel: 'back',
      http: {
        req: `POST /backchannel/logout HTTP/1.1
Host: app.example.com
Content-Type: application/x-www-form-urlencoded

logout_token=eyJhbGciOiJSUzI1NiIsImtpZCI6…`,
      },
      tags: ['server-to-server', 'signed event'],
    },
    {
      from: 'frontend', to: 'frontend', badge: 'validate + destroy',
      detail:
        'The app validates the logout token (issuer, audience, signature, `events` claim, `iat`) and then destroys the matching session by `sid` (or all sessions for `sub`). It must never trust an unauthenticated logout request.',
      channel: 'internal',
      vault: [del('frontend', 'app')],
      tags: ['validate signature', 'destroy session'],
    },
    {
      from: 'frontend', to: 'og.op', badge: '200 OK', channel: 'back',
      detail: 'The app confirms. The browser was never involved in this step, so a user who closed the tab is still logged out everywhere.',
      tags: ['browser-independent'],
    },
    {
      from: 'user', to: 'user', badge: 'logged out',
      detail:
        'The full picture: no BFF cookie, no SSO session, no refresh token, no downstream session. Only a JWT access token might still be valid until `exp` — which is why it was short-lived.',
      channel: 'internal',
      tags: ['done'],
    },
  ],
  notes: [
    'There are three sessions to kill: the app session, the BFF/session cookie, and the SSO session. Miss the SSO session and logout looks broken.',
    'Revoke refresh tokens if your deployment supports it; otherwise delete them server-side and keep lifetimes short. Access tokens without revocation support simply expire.',
    'Back-channel logout is for apps that keep their own session. BFF apps are covered by deleting the BFF session.',
    '`SameSite` and `Secure` belong on the logout response too — do not leave a stale cookie behind.',
  ],
  config: [
    CFG.bff('portal', [
      '**Logout URL**: where to send the browser after logout.',
      'Ensure the resource is protected by the BFF so the SSO session is actually involved.',
    ]),
    cfg('Federation → OpenID Connect → Local Providers', [
      'Short access token lifetime is your main "revocation" for JWTs.',
      'The manual documents **Refresh token**, **Update refresh token**, **Reuse detection** and **Issue id token** — use them to control how logout and renewal behave.',
      'Back-channel logout is not documented in the manual; verify support before relying on it.',
    ]),
  ],
  pitfalls: [
    'A `GET /logout` link that any third-party page can trigger.',
    'Clearing the cookie but leaving the server session alive.',
    'Logging out of the app but not the OP, then wondering why re-login is instant.',
    'Not revoking the refresh token, so a copy keeps working after logout.',
    'Back-channel logout endpoint without signature validation — that is an unauthenticated "log everyone out" API.',
  ],
};
