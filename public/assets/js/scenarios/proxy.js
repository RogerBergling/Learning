import { add, del, ITEM, CFG, cfg } from './helpers.js';

export const legacyProxySso = {
  id: 'legacy-proxy-sso',
  title: 'Legacy app behind the proxy — SSO without changing the app',
  category: 'proxy',
  level: 'core',
  minutes: 9,
  summary:
    'The app cannot do OIDC and never will. Point its DNS at OneGate, set the resource\'s SSO configuration to your BFF, and the proxy handles the login and injects a trusted identity. Zero code changes — and one new trust boundary to get right.',
  nodes: ['user', 'onegate', 'frontend', 'backend'],
  nodeLabels: {
    frontend: { name: 'Legacy app', sub: 'no OIDC · trusts proxy headers' },
  },
  steps: [
    {
      from: 'user', to: 'og.proxy', badge: 'GET /app',
      detail: '`app.example.com` resolves to OneGate, not to the legacy server. The user has no session, so OneGate does not forward anything yet.',
      http: { req: 'GET /app HTTP/1.1\nHost: app.example.com\n(no cookie)' },
      tags: ['proxy in front'],
    },
    {
      from: 'og.proxy', to: 'og.proxy', badge: 'resource SSO = BFF',
      detail:
        'The proxy looks up the protected resource and finds its SSO configuration: the **BFF config** for this host. That single setting is what turns an unauthenticated request into a login.',
      channel: 'internal',
      tags: ['resource config', 'SSO = BFF'],
    },
    {
      from: 'og.proxy', to: 'user', badge: '302 /bff/login',
      detail: 'The user is sent to the BFF login endpoint with a `redirect_uri` that returns them to `/app`. The whitelist decides whether that return URL is acceptable.',
      http: {
        res: `HTTP/1.1 302 Found
Location: /mg-local/portal/bff/login?redirect_uri=https%3A%2F%2Fapp.example.com%2Fapp`,
      },
      tags: ['BFF login'],
    },
    {
      from: 'og.bff', to: 'og.rp', badge: 'authorize',
      detail: 'From here it is the standard BFF flow: OneGate as RP talks to its own OP (or a partner IdP), the user logs in once, and the BFF receives tokens server-side.',
      channel: 'internal',
      tags: ['standard BFF'],
    },
    {
      from: 'og.rp', to: 'user', badge: '302 /authorize → login',
      detail: 'The browser is redirected to the OP. If the user already has an OneGate SSO session, this is instant and invisible.',
      tags: ['SSO'],
    },
    {
      from: 'user', to: 'og.bff', badge: 'callback → cookie',
      detail: 'After the callback and the back-channel token exchange, the browser receives only the BFF cookie. Tokens stay in the OneGate session.',
      vault: [add('browser', ITEM.cookie({ meta: 'ONEGATE_BFF · HttpOnly · Secure' })), add('onegate', ITEM.access()), add('onegate', ITEM.id())],
      tags: ['tokens server-side'],
    },
    {
      from: 'user', to: 'og.proxy', badge: 'GET /app + cookie',
      detail: 'The browser follows the redirect back to `/app`. This time the BFF cookie is present.',
      tags: ['cookie'],
    },
    {
      from: 'og.proxy', to: 'og.bff', badge: 'validate session',
      detail:
        'The proxy asks the BFF to validate the cookie and resolve the identity. It also **strips** any inbound `X-Forwarded-User`, `X-Forwarded-Email`, `X-Forwarded-Groups` and `Authorization` headers, because a client could have sent them.',
      channel: 'internal',
      tags: ['strip inbound', 'validate'],
    },
    {
      from: 'og.proxy', to: 'frontend', badge: 'request + identity headers',
      detail:
        'Only now does the request reach the legacy app, carrying the headers the app expects. The app has no idea that OIDC exists: it reads `X-Forwarded-User` and trusts it, because only the proxy can reach it.',
      http: {
        req: `GET /app HTTP/1.1
Host: legacy.internal
X-Forwarded-User: roger.lind
X-Forwarded-Email: roger.lind@example.com
X-Forwarded-Groups: report-reader,finance
X-Forwarded-Host: app.example.com`,
      },
      tags: ['header injection', 'trust boundary'],
    },
    {
      from: 'frontend', to: 'backend', badge: 'app → database',
      detail: 'The legacy app does its normal work: it queries its database using the username the proxy gave it.',
      channel: 'back',
      tags: ['unchanged app'],
    },
    {
      from: 'backend', to: 'frontend', badge: 'rows', channel: 'back',
      detail: 'The data comes back. The app\'s authorisation model is untouched.',
      vault: [add('backend', ITEM.claims({ id: 'legacy', name: 'DB identity', meta: 'username from proxy header' }))],
      tags: ['unchanged'],
    },
    {
      from: 'frontend', to: 'user', badge: '200 app page',
      detail: 'The user sees the legacy app, logged in with SSO. What they never see: a token. What the app never needed: any OIDC code.',
      tags: ['done'],
    },
    {
      from: 'og.proxy', to: 'og.proxy', badge: 'network lockdown',
      detail:
        'The whole design depends on the app being reachable **only** through the proxy. If an attacker can hit `legacy.internal` directly, they can forge `X-Forwarded-User` and become anyone. Firewall the app to the proxy, and authenticate the proxy to the app if possible.',
      channel: 'internal',
      tags: ['critical control'],
    },
    {
      from: 'user', to: 'og.bff', badge: 'logout',
      detail: 'Logout goes through the BFF as usual. The legacy app never had a session to clear — the proxy simply stops forwarding an identity.',
      tags: ['central logout'],
    },
  ],
  notes: [
    'This is the cheapest way to put SSO in front of an app you cannot change. It is also the easiest way to create a header-spoofing hole — do both halves.',
    'Header injection is a trust boundary. Document which headers the app trusts, and strip them at the edge unconditionally.',
    'The BFF config is reused as the resource\'s SSO method. That is why you create the BFF even when the "frontend" is a legacy app rather than a SPA.',
    'If the app supports it, prefer passing a signed token or doing a proper OIDC integration over plain headers.',
  ],
  config: [
    CFG.resourceSSO,
    CFG.bff('portal', [
      '**Limit for domains** must include `app.example.com` — the host the legacy app is published on.',
      '**Client Redirect URIs** must allow the legacy return URL.',
      '**Logout URL** should point at a page the legacy app can render.',
    ]),
    cfg('Network / proxy hygiene', [
      'Expose the legacy app only on the internal network, reachable from OneGate.',
      'Strip `X-Forwarded-*` and `Authorization` from inbound client requests.',
      'Keep the proxy-to-app hop on a trusted network or mTLS.',
      'Log the identity headers you inject, per request, for audit.',
    ]),
  ],
  pitfalls: [
    'The app is directly reachable, so anyone can send `X-Forwarded-User: admin`. This is the single most common SSO proxy vulnerability.',
    'Not stripping inbound identity headers before injecting your own.',
    'The legacy app builds its own session from the header once, then keeps it after logout at the proxy.',
    'Two proxies in a chain, each adding headers — decide which one is authoritative.',
    'Assuming HTTPS to the browser is enough. The proxy-to-app hop matters too.',
  ],
};
