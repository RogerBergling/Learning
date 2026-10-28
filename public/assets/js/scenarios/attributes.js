import { add, del, ITEM, CFG, cfg } from './helpers.js';

export const attrRest = {
  id: 'attr-rest',
  title: 'Attribute provider — enriching a token with JVAP / REST data',
  category: 'attributes',
  level: 'core',
  minutes: 10,
  summary:
    'The user store knows who someone is; the attribute service knows what they may do. During token issuance OneGate calls the REST / JVAP attribute API, caches the answer, and maps it into claims through the attribute profile.',
  nodes: ['user', 'onegate', 'frontend', 'backend', 'attr'],
  nodeLabels: {
    frontend: { name: 'Web app server', sub: 'confidential client' },
    attr: { name: 'Attribute service', sub: 'User Attribute API (REST / JVAP)' },
  },
  steps: [
    {
      from: 'user', to: 'og.op', badge: 'GET /authorize',
      detail: 'A normal code flow starts. The client requests a scope that needs claims the local user store does not contain — here `department` and `roles`.',
      http: {
        req: `GET /mg-local/portal/authorize?
  response_type=code&client_id=portal-web
  &scope=openid%20profile%20department%20roles
  &redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
  &state=8f2c1d…&nonce=3b91ae… HTTP/1.1`,
      },
      tags: ['custom scope', 'claims needed'],
    },
    {
      from: 'og.op', to: 'user', badge: 'login',
      detail: 'The user authenticates at OneGate. The local user record gives OneGate a stable subject (`mguid`) — that is the key it will use with the attribute service.',
      vault: [add('onegate', ITEM.session({ name: 'OneGate SSO session', meta: 'local subject = mguid' }))],
    },
    {
      from: 'og.op', to: 'og.attr', badge: 'need attributes',
      detail:
        'When the token is built, the attribute profile references `PARM{attr-0.…}`. OneGate\'s attribute client checks its session cache first: are these attributes still inside the configured **Valid time**? On a miss it calls the attribute source.',
      channel: 'internal',
      tags: ['profile needs PARM', 'cache check'],
    },
    {
      from: 'og.attr', to: 'attr', badge: 'POST /attributes',
      detail:
        'The REST call carries exactly the context the API needs: `realm` (which user population), `subject` (`PARM{mguid}`), the `requested_attributes` list, optional `ext`, and — if configured — an `actor` block for delegated lookups.\n\nWhen **Include Access Token** is enabled, the call is signed with a JWT so the attribute service can verify that the request really comes from OneGate.',
      channel: 'attr',
      http: {
        req: `POST /attribute-api/v1/users HTTP/1.1
Host: attributes.internal
Authorization: Bearer <signed attribute-request JWT>
Content-Type: application/json

{
  "realm": "corp",
  "subject": "roger.lind",
  "requested_attributes": ["department", "roles", "costCentre"]
}`,
        res: `HTTP/1.1 200 OK
Content-Type: application/json

{
  "attributes": {
    "department": "Finance",
    "roles": ["report-reader", "cost-centre-42"],
    "costCentre": "CC-4711",
    "mail": ["roger.lind@example.com"]
  }
}`,
      },
      tags: ['realm', 'subject', 'requested_attributes', 'signed request'],
    },
    {
      from: 'attr', to: 'og.attr', badge: 'JSON attributes', channel: 'attr',
      detail:
        'The response is flattened by key path. Every leaf becomes a parameter: `PARM{attr-0.attributes.department}`, `PARM{attr-0.attributes.roles}`, and so on. Arrays stay arrays.',
      tags: ['flattened keys'],
    },
    {
      from: 'og.attr', to: 'og.attr', badge: 'JsonPath + cache',
      detail:
        'If the JSON is nested, **JsonPath** extracts what you need and gives it a friendly name — e.g. `$.customers[?(@.active==true)].cust_no` becomes `PARM{attr-0.activeCustomers}`.\n\nThe whole result is cached in the local session for **Valid time** (seconds). Too short and you hammer the attribute service on every request; too long and a revoked role keeps working.',
      channel: 'internal',
      vault: [add('onegate', ITEM.claims({ id: 'attr', name: 'Attribute cache', meta: 'department · roles · costCentre (TTL 300 s)' }))],
      tags: ['JsonPath', 'TTL'],
    },
    {
      from: 'og.op', to: 'og.op', badge: 'map into claims',
      detail:
        'The **Attribute Profile** turns parameters into claims. A typical scope profile:\n\n```\nbirthdate: function:substring(PARM{certuserid},0,8)\ngiven_name: PARM{givenname}\nfamily_name: PARM{surname}\nname: PARM{givenname} PARM{surname}\ndepartment: PARM{attr-0.attributes.department}\nroles: PARM{attr-0.attributes.roles}\n```\n\nOnly claims in the client\'s allowed scope are released.',
      channel: 'internal',
      tags: ['attribute profile', 'PARM'],
    },
    {
      from: 'og.op', to: 'user', badge: '302 ?code',
      detail: 'The code is issued as usual. Nothing about the attribute lookup is visible to the browser.',
      vault: [add('browser', ITEM.code())],
    },
    {
      from: 'user', to: 'og.token', badge: 'POST /token',
      detail: 'The web app exchanges the code over the back channel with its client credentials. OneGate now builds the ID token and access token from the resolved attributes.',
      channel: 'back',
      tags: ['back channel'],
    },
    {
      from: 'og.token', to: 'user', badge: 'tokens with claims', channel: 'back',
      detail:
        'The ID token (and, if configured, the JWT access token) contains the enriched claims. The `department` is no longer something the app has to fetch — it is part of the identity it received.',
      vault: [
        add('browser', ITEM.id({ claims: { department: 'Finance', roles: ['report-reader', 'cost-centre-42'], costCentre: 'CC-4711' } })),
        del('browser', 'code'),
      ],
      tags: ['claims in token'],
    },
    {
      from: 'user', to: 'backend', badge: 'GET /api/reports Bearer',
      detail: 'The app calls the API with the enriched access token.',
      tags: ['bearer'],
    },
    {
      from: 'backend', to: 'backend', badge: 'authorise on claims',
      detail: 'The API authorises on `roles` and `costCentre` directly from the verified token. It does not call the attribute service — that would make every API request depend on it.',
      channel: 'internal',
      vault: [add('backend', ITEM.claims({ claims: { department: 'Finance', roles: ['report-reader'], costCentre: 'CC-4711' } }))],
      tags: ['no extra dependency'],
    },
    {
      from: 'backend', to: 'user', badge: '200 filtered report', channel: 'back',
      detail: 'The report is filtered by cost centre — authorisation data that never existed in the local user store.',
      tags: ['done'],
    },
    {
      from: 'og.attr', to: 'og.attr', badge: 'cache expires',
      detail:
        'When the cache entry expires, the next token issuance calls the attribute service again. That is the trade-off you are choosing: freshness of entitlements versus load on the attribute service. Make it a deliberate number, not a default.',
      channel: 'internal',
      tags: ['freshness vs load'],
    },
  ],
  notes: [
    'Attributes can end up in three places: the ID token (identity for the app), the JWT access token (authorisation for APIs), or headers (legacy apps). Decide per claim; putting everything everywhere is a data-leak habit.',
    '`PARM{attr-X.KEY}` is the flattened path; `PARM{attr-X.ATTRNAME}` is the name you gave a JsonPath attribute. Know which one you configured.',
    'The attribute request is a server-to-server call with a user subject in it. Sign it (Include Access Token) so the attribute service can trust the caller.',
    'Never let the client choose which attributes are fetched for it. The attribute profile and allowed scopes decide.',
    'A slow attribute service becomes a slow login. Set connect/read timeouts and decide whether to fail closed or continue without the claims.',
  ],
  config: [
    CFG.attributeSource('attr-0'),
    cfg('Attribute source → Attributes', [
      'Add `department`, `roles`, `costCentre` by remote name.',
      'For complex JSON, add a JsonPath attribute with a friendly name and reference it as `PARM{attr-0.<name>}`.',
      '**Valid time** = cache TTL in the local session. Start around 300 s and tune.',
    ]),
    cfg('Local Provider → Realm Settings → Default Attribute Profile', [
      'Map the new parameters into claims: `department: PARM{attr-0.attributes.department}`.',
      'Add the claims to a custom scope, e.g. `department`, and allow that scope on the remote client.',
      'Use the **Access Token Attribute Profile** only for claims the APIs actually need.',
    ]),
    cfg('Remote Client → scope', [
      'Add the custom scope so clients can request it.',
      'Remember: a claim that is not mapped in the profile returns nothing — mapping and scope are two separate switches.',
    ]),
  ],
  pitfalls: [
    'The claim is empty: either the scope is not allowed, or the attribute is not mapped in the profile, or the key path is wrong. Check all three.',
    'Using `PARM{attr-0.department}` when the response nests it under `attributes` — the key is `PARM{attr-0.attributes.department}`.',
    'A cache TTL of 0, turning every login into a burst of attribute calls.',
    'Putting HR data in an access token that is readable by every API in the audience.',
    'No timeout on the attribute call, so a stuck service blocks all logins.',
  ],
};

