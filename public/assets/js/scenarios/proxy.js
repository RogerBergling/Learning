import { add, del, ITEM, CFG, cfg } from './helpers.js';

export const legacyProxySso = {
  id: 'legacy-proxy-sso',
  title: 'Legacy app behind the proxy — SSO without changing the app',
  category: 'proxy',
  level: 'core',
  minutes: 9,
  summary:
    'The app cannot do OIDC and never will. Publish it as a OneGate Web Resource, protect it with normal OneGate authentication and an Access Control List, and send a configured custom header such as X-USERID. Zero code changes — and one new trust boundary to get right.',
  nodes: ['user', 'onegate', 'frontend', 'backend'],
  nodeLabels: {
    frontend: { name: 'Legacy app', sub: 'no OIDC · trusts X-USERID' },
  },
  steps: [
    {
      from: 'user', to: 'og.proxy', badge: 'GET /app',
      detail: '`app.example.com` resolves to OneGate, not to the legacy server. The Web Resource is configured with **Authentication type = Normal**, so this is ordinary OneGate authentication, not a special BFF mode.',
      http: { req: 'GET /app HTTP/1.1\nHost: app.example.com\n(no session)' },
      tags: ['Web Resource', 'normal auth'],
    },
    {
      from: 'og.proxy', to: 'og.proxy', badge: 'Normal auth + ACL',
      detail:
        'The proxy looks up the **Web Resource** and applies its **Access Control List (ACL)**. The ACL can allow or deny by group, IP address, date/time and authentication method. Because the user has no session, the request is not forwarded yet.',
      channel: 'internal',
      tags: ['ACL', 'authorisation'],
    },
    {
      from: 'og.proxy', to: 'user', badge: '302 login',
      detail: 'The user is sent through normal OneGate authentication. Depending on the deployment this is the local login page or a configured authentication method; the ACL rule that matched decides what is required.\n\nThe manual does not define a fixed login path, and this is **not** an OAuth `/authorize` request with a `client_id`: a Web Resource is not a Remote Client.',
      http: {
        res: `HTTP/1.1 302 Found
Location: https://login.example.com/mg-local/portal/…
  (deployment-specific login endpoint)`,
      },
      tags: ['normal login'],
    },
    {
      from: 'user', to: 'og.proxy', badge: 'login → session',
      detail: 'After authentication OneGate creates its normal session. If the user already has an OneGate SSO session, this step is instant and invisible.',
      vault: [add('onegate', ITEM.session({ meta: 'OneGate session · SSO' }))],
      tags: ['SSO'],
    },
    {
      from: 'og.proxy', to: 'frontend', badge: 'request + X-USERID',
      detail:
        'Only now does the request reach the legacy app. The resource’s **Advanced → Send Custom Headers** setting adds the configured header. In Control Center you enter `USERID`; OneGate adds the `X-` prefix, so the app receives `X-USERID`.\n\nThe manual notes that headers starting with `X` are **never passed from the client**, so a browser cannot inject its own `X-USERID` through OneGate.',
      http: {
        req: `GET /app HTTP/1.1
Host: legacy.internal
X-USERID: roger.lind`,
      },
      tags: ['custom header', 'trust boundary'],
    },
    {
      from: 'frontend', to: 'backend', badge: 'app → database',
      detail: 'The legacy app does its normal work: it queries its database using the username from `X-USERID`.',
      channel: 'back',
      tags: ['unchanged app'],
    },
    {
      from: 'backend', to: 'frontend', badge: 'rows', channel: 'back',
      detail: 'The data comes back. The app’s authorisation model is untouched.',
      vault: [add('backend', ITEM.claims({ id: 'legacy', name: 'DB identity', meta: 'username from X-USERID' }))],
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
        'The whole design depends on the app being reachable **only** through the proxy. If an attacker can hit `legacy.internal` directly, they can forge `X-USERID` and become anyone. Firewall the app to OneGate, and authenticate the proxy-to-app hop if possible.',
      channel: 'internal',
      tags: ['critical control'],
    },
    {
      from: 'user', to: 'og.proxy', badge: 'logout',
      detail: 'Logout clears the OneGate session. The legacy app never had a session of its own — the proxy simply stops forwarding an identity.',
      tags: ['central logout'],
    },
  ],
  notes: [
    'This is the cheapest way to put SSO in front of an app you cannot change. It is also the easiest way to create a header-spoofing hole — do both halves.',
    'The manual’s Web Resource model is plain: **Authentication type = Normal**, an ACL, and optional **Send Custom Headers**. There is no “resource SSO = BFF” setting to select.',
    'Configure the header without the `X-` prefix (`USERID`); OneGate adds `X-`. Header names beginning with `X` are never accepted from clients.',
    'If the app supports it, prefer passing a signed token or doing a proper OIDC integration over plain headers.',
  ],
  config: [
    CFG.webResource,
    cfg('Network / proxy hygiene', [
      'Expose the legacy app only on the internal network, reachable from OneGate.',
      'Keep the proxy-to-app hop on a trusted network or mTLS.',
      'Log the identity header you inject, per request, for audit.',
      'Remember that OneGate already refuses client-supplied `X-…` headers; do not re-enable them at another hop.',
    ]),
  ],
  pitfalls: [
    'The app is directly reachable, so anyone can send `X-USERID: admin`. This is the single most common SSO proxy vulnerability.',
    'Entering `X-USERID` in Control Center. The field expects `USERID`; OneGate adds the `X-`.',
    'Expecting OneGate to invent `X-Forwarded-User`. Only the headers you configure are sent.',
    'The legacy app builds its own session from the header once, then keeps it after logout at the proxy.',
    'Two proxies in a chain, each adding headers — decide which one is authoritative.',
    'Assuming HTTPS to the browser is enough. The proxy-to-app hop matters too.',
  ],
};
