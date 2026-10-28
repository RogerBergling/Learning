import { add, del, ITEM, CFG, cfg } from './helpers.js';

export const fedOidcInbound = {
  id: 'fed-oidc-inbound',
  title: 'Federation in — OneGate as RP for a partner IdP',
  category: 'federation',
  level: 'advanced',
  minutes: 12,
  summary:
    'A partner authenticates their own people. OneGate acts as the Relying Party, validates the partner token, maps the identity to a local user, enriches it from an attribute provider, and lets a legacy app behind the proxy see a trusted identity.',
  nodes: ['user', 'onegate', 'frontend', 'backend', 'idp', 'attr'],
  nodeLabels: {
    frontend: { name: 'Legacy app', sub: 'behind the proxy · no OIDC' },
    idp: { name: 'Partner IdP', sub: 'OIDC provider' },
  },
  steps: [
    {
      from: 'user', to: 'og.proxy', badge: 'GET /reports',
      detail: 'The user opens a protected resource. It has no session, so the proxy does not forward the request — it starts authentication instead.',
      http: { req: 'GET /reports HTTP/1.1\nHost: app.example.com\n(no session cookie)' },
      tags: ['unauthenticated'],
    },
    {
      from: 'og.proxy', to: 'user', badge: '302 RP login',
      detail: 'The resource is protected by an RP Authentication method. OneGate redirects to that RP\'s login path, which starts an OIDC authorization request against the configured remote provider.',
      tags: ['RP auth'],
    },
    {
      from: 'og.rp', to: 'user', badge: '302 partner /authorize',
      detail: 'The browser is sent to the partner with OneGate\'s `client_id`, `state`, `nonce` and PKCE. The user is now in the partner\'s security domain.',
      http: {
        res: `HTTP/1.1 302 Found
Location: https://login.partner.com/authorize?
  client_id=og-federation&response_type=code
  &redirect_uri=https%3A%2F%2Flogin.example.com%2Fmg-local%2Fportal%2Frp%2Fcallback
  &scope=openid%20profile%20email&state=2f91…&nonce=77ab…`,
      },
      tags: ['front channel'],
    },
    {
      from: 'user', to: 'idp', badge: 'partner login',
      detail: 'The partner applies its own policy: password, MFA, device state, conditional access. OneGate cannot see or influence this.',
      vault: [add('idp', ITEM.session({ name: 'Partner session', meta: 'at the partner' }))],
      tags: ['MFA at partner'],
    },
    {
      from: 'idp', to: 'user', badge: '302 ?code',
      detail: 'The partner returns an authorization code that only OneGate can redeem.',
      vault: [add('browser', ITEM.code({ meta: 'issued by the partner' }))],
      tags: ['code'],
    },
    {
      from: 'user', to: 'og.rp', badge: 'GET /rp/callback',
      detail: 'OneGate receives the callback and checks `state` before doing anything else.',
      tags: ['state check'],
    },
    {
      from: 'og.rp', to: 'idp', badge: 'POST /token',
      detail: 'Back channel exchange at the partner: code + verifier + OneGate\'s client credentials. The partner tokens arrive server-to-server and never touch the browser.',
      channel: 'back',
      http: {
        req: `POST /token HTTP/1.1
Host: login.partner.com
Authorization: Basic b2ctZmVkZXJhdGlvbjp…

grant_type=authorization_code&code=…&redirect_uri=…&code_verifier=…`,
        res: `HTTP/1.1 200 OK

{ "access_token":"…", "id_token":"…", "expires_in":3600 }`,
      },
      tags: ['back channel'],
    },
    {
      from: 'idp', to: 'og.rp', badge: 'ID token', channel: 'back',
      detail:
        'OneGate validates the ID token against the partner\'s metadata: signature via `jwks_uri`, `iss` equals the configured issuer, `aud` contains OneGate\'s client ID, `exp`/`iat` within leeway, `nonce` matches the request.',
      vault: [add('onegate', ITEM.id({ name: 'Partner ID token', meta: 'verified against partner JWKS' }))],
      tags: ['signature', 'iss', 'aud', 'nonce'],
    },
    {
      from: 'og.rp', to: 'og.rp', badge: 'map local user',
      detail:
        'The partner `sub` is meaningless to your local user database. The RP configuration decides how to resolve it:\n\n- **Custom User Id attribute** — e.g. `email` or `upn`.\n- **Use `sub` as the username** — only if the partner `sub` is stable and human-usable.\n- **Map to a custom attribute** — persist the partner ID on the local user.\n\nThen **Handle unknown users**: reject, allow, or skip the DB check for JIT provisioning.',
      channel: 'internal',
      tags: ['identity mapping', 'JIT'],
    },
    {
      from: 'og.rp', to: 'og.attr', badge: 'resolve attributes',
      detail:
        'The partner knows who the user is; your attribute provider knows what they may do. OneGate asks the REST / JVAP source for roles, department and entitlements using the local user ID.',
      channel: 'internal',
      tags: ['enrichment'],
    },
    {
      from: 'og.attr', to: 'attr', badge: 'POST user attributes',
      detail:
        'The User Attribute API request carries `realm`, `subject` (`PARM{mguid}`), the `requested_attributes` array, optional `ext`, and an `actor` block when the lookup is delegated. OneGate signs the request if **Include Access Token** is enabled.',
      channel: 'attr',
      http: {
        req: `POST /attribute-api/v1/users HTTP/1.1
Host: attributes.internal
Authorization: Bearer <signed attribute request JWT>

{
  "realm": "corp",
  "subject": "roger.lind",
  "requested_attributes": ["department", "roles", "manager"]
}`,
        res: `HTTP/1.1 200 OK

{ "attributes": {
    "department": "Finance",
    "roles": ["report-reader", "cost-centre-42"],
    "manager": "anna@example.com"
}}`,
      },
      vault: [add('onegate', ITEM.claims({ id: 'attr', name: 'Attributes (cached)', meta: 'department · roles · manager' }))],
      tags: ['realm', 'subject', 'cached'],
    },
    {
      from: 'og.attr', to: 'og.rp', badge: 'PARM{attr-0.*}', channel: 'attr',
      detail:
        'The response is flattened into parameters such as `PARM{attr-0.attributes.department}` and `PARM{attr-0.attributes.roles}`, cached for the configured **Valid time**. Attribute profiles can then map them into claims, headers or authorisation rules.',
      tags: ['flattened keys', 'cache TTL'],
    },
    {
      from: 'og.rp', to: 'og.rp', badge: 'local session',
      detail: 'OneGate now has a local identity: a local username, the partner identity, and the resolved attributes. This is the bridge between the two worlds.',
      channel: 'internal',
      vault: [add('onegate', ITEM.session({ name: 'Local session', meta: 'local user + federated identity' }))],
      tags: ['single local identity'],
    },
    {
      from: 'og.proxy', to: 'frontend', badge: 'GET /reports + headers',
      detail:
        'The proxy forwards the original request to the legacy app with identity headers (or a basic-auth header, depending on the resource\'s SSO config). The app knows nothing about OIDC — it just trusts the proxy.\n\nThis trust boundary is why the proxy must **strip** any inbound copies of those headers.',
      http: {
        req: `GET /reports HTTP/1.1
Host: app.internal
X-Forwarded-User: roger.lind
X-Forwarded-Department: Finance
X-Forwarded-Roles: report-reader,cost-centre-42`,
      },
      tags: ['header injection', 'strip inbound'],
    },
    {
      from: 'frontend', to: 'user', badge: '200 report page',
      detail: 'The legacy app renders the report for a user it never authenticated itself. The user never saw a second login form.',
      tags: ['SSO achieved'],
    },
    {
      from: 'frontend', to: 'backend', badge: 'query data', channel: 'back',
      detail: 'The legacy app talks to its own database or API as usual. Federation changed *who* the user is, not how the app works.',
      tags: ['unchanged app'],
    },
  ],
  notes: [
    'OneGate is doing three jobs at once here: RP (to the partner), attribute client, and proxy. Each is configured separately, which is why the menu has separate sections for them.',
    'The local user is the anchor. Partner identities come and go; your authorisation should not depend on a partner object ID surviving a tenant migration.',
    'Cache attributes with a deliberate TTL. A very short TTL makes the attribute service a bottleneck; a very long one makes role changes slow to apply.',
    'If the partner IdP is down, existing sessions keep working — but new logins fail. Decide whether that is acceptable and monitor it.',
  ],
  config: [
    CFG.rp('partner-oidc'),
    cfg('OpenID Connect → Remote Providers → partner-oidc', [
      '**Use Discovery URL** if the partner supports `/.well-known/openid-configuration`; otherwise paste the metadata manually.',
      'Keep **Skip SSL check** off outside test.',
      'Timeouts: fail fast (2–5 s) rather than hanging user logins.',
    ]),
    cfg('OpenID Connect RP → Authentication → Local user handling', [
      '**Custom User Id attribute** = `email`, or map `sub` to a custom attribute.',
      '**Handle unknown users** = Reject unless JIT provisioning is a deliberate decision.',
      '**Session Properties** to copy partner claims into the session, e.g. `partnerSub = PARM{prop-oidc.realm.userinfo.sub}`.',
    ]),
    CFG.attributeSource('attr-0'),
    cfg('Proxy resource → SSO configuration', [
      'Protect `/reports` with the RP authentication method, and map identity to headers.',
      'Strip inbound `X-Forwarded-*` headers at the edge.',
    ]),
  ],
  pitfalls: [
    '`invalid_state` — the login took longer than the transaction lifetime, or the user opened the login in two tabs.',
    'Matching on email when the partner recycles addresses after someone leaves.',
    'Trusting partner `groups` claims directly for authorisation without mapping them to local roles.',
    'Headers injected by the proxy are also accepted from the internet because nobody stripped them.',
    'Attribute lookups on every request because the cache TTL is 0.',
  ],
};