export const attrDelegation = {
  id: 'attr-delegation',
  title: 'Delegated attributes — the actor parameter',
  category: 'attributes',
  level: 'advanced',
  minutes: 9,
  summary:
    'A service-desk agent looks up a customer. OneGate asks the attribute service for the customer\'s entitlements, but tells it who is asking. The attribute API can then apply a delegation policy — and the cache must be keyed by both identities.',
  nodes: ['user', 'onegate', 'frontend', 'backend', 'attr'],
  nodeLabels: {
    frontend: { name: 'Service desk app', sub: 'BFF-protected SPA' },
    attr: { name: 'Attribute service', sub: 'delegation-aware' },
  },
  initial: {
    onegate: [
      { id: 'at', kind: 'jwt', name: 'Agent access token', meta: 'sub = agent-2231' },
      { id: 'bff', kind: 'cookie', name: 'Session', meta: 'agent logged in' },
    ],
  },
  steps: [
    {
      from: 'user', to: 'frontend', badge: 'open customer 4711',
      detail: 'An agent is logged in to the service desk. They open a customer record. The agent is allowed to see *some* of the customer\'s data — not everything.',
      tags: ['delegation context'],
    },
    {
      from: 'frontend', to: 'og.bff', badge: 'POST /bff/exchange',
      detail: 'The SPA asks the BFF to switch context to the customer, sending the CSRF header and a reason in `ext`. No token is exposed to the browser.',
      http: {
        req: `POST /mg-local/portal/bff/exchange HTTP/1.1
Cookie: ONEGATE_BFF=sess_4c1f…
X-CSRFTOKEN: 7d1c…

{ "requested_subject": { "subject": "customer-4711",
    "ext": { "reason": "ticket-88213" } },
  "audience": "api.customer" }`,
      },
      tags: ['CSRF', 'reason'],
    },
    {
      from: 'og.bff', to: 'og.attr', badge: 'attributes for customer?',
      detail:
        'Before the exchange can be authorised, OneGate needs the customer\'s entitlements **and** the agent\'s permission to act. It calls the attribute source with `subject = customer-4711` and `actor = agent-2231`.',
      channel: 'internal',
      tags: ['subject + actor'],
    },
    {
      from: 'og.attr', to: 'attr', badge: 'POST with actor',
      detail:
        'The request body follows the User Attribute API shape. The `actor` block uses the RFC 8693 style nesting — a subject inside an actor — so the service can tell *who* is asking for *whose* attributes.',
      channel: 'attr',
      http: {
        req: `POST /attribute-api/v1/users HTTP/1.1
Host: attributes.internal
Authorization: Bearer <signed attribute-request JWT>

{
  "realm": "support",
  "subject": "customer-4711",
  "actor": { "subject": "agent-2231" },
  "requested_attributes": ["entitlements", "accountTier"]
}`,
        res: `HTTP/1.1 200 OK

{
  "attributes": {
    "entitlements": ["invoice.read", "ticket.write"],
    "accountTier": "gold",
    "delegated": true
  }
}`,
      },
      tags: ['nested actor', 'delegated lookup'],
    },
    {
      from: 'attr', to: 'og.attr', badge: 'policy applied', channel: 'attr',
      detail:
        'The attribute service — not OneGate — decides whether this delegation is allowed. It checks the agent\'s assignment, the customer\'s account team, or a manager relationship. If not allowed, it returns `403` and the exchange stops here.',
      tags: ['policy at the data source'],
    },
    {
      from: 'og.attr', to: 'og.attr', badge: 'cache key = subject+actor',
      detail:
        'This is the subtle bug worth remembering: the cache **must** be keyed by `(subject, actor)`. Cache by subject alone and the next agent to open the same customer inherits the previous agent\'s delegated entitlements.',
      channel: 'internal',
      vault: [add('onegate', ITEM.claims({ id: 'attr', name: 'Delegated attributes', meta: 'key: customer-4711 + agent-2231' }))],
      tags: ['cache key', 'security bug'],
    },
    {
      from: 'og.attr', to: 'og.op', badge: 'PARM{attr-0.*}', channel: 'internal',
      detail: 'The resolved parameters are available to the attribute profile. Claims derived from them are only minted for this delegated context.',
      tags: ['profile mapping'],
    },
    {
      from: 'og.op', to: 'og.bff', badge: 'delegated token', channel: 'back',
      detail:
        'The exchanged token carries `sub = customer-4711`, `act = agent-2231`, the narrow audience, and claims derived from the delegated attributes. Both identities are in one token, so the audit trail survives.',
      vault: [add('onegate', ITEM.access({
        id: 'at2', name: 'Delegated access token',
        meta: 'sub=customer · act=agent · 5 min',
        claims: { sub: 'customer-4711', aud: 'api.customer', scope: 'customer.read', act: { sub: 'agent-2231' }, accountTier: 'gold' },
      }))],
      tags: ['act claim', 'derived claims'],
    },
    {
      from: 'og.bff', to: 'og.proxy', badge: 'request as customer', channel: 'internal',
      detail: 'The BFF uses the delegated token for this context. The agent\'s original token is untouched and still available for their own actions.',
      tags: ['context isolation'],
    },
    {
      from: 'og.proxy', to: 'backend', badge: 'Bearer delegated AT',
      detail: 'The API receives the customer context with the agent attached. It authorises on `accountTier`/`entitlements` and records `act.sub` for audit.',
      channel: 'back',
      tags: ['authorise + audit'],
    },
    {
      from: 'backend', to: 'backend', badge: 'check act',
      detail:
        'A good API does not silently accept the delegation. It checks that the actor is present, that the audience is right, and that the scope allows the operation. It logs "agent-2231 viewed customer-4711" — a sentence that is impossible to reconstruct from a plain token.',
      channel: 'internal',
      tags: ['dual identity audit'],
    },
    {
      from: 'backend', to: 'user', badge: '200 customer view', channel: 'back',
      detail: 'The agent sees the customer record, filtered by the delegated entitlements.',
      tags: ['done'],
    },
    {
      from: 'og.attr', to: 'attr', badge: 'without actor → 403',
      detail:
        'The same lookup **without** the `actor` block returns `403` for this subject. The attribute service requires a delegating identity for this realm. If it returned the data anyway, the actor parameter would be decoration rather than a control.',
      channel: 'attr',
      tags: ['fail closed'],
    },
    {
      from: 'og.attr', to: 'og.attr', badge: 'audit the lookup',
      detail:
        'Every delegated attribute lookup is a privacy-relevant event. Log subject, actor, requested attributes and outcome — but not the attribute values themselves.',
      channel: 'internal',
      tags: ['privacy', 'logging'],
    },
  ],
  notes: [
    'The `actor` is who is asking; the `subject` is whose data is being asked for. Keep that straight and most delegation bugs disappear.',
    'Enforce the delegation policy at the attribute service, not only in the UI. The UI is a suggestion.',
    'Cache by `(subject, actor, realm)`. Missing any part of the key is a cross-user data leak.',
    'Exchanged tokens should be short-lived and narrowly scoped. The actor claim is an audit aid, not an authorisation grant by itself.',
    'If you do not need delegated lookups, leave `actor` empty — a smaller contract is a safer contract.',
  ],
  config: [
    cfg('Attribute source → Actor', [
      'Set **Actor** to the parameter that identifies the caller, e.g. `PARM{agentId}` or the exchanged token\'s actor.',
      'The configured actor is posted as `"actor": { "subject": "…" }` in the request body.',
      'Leave it empty for non-delegated attribute sources.',
    ]),
    cfg('Attribute source → Realm / Ext', [
      '**Realm** separates user populations (customers vs employees).',
      '**Ext** carries contextual metadata — ticket ID, reason code — that the attribute service can use in its policy.',
    ]),
    cfg('BFF → Actor claims', [
      'Comma-separated claims copied from the original token into `act`, e.g. `name,email,team`.',
      'Keep the list short: every claim is exposed to every API that receives the token.',
    ]),
    cfg('Attribute source → Valid time', [
      'Delegated lookups should have a shorter cache TTL than ordinary ones.',
      'A stale delegated entitlement is a stale permission.',
    ]),
  ],
  pitfalls: [
    'Caching attributes by subject only — the classic cross-user leak.',
    'Trusting a client-supplied actor. The actor must come from the authenticated token, never from a request parameter.',
    'Forgetting to check `act` in the API, so delegated access is indistinguishable from the customer acting alone.',
    'Long-lived delegated tokens that outlive the support ticket.',
    'Logging attribute values (salary, health data) instead of just the fact of the lookup.',
  ],
};
