import { add, del, ITEM, CFG, cfg } from './helpers.js';

export const controlCenterSetup = {
  id: 'control-center-setup',
  title: 'Control Center setup — every object, in the right order',
  category: 'setup',
  level: 'core',
  minutes: 14,
  summary:
    'A guided walk through the Administration Manual’s Control Center: pick the virtual host, create the Local Provider and Remote Client, configure the RP and BFF, protect a Web Resource with an ACL and custom header, then press Activate Changes. This is the configuration map the other scenarios assume.',
  nodes: ['user', 'onegate', 'frontend', 'backend'],
  nodeLabels: {
    frontend: { name: 'Protected app', sub: 'Web Resource · trusts X-USERID' },
  },
  steps: [
    {
      from: 'user', to: 'onegate', badge: 'open Control Center',
      detail:
        'The administrator opens the web-based Control Center. The first decision is the **Virtual Host Selector** at the top left, which selects which virtual host is being configured. It only appears once one or more virtual hosts exist.',
      tags: ['Control Center', 'virtual host'],
    },
    {
      from: 'onegate', to: 'onegate', badge: 'note the sections',
      detail:
        'The manual’s menu is the map of the product: **Monitoring**, **Administration**, **Server Settings**, **Authentication**, **Federation**, **Maintenance** and **Virtual Host Selector**. Almost every setting in this lab lives under Federation → OpenID Connect or Administration → User Services.',
      channel: 'internal',
      tags: ['menu map'],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'Local Provider',
      detail:
        'Under **Federation → OpenID Connect → Local Providers**, create the OP: Description, Virtual Host Domain and a unique **Realm**. The Discovery URL appears after creation. The metadata values (`issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`) are generated for you.',
      channel: 'internal',
      tags: ['Local Providers', 'realm'],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'tokens + refresh',
      detail:
        'In **Provider Settings** choose **Access Token Type** (`opaque` or `jwt`) and the **Access Token Lifetime** / **ID Token Lifetime**. The **Refresh token** section adds lifetime, total lifetime, max idle, **Update refresh token**, **Reuse detection**, **Reuse grace period** and **Issue id token**.',
      channel: 'internal',
      tags: ['Provider Settings', 'refresh'],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'keys',
      detail:
        '**Key Settings** controls the published JWKS: RSA 2048/3072/4096, an optional external x5c certificate, self-signed x5c options, and the `x5t` / `x5t#S256` thumbprints. OneGate can also generate EdDSA, EC and encryption keys; the manual provides switches to disable each for clients that do not support them.',
      channel: 'internal',
      tags: ['Key Settings', 'JWKS'],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'Realm Settings',
      detail:
        '**Realm Settings** binds the provider to a virtual host and selects the **Default Attribute Profile**, **Access Token Attribute Profile** and **ID Token Attribute Profile**. This is where `PARM{...}` values become claims; a claim that is not mapped returns nothing.',
      channel: 'internal',
      tags: ['Realm Settings', 'attribute profile'],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'Remote Client',
      detail:
        'Create a **Remote Client** per application: comma-separated `redirect_uris`, allowed `scope`, `response_types = code`, `grant_types = authorization_code`, `client_id` / `client_secret`, signing algorithms, and optional **Local properties for claims** exposed as `PARM{oidcclient.NAME}`.',
      channel: 'internal',
      tags: ['Remote Clients', 'redirect whitelist'],
    },
    {
      from: 'og.rp', to: 'og.rp', badge: 'Remote Provider + RP',
      detail:
        'For federation, create a **Remote Provider** (Discovery URL or manual metadata) and an **RP Authentication** entry that points at it. Then set **scope**, **response_types**, **token_endpoint_auth_method**, **client_id** / **client_secret**, **Local user handling** and **Session Properties**.',
      channel: 'internal',
      tags: ['Remote Providers', 'RP Authentication'],
    },
    {
      from: 'og.bff', to: 'og.bff', badge: 'Backend For Frontend',
      detail:
        'Create the **Backend For Frontend** config: Realm, **Limit for domains**, **RP Authentication**, **Local Provider**, **Remote Client**, **Client Redirect URIs** (prefix match), **Logout URL** and **CSRF Token header name**. Leave **Authenticate users from tokens** off when the RP points at the same OneGate; turn it on for a third-party OP.',
      channel: 'internal',
      tags: ['BFF', 'prefix whitelist'],
    },
    {
      from: 'og.proxy', to: 'og.proxy', badge: 'Web Resource + ACL',
      detail:
        'Publish the application under **Administration → User Services → Web Resource**. Protect it with normal authentication and an **Access Control List (ACL)** based on group, IP address, date/time and authentication method. In **Advanced → Send Custom Headers**, enter `USERID` (OneGate adds `X-`) so the app receives `X-USERID`.',
      channel: 'internal',
      tags: ['Web Resource', 'ACL', 'custom headers'],
    },
    {
      from: 'og.attr', to: 'attr', badge: 'attribute source',
      detail:
        'If claims need data outside the user store, add an **Attribute Source** (LDAP, REST or Graph). Use the REST request fields `realm`, `subject`, `actor` (`{ "subject": "..." }`), `requested_attributes` and optional `ext`; enable **Include Access Token** to send a JWT with `iss`, `aud` and `sub`.',
      channel: 'attr',
      http: {
        req: `POST /attribute-api/v1/users HTTP/1.1
Host: attributes.internal
Authorization: Bearer <access token from Include Access Token>

{
  "realm": "corp",
  "subject": "roger.lind",
  "requested_attributes": ["department", "roles"]
}`,
      },
      vault: [add('onegate', ITEM.claims({ id: 'attr', name: 'Attribute source config', meta: 'REST · subject · requested_attributes' }))],
      tags: ['Attribute Sources', 'User Attribute API'],
    },
    {
      from: 'onegate', to: 'onegate', badge: 'Activate Changes',
      detail:
        'Nothing takes effect until **Maintenance → Activate Changes**. **Reload configuration** activates changes without logging users out; **Reindex files** is required after changing files under `server/` or the Cache Control of `mg-local`; **Restart service** is the heavy option.',
      channel: 'internal',
      tags: ['Activate Changes', 'reload'],
    },
    {
      from: 'user', to: 'og.proxy', badge: 'test the login',
      detail:
        'Now test it end to end: unauthenticated request → OneGate login → ACL check. If the app is a **Web Resource**, OneGate creates a normal session and the next step applies. If it is protected by the **BFF**, the browser gets the BFF cookie instead and the app calls the API through the proxy.',
      vault: [
        add('onegate', ITEM.session({ meta: 'normal OneGate session' })),
        add('browser', ITEM.cookie({ id: 'sess', name: 'Session cookie', cookieName: 'ONEGATE_SESSION', cookiePath: '/', meta: 'HttpOnly · Secure · SameSite=Lax' })),
      ],
      tags: ['end-to-end test'],
    },
    {
      from: 'og.proxy', to: 'frontend', badge: 'request + X-USERID',
      detail:
        'For the **Web Resource** path, the protected app receives the request with the header you configured. Because headers starting with `X` are never passed from clients, an inbound `X-USERID` from the browser cannot override it.',
      http: {
        req: `GET /app HTTP/1.1
Host: legacy.internal
X-USERID: roger.lind`,
      },
      tags: ['custom header', 'trust boundary'],
    },
    {
      from: 'frontend', to: 'user', badge: '200 app page',
      detail:
        'The user is inside the app with a single sign-on session. The whole chain — Local Provider, Remote Client, RP, BFF, Web Resource, ACL, attribute source and Activate Changes — is now configured in the places the manual describes.',
      tags: ['done'],
    },
  ],
  notes: [
    'The Virtual Host Selector is the most common “my change did nothing” cause: you configured a different virtual host than the one serving the request.',
    'Most changes do not apply until **Activate Changes → Reload configuration**. File changes additionally need **Reindex files**.',
    'The manual uses **Attribute Sources**, not “JVAP”. The REST/Graph/LDAP source is configured once and referenced as `PARM{attr-ID.NAME}`.',
    '**Authenticate users from tokens** is the one BFF switch people get backwards: on for third-party OPs, off when OneGate is its own OP.',
  ],
  config: [
    cfg('1 · Control Center and virtual hosts', [
      'Use the **Virtual Host Selector** before changing anything — settings are per virtual host.',
      'Monitoring gives status, sessions, logs, statistics and reports for the selected host.',
      'Maintenance → **Activate Changes** is the final step of every configuration change.',
    ]),
    CFG.localProvider('portal'),
    CFG.remoteClient('portal-web'),
    CFG.rp('partner-oidc'),
    CFG.bff('portal'),
    CFG.webResource,
    CFG.attributeSource('0'),
  ],
  pitfalls: [
    'Configuring the wrong virtual host, then wondering why the endpoint still behaves the old way.',
    'Forgetting **Activate Changes**, so the saved configuration is not loaded.',
    'Adding a claim to a scope but never mapping it in the attribute profile — it silently returns nothing.',
    'Using a wildcard in `redirect_uris` when an exact URI would do. The manual calls the whitelist a crucial security feature.',
    'Turning on **Authenticate users from tokens** for a same-OneGate BFF, or leaving it off for a partner IdP.',
    'Entering `X-USERID` in **Send Custom Headers** instead of `USERID`.',
  ],
};