const SAML_IDP_ASSERTION = `<?xml version="1.0"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  ID="_r3f9" Version="2.0" IssueInstant="2026-10-28T21:14:03Z"
  Destination="https://partner.example.com/acs">
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
    https://login.example.com/mg-local/portal/saml
  </saml:Issuer>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="_a77c" Version="2.0" IssueInstant="2026-10-28T21:14:03Z">
    <saml:Issuer>https://login.example.com/mg-local/portal/saml</saml:Issuer>
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">…</ds:Signature>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">
        a1b2c3d4-7f31-4a1e-9d2c-55e0f1a2b3c4
      </saml:NameID>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-10-28T21:13:03Z"
      NotOnOrAfter="2026-10-28T21:19:03Z">
      <saml:AudienceRestriction>
        <saml:Audience>https://partner.example.com/saml</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="2026-10-28T21:14:03Z"
      SessionIndex="_s-9912">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>
          urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport
        </saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="urn:oid:2.5.4.42">
        <saml:AttributeValue>Roger</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="urn:oid:2.5.4.4">
        <saml:AttributeValue>Lind</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="department">
        <saml:AttributeValue>Finance</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

export const fedSamlIdp = {
  id: 'fed-saml-idp',
  title: 'Federation out — OneGate as SAML IdP',
  category: 'saml',
  level: 'advanced',
  minutes: 11,
  summary:
    'A partner application speaks SAML, not OIDC. OneGate authenticates the user — locally or through any configured federation — and issues a signed SAML assertion to the partner SP. Same identity, different envelope.',
  nodes: ['user', 'onegate', 'sp'],
  nodeLabels: { sp: { name: 'Partner app (SP)', sub: 'SAML service provider' } },
  steps: [
    {
      from: 'user', to: 'sp', badge: 'GET /dashboard',
      detail: 'The user opens the partner application. The SP has no session for this browser, so it starts SAML SSO.',
      tags: ['SP session missing'],
    },
    {
      from: 'sp', to: 'user', badge: '302 + SAMLRequest',
      detail:
        'The SP redirects to OneGate\'s SAML IdP endpoint with a deflated, base64-encoded `AuthnRequest`, plus `RelayState` (the URL to return to). The request names the SP\'s entity ID, the ACS URL and the requested NameID format.',
      http: {
        res: `HTTP/1.1 302 Found
Location: https://login.example.com/mg-local/portal/saml/sso?
  SAMLRequest=fZJNT8MwDIbv%2BxVR7m3a0g9K02pDgyG…
  &RelayState=https%3A%2F%2Fpartner.example.com%2Fdashboard`,
      },
      tags: ['AuthnRequest', 'RelayState'],
    },
    {
      from: 'user', to: 'og.op', badge: 'SAML SSO endpoint',
      detail: 'OneGate looks up the SP by entity ID in **SAML IDP → Remote SPs** (or a remote SP group) and validates the ACS URL against the registered metadata. An unknown SP is refused — otherwise you are an open redirect with assertions.',
      tags: ['SP lookup', 'ACS validation'],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'who is the user?',
      detail:
        'Authentication is independent of SAML. OneGate can use a local login, an OIDC federation, or an upstream SAML IdP. The SP never needs to know which — that is the value of a hub.',
      channel: 'internal',
      tags: ['authn decoupled'],
    },
    {
      from: 'og.op', to: 'user', badge: 'login / SSO',
      detail: 'If an SSO session exists, no prompt. Otherwise the user authenticates once at OneGate.',
      vault: [add('onegate', ITEM.session({ name: 'OneGate SSO session', meta: 'free choice of upstream method' }))],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'build assertion',
      detail:
        'OneGate builds the assertion from an **Attribute Profile**: NameID (persistent, transient, email or unspecified), attributes such as `givenName`, `surname`, `department`, and the `AuthnContext` class. **IDP AuthnContext mapping** translates the actual method into the value the SP expects.',
      channel: 'internal',
      tags: ['attribute profile', 'NameID', 'AuthnContext'],
    },
    {
      from: 'og.op', to: 'user', badge: 'auto-post SAMLResponse',
      detail:
        'The response is signed with the IdP\'s private key — the assertion, the response, or both, depending on what the SP requires. The browser receives a self-submitting HTML form: browsers do not send POSTs on their own, so the form is the transport.',
      http: {
        res: `HTTP/1.1 200 OK
Content-Type: text/html

<form method="post" action="https://partner.example.com/acs">
  <input type="hidden" name="SAMLResponse" value="PHNhbWxwOlJlc3BvbnNl…">
  <input type="hidden" name="RelayState" value="https://partner.example.com/dashboard">
</form>
<script>document.forms[0].submit()</script>`,
      },
      vault: [add('browser', ITEM.saml({ value: SAML_IDP_ASSERTION })), add('onegate', ITEM.jwk({ id: 'idpkey', name: 'IdP signing key', meta: 'published in SAML metadata' }))],
      tags: ['signed XML', 'auto-post'],
    },
    {
      from: 'user', to: 'sp', badge: 'POST ACS',
      detail: 'The browser posts the response to the SP\'s Assertion Consumer Service. From the SP\'s point of view, this is the login.',
      tags: ['ACS'],
    },
    {
      from: 'sp', to: 'sp', badge: 'validate assertion',
      detail:
        'The SP validates the XML signature against OneGate\'s published certificate, checks `Audience` = its own entity ID, `NotBefore`/`NotOnOrAfter`, `Destination` = its ACS, `InResponseTo` (if it tracks requests), and that the assertion ID has not been replayed. Then it creates a session.',
      channel: 'internal',
      tags: ['signature', 'audience', 'conditions', 'replay'],
    },
    {
      from: 'sp', to: 'user', badge: '302 /dashboard',
      detail: 'The SP sets its own session cookie and lets the user in. OneGate\'s job is done; it is not in the request path any more.',
      tags: ['SP session'],
    },
    {
      from: 'user', to: 'sp', badge: '200 dashboard',
      detail: 'The user works in the partner app. Note where the identity lives now: in the SP\'s session. OneGate will not see these requests.',
      tags: ['done'],
    },
  ],
  notes: [
    'Metadata exchange is the contract: OneGate needs the SP\'s entity ID and ACS URL; the SP needs OneGate\'s entity ID, SSO URL and signing certificate. **Metadata Providers** can automate the refresh.',
    'SAML assertions are bearer assertions with a validity window. Keep it short (minutes) and protect the clocks.',
    'Sign the assertion, not just the response (or both), unless the SP explicitly requires otherwise. Unsigned assertions are a classic vulnerability.',
    'NameID format matters. `persistent` gives a stable opaque ID; `email` is readable but changes; `transient` breaks account linking.',
    'When users arrive from a partner, decide whether to include an attribute that identifies the upstream IdP. It is invaluable in audits.',
  ],
  config: [
    cfg('SAML IDP → Local Identity Providers', [
      'Entity ID, SSO endpoint and signing certificate (published in metadata).',
      '**Active local IDPs**: which IdPs are enabled, and on which virtual hosts.',
      '**Remote SPs**: entity ID, ACS URL, NameID format, signing requirements, attribute release.',
      '**Remote SP groups**: share one policy across many SPs.',
    ]),
    cfg('Federation Settings → Attribute Profiles', [
      'Map local attributes to SAML attributes: `givenName`, `surname`, `department`, `role`.',
      'OID names (`urn:oid:2.5.4.42`) are still common in enterprise SPs — the profile is where you translate.',
    ]),
    cfg('SAML IDP → IDP AuthnContext → AuthnContext mapping', [
      'Translate real authentication strength (password, MFA, certificate) into the class the SP requires.',
      'A mismatch here is a common cause of "login works at the IdP but the SP rejects the assertion".',
    ]),
    cfg('Federation Settings → Metadata Providers', [
      'Pull SP metadata on a schedule instead of pasting XML by hand.',
      'Certificate rollover is the usual breakage: keep old and new certificates published during the overlap.',
    ]),
  ],
  pitfalls: [
    'Clock skew beyond the assertion validity window → "assertion expired" at the SP.',
    'Audience mismatch: the SP checks that its own entity ID is in `Audience`.',
    'The SP validates the response signature but not the assertion signature (or vice versa) — decide and document.',
    'Replay: the same assertion posted twice. Keep an assertion-ID cache for at least the validity window.',
    'ACS URL changed at the SP but not in OneGate → the auto-post goes to the wrong place.',
    'NameID set to `transient` for an app that needs stable accounts.',
  ],
};

const SAML_SP_RESPONSE = `<?xml version="1.0"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  ID="_p991" Version="2.0" IssueInstant="2026-10-28T21:20:11Z"
  Destination="https://login.example.com/mg-local/portal/saml/acs"
  InResponseTo="_og-4421">
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
    https://idp.partner.com/saml
  </saml:Issuer>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="_a118" Version="2.0" IssueInstant="2026-10-28T21:20:11Z">
    <saml:Issuer>https://idp.partner.com/saml</saml:Issuer>
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">…</ds:Signature>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
        anna@partner.com
      </saml:NameID>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-10-28T21:19:41Z"
      NotOnOrAfter="2026-10-28T21:25:41Z">
      <saml:AudienceRestriction>
        <saml:Audience>https://login.example.com/saml/sp</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AttributeStatement>
      <saml:Attribute Name="mail">
        <saml:AttributeValue>anna@partner.com</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="groups">
        <saml:AttributeValue>partner-readers</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

export const fedSamlSp = {
  id: 'fed-saml-sp',
  title: 'Federation in — OneGate as SAML SP',
  category: 'saml',
  level: 'advanced',
  minutes: 10,
  summary:
    'The partner IdP initiates SSO and posts a signed assertion to OneGate. OneGate validates it, links the identity to a local user, and creates the local session that the proxied apps rely on.',
  nodes: ['user', 'onegate', 'frontend', 'idp'],
  nodeLabels: {
    frontend: { name: 'Protected app', sub: 'behind the proxy' },
    idp: { name: 'Partner IdP', sub: 'SAML 2.0 IdP' },
  },
  steps: [
    {
      from: 'user', to: 'idp', badge: 'partner portal',
      detail: 'The user is already working in the partner portal. They click a tile for your application. This is **IdP-initiated** SSO: there is no `AuthnRequest` from OneGate.',
      vault: [add('idp', ITEM.session({ name: 'Partner session', meta: 'IdP-initiated' }))],
      tags: ['IdP-initiated'],
    },
    {
      from: 'idp', to: 'idp', badge: 'build assertion',
      detail: 'The partner creates an assertion for the user with `Audience` = OneGate\'s SP entity ID, a NameID, attributes and a short validity window, then signs it.',
      channel: 'internal',
      tags: ['assertion'],
    },
    {
      from: 'idp', to: 'user', badge: 'auto-post SAMLResponse',
      detail: 'The browser receives an auto-submitting form targeting OneGate\'s ACS endpoint.',
      tags: ['auto-post'],
    },
    {
      from: 'user', to: 'og.rp', badge: 'POST /saml/acs',
      detail: 'OneGate receives the response at its Assertion Consumer Service. `RelayState` (if present) says where to go next.',
      http: {
        req: `POST /mg-local/portal/saml/acs HTTP/1.1
Content-Type: application/x-www-form-urlencoded

SAMLResponse=PHNhbWxwOlJlc3BvbnNl…&RelayState=%2Freports`,
      },
      vault: [add('browser', ITEM.saml({ value: SAML_SP_RESPONSE, name: 'Inbound SAML assertion' }))],
      tags: ['ACS'],
    },
    {
      from: 'og.rp', to: 'og.rp', badge: 'validate',
      detail:
        'Validation is non-negotiable: XML signature against the IdP certificate from metadata, `Audience` equals OneGate\'s entity ID, `Destination` equals the ACS URL, `NotBefore`/`NotOnOrAfter` with clock leeway, and `InResponseTo` if OneGate started the flow.\n\nAlso check the assertion ID against a replay cache.',
      channel: 'internal',
      tags: ['signature', 'audience', 'conditions', 'replay'],
    },
    {
      from: 'og.rp', to: 'og.rp', badge: 'map attributes',
      detail:
        'The NameID and attributes are translated by the **Method mapping** and attribute profile: which attribute is the local username, which become session properties, which are only informational. Unknown users follow the same reject/allow/JIT policy as OIDC.',
      channel: 'internal',
      tags: ['method mapping', 'local user'],
    },
    {
      from: 'og.rp', to: 'og.attr', badge: 'optional enrichment',
      detail: 'If the assertion does not contain what your apps need (roles, cost centre), OneGate can enrich from a REST / JVAP attribute source before creating the session.',
      channel: 'internal',
      tags: ['optional'],
    },
    {
      from: 'og.rp', to: 'user', badge: 'Set-Cookie + 302',
      detail: 'The local session exists. OneGate sets its session cookie and redirects to the requested resource (or a default page for IdP-initiated logins with no target).',
      vault: [add('browser', ITEM.cookie({ id: 'sso', name: 'OneGate session cookie', meta: 'HttpOnly · Secure' })), del('browser', 'code')],
      tags: ['local session'],
    },
    {
      from: 'user', to: 'og.proxy', badge: 'GET /reports',
      detail: 'The browser follows the redirect with the new cookie. The proxy finds a valid session and forwards the request.',
      tags: ['session'],
    },
    {
      from: 'og.proxy', to: 'frontend', badge: 'request + identity',
      detail: 'The app receives the identity the proxy injects. It never sees SAML, certificates or assertions — the protocol complexity stops at OneGate.',
      channel: 'back',
      tags: ['header injection'],
    },
    {
      from: 'frontend', to: 'user', badge: '200 page',
      detail: 'The user is inside the app, having authenticated only at the partner. Again: the local user is the anchor, and the partner identity is an attribute of it.',
      tags: ['done'],
    },
  ],
  notes: [
    'IdP-initiated SSO has no `InResponseTo` to check, which makes replay protection and audience checks even more important.',
    'Always keep the IdP signing certificate current. An expired certificate is the number one SAML outage cause.',
    'Map NameID to a stable local attribute. Emails change; opaque IDs do not.',
    'OneGate can be SP and IdP at the same time for different partners — that is the hub pattern, and each side has its own metadata.',
  ],
  config: [
    cfg('SAML SP → Local Service Providers', [
      'SP entity ID, ACS URL and the endpoints published in OneGate\'s SP metadata.',
      '**Remote IDPs**: the partner IdP\'s entity ID and signing certificate.',
      '**Active remote IDPs**: enable the ones you trust, per virtual host.',
      'NameID format and attribute mapping to local user attributes.',
    ]),
    cfg('SAML SP → Method mapping', [
      'Map assertion attributes to local parameters (username, email, groups).',
      'Decide what happens when a mapped attribute is missing — fail closed.',
    ]),
    cfg('Federation Settings → Metadata Providers', [
      'Fetch the partner metadata and rotate certificates automatically where possible.',
      'Keep the previous certificate during rollover.',
    ]),
  ],
  pitfalls: [
    'Accepting an unsigned assertion because "the network is internal".',
    'Not checking `Audience`, so an assertion for another SP is accepted.',
    'No replay cache: the same assertion can be re-posted until it expires.',
    'NameID mapped to email, then the partner changes the email → duplicate account.',
    'Certificate rollover handled manually and forgotten → total login outage.',
  ],
};
