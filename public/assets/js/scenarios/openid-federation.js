import { add, del, ITEM, cfg } from './helpers.js';

const OP = 'https://op.example.com';
const RP = 'https://rp.example.com';
const TA = 'https://ta.example.com';

const jwks = (kid) => ({
  keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid, e: 'AQAB', n: `${kid}-modulus-placeholder` }],
});
const opFederationJwks = jwks('op-fed-1');
const rpFederationJwks = jwks('rp-fed-1');
const taFederationJwks = jwks('ta-fed-1');

const opEntityConfiguration = ITEM.statement({
  id: 'op-ec',
  headerKid: 'op-fed-1',
  name: 'OP Entity Configuration',
  meta: 'iss = sub = OP · openid_provider',
  claims: {
    iss: OP,
    sub: OP,
    authority_hints: [TA],
    jwks: opFederationJwks,
    metadata: {
      openid_provider: {
        issuer: OP,
        authorization_endpoint: `${OP}/authorize`,
        token_endpoint: `${OP}/token`,
        jwks_uri: `${OP}/jwks`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        client_registration_types_supported: ['automatic'],
        token_endpoint_auth_methods_supported: ['private_key_jwt'],
        id_token_signing_alg_values_supported: ['RS256'],
      },
    },
  },
});

const taEntityConfiguration = ITEM.statement({
  id: 'ta-ec',
  headerKid: 'ta-fed-1',
  name: 'Trust Anchor Entity Configuration',
  meta: 'iss = sub = TA · federation_fetch_endpoint',
  claims: {
    iss: TA,
    sub: TA,
    jwks: taFederationJwks,
    metadata: {
      federation_entity: {
        organization_name: 'Example Federation',
        federation_fetch_endpoint: `${TA}/federation_fetch_endpoint`,
        federation_list_endpoint: `${TA}/federation_list_endpoint`,
      },
    },
  },
});

const opSubordinateStatement = ITEM.statement({
  id: 'ss-op',
  headerKid: 'ta-fed-1',
  name: 'TA → OP Subordinate Statement',
  meta: 'iss = TA · sub = OP · keys + policy',
  claims: {
    iss: TA,
    sub: OP,
    jwks: opFederationJwks,
    source_endpoint: `${TA}/federation_fetch_endpoint`,
    metadata_policy: {
      openid_provider: {
        response_types_supported: { one_of: ['code'] },
        grant_types_supported: { superset_of: ['authorization_code'] },
        token_endpoint_auth_methods_supported: { one_of: ['private_key_jwt'] },
      },
    },
  },
});

const rpEntityConfiguration = ITEM.statement({
  id: 'rp-ec',
  headerKid: 'rp-fed-1',
  name: 'RP Entity Configuration',
  meta: 'iss = sub = RP · openid_relying_party',
  claims: {
    iss: RP,
    sub: RP,
    authority_hints: [TA],
    jwks: rpFederationJwks,
    metadata: {
      openid_relying_party: {
        client_name: 'Example Federated RP',
        client_registration_types: ['automatic'],
        redirect_uris: [`${RP}/cb`],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_signing_alg: 'RS256',
      },
    },
  },
});

const rpSubordinateStatement = ITEM.statement({
  id: 'ss-rp',
  headerKid: 'ta-fed-1',
  name: 'TA → RP Subordinate Statement',
  meta: 'iss = TA · sub = RP · keys + policy',
  claims: {
    iss: TA,
    sub: RP,
    jwks: rpFederationJwks,
    source_endpoint: `${TA}/federation_fetch_endpoint`,
    metadata_policy: {
      openid_relying_party: {
        redirect_uris: { subset_of: [`${RP}/cb`] },
        token_endpoint_auth_method: { value: 'private_key_jwt' },
        token_endpoint_auth_signing_alg: { one_of: ['RS256', 'ES256'] },
      },
    },
  },
});

const trustChainSteps = [
  {
    from: 'user', to: 'frontend', badge: 'GET /app',
    detail: 'The user opens the RP. The RP wants to use OneGate as its OpenID Provider, but **no client has been registered there**. Before it can redirect the user, the RP must establish that OneGate is a member of the same federation.',
    http: { req: 'GET /app HTTP/1.1\nHost: rp.example.com\n(no session)' },
    tags: ['no manual registration', 'trust needed'],
  },
  {
    from: 'frontend', to: 'og.op', badge: 'GET OP entity configuration', channel: 'back',
    detail: 'The RP fetches the OP’s **Entity Configuration** from the well-known federation path. This is not OIDC discovery: it returns a signed JWT, not JSON metadata.',
    http: {
      req: `GET /.well-known/openid-federation HTTP/1.1
Host: op.example.com
Accept: application/entity-statement+jwt`,
      res: `HTTP/1.1 200 OK
Content-Type: application/entity-statement+jwt

eyJhbGciOiJSUzI1NiIsImtpZCI6ImZlZC1rZXktMSIsInR5cCI6ImVudGl0eS1zdGF0ZW1lbnQranD1...`,
    },
    vault: [add('frontend', opEntityConfiguration)],
    tags: ['entity configuration', 'well-known'],
  },
  {
    from: 'frontend', to: 'frontend', badge: 'validate self-issued EC',
    detail: 'The RP checks the JWT header (`typ=entity-statement+jwt`, `alg`, `kid`), verifies the signature with the `jwks` inside the statement, and checks `iss = sub = OP` and `iat`/`exp`. The statement is self-issued, so this only proves the OP controls its federation key — not that it belongs to a trusted federation yet.\n\nIt also reads `authority_hints: [Trust Anchor]`.',
    channel: 'internal',
    tags: ['typ', 'self-signature', 'authority_hints'],
  },
  {
    from: 'frontend', to: 'idp', badge: 'GET Trust Anchor EC', channel: 'back',
    detail: 'The RP fetches the Entity Configuration of the Trust Anchor. Its key is **pinned out-of-band** — that is the root of trust. If an attacker can supply both the entity statement and the key that signs it, the signature proves nothing.',
    http: {
      req: `GET /.well-known/openid-federation HTTP/1.1
Host: ta.example.com`,
      res: `HTTP/1.1 200 OK
Content-Type: application/entity-statement+jwt

(TA Entity Configuration: federation_fetch_endpoint, federation keys)`,
    },
    vault: [add('frontend', taEntityConfiguration)],
    tags: ['trust anchor', 'pinned key'],
  },
  {
    from: 'frontend', to: 'idp', badge: 'GET subordinate statement', channel: 'back',
    detail: 'The RP asks the Trust Anchor for the **Subordinate Statement** about the OP, using the fetch endpoint and the `sub` query parameter. The SS is the TA’s signed assertion that the OP is its subordinate and that the listed federation keys belong to it.',
    http: {
      req: `GET /federation_fetch_endpoint?sub=https%3A%2F%2Fop.example.com HTTP/1.1
Host: ta.example.com`,
      res: `HTTP/1.1 200 OK
Content-Type: application/entity-statement+jwt

(Subordinate Statement: iss=TA, sub=OP, jwks=OP federation keys, metadata_policy)`,
    },
    vault: [add('frontend', opSubordinateStatement)],
    tags: ['fetch endpoint', 'subordinate statement'],
  },
  {
    from: 'frontend', to: 'frontend', badge: 'verify the trust chain',
    detail: 'The RP now has a chain: **OP EC → TA’s SS about OP → TA EC**. It verifies the TA signature with the pinned TA key, checks that `sub` in the SS is the OP, checks that the OP’s federation key is present in the SS `jwks`, validates `iat`/`exp`, and applies the TA’s **metadata policy**.\n\nThe result is resolved OP metadata — endpoints, keys and capabilities — that the RP can trust.',
    channel: 'internal',
    tags: ['chain', 'key binding', 'metadata policy'],
  },
  {
    from: 'frontend', to: 'user', badge: '302 to the OP',
    detail: 'The RP can now send the user to the OP. It uses `client_id = https://rp.example.com` — its **Entity Identifier** — and a signed `request` object (or a PAR request) so the OP can verify that the request really comes from the RP entity. There is still no client secret and no manual registration.',
    http: {
      res: `HTTP/1.1 302 Found
Location: https://op.example.com/authorize?
  client_id=https%3A%2F%2Frp.example.com
  &response_type=code&scope=openid
  &redirect_uri=https%3A%2F%2Frp.example.com%2Fcb
  &request=eyJhbGciOiJSUzI1NiIsImtpZCI6InJwLWZlZC0xIn0...`,
    },
    tags: ['client_id = entity ID', 'signed request'],
  },
  {
    from: 'user', to: 'og.op', badge: 'GET /authorize',
    detail: 'The OP receives the request. Before it can log the user in, it must establish the reverse direction: **is this RP trusted?** It resolves the RP’s trust chain exactly as the RP resolved the OP’s.',
    tags: ['mutual trust'],
  },
  {
    from: 'og.op', to: 'frontend', badge: 'GET RP entity configuration', channel: 'back',
    detail: 'The OP fetches the RP’s Entity Configuration. Its `metadata.openid_relying_party` contains the redirect URIs, protocol keys and `client_registration_types: ["automatic"]`.',
    http: {
      req: `GET /.well-known/openid-federation HTTP/1.1
Host: rp.example.com`,
      res: `HTTP/1.1 200 OK
Content-Type: application/entity-statement+jwt

(RP Entity Configuration: authority_hints=[TA], redirect_uris, RP metadata jwks)`,
    },
    vault: [add('onegate', rpEntityConfiguration)],
    tags: ['RP metadata', 'redirect_uris'],
  },
  {
    from: 'og.op', to: 'idp', badge: 'GET subordinate statement', channel: 'back',
    detail: 'The OP fetches the Trust Anchor’s Subordinate Statement about the RP. The statement binds the RP’s Entity Identifier to its federation keys and may narrow the RP metadata with policy.',
    http: {
      req: `GET /federation_fetch_endpoint?sub=https%3A%2F%2Frp.example.com HTTP/1.1
Host: ta.example.com`,
      res: `HTTP/1.1 200 OK
Content-Type: application/entity-statement+jwt

(Subordinate Statement: iss=TA, sub=RP, jwks=RP federation keys, metadata_policy)`,
    },
    vault: [add('onegate', rpSubordinateStatement)],
    tags: ['SS about RP', 'metadata policy'],
  },
  {
    from: 'og.op', to: 'og.op', badge: 'validate + auto-register',
    detail: 'The OP validates the chain, applies the Trust Anchor’s policy to the RP metadata, checks that the requested `redirect_uri` is in the resolved `redirect_uris`, and creates an **internal client registration** keyed by the RP’s Entity Identifier. No administrator created this client, and no client secret is issued.',
    channel: 'internal',
    vault: [add('onegate', ITEM.claims({ id: 'clientreg', name: 'Internal client registration', meta: 'client_id = RP entity ID · private_key_jwt' }))],
    tags: ['automatic registration', 'policy', 'no secret'],
  },
  {
    from: 'og.op', to: 'user', badge: 'login page',
    detail: 'Both sides now trust each other. The OP shows its normal login page (or reuses an SSO session). From here the flow is ordinary OpenID Connect — the federation layer has done its job.\n\nSwitch to **Automatic registration** mode to see the code exchange and tokens.',
    tags: ['mutual trust established'],
  },
];

const automaticSteps = [
  {
    from: 'user', to: 'frontend', badge: 'click “Sign in”',
    detail: 'The RP has already resolved the OP’s trust chain and cached the result. The user clicks sign-in. The RP will now exercise **automatic registration**: the OP must accept a client it has never seen before, based on the trust chain.\n\nIf you have not seen the trust-chain mode, switch to **Trust chain (the fabric)** first — this mode assumes the RP has already resolved and cached the OP’s chain.',
    tags: ['trust already resolved'],
  },
  {
    from: 'frontend', to: 'user', badge: '302 to the OP',
    detail: 'The RP sends the browser to the OP with its Entity Identifier as `client_id` and a **signed request object**. The signature proves control of the RP’s key; automatic registration does not mean “trust anyone who can type a URL”.',
    http: {
      res: `HTTP/1.1 302 Found
Location: https://op.example.com/authorize?
  client_id=https%3A%2F%2Frp.example.com
  &response_type=code&scope=openid
  &redirect_uri=https%3A%2F%2Frp.example.com%2Fcb
  &state=8f2c1d…
  &request=eyJhbGciOiJSUzI1NiIsImtpZCI6InJwLWZlZC0xIn0...`,
    },
    tags: ['client_id = entity ID', 'request object'],
  },
  {
    from: 'user', to: 'og.op', badge: 'GET /authorize',
    detail: 'The OP receives the authorization request with an unknown `client_id`. It does not reject it yet: the `client_id` is an Entity Identifier, so the OP can resolve it.',
    tags: ['unknown client', 'resolve trust'],
  },
  {
    from: 'og.op', to: 'frontend', badge: 'GET RP entity configuration', channel: 'back',
    detail: 'The OP fetches the RP’s Entity Configuration from `/.well-known/openid-federation`. The RP metadata includes its redirect URIs, federation keys and `client_registration_types: ["automatic"]`.',
    http: {
      req: `GET /.well-known/openid-federation HTTP/1.1
Host: rp.example.com`,
      res: `HTTP/1.1 200 OK
Content-Type: application/entity-statement+jwt

(RP EC: authority_hints=[TA], metadata.openid_relying_party)`,
    },
    vault: [add('onegate', rpEntityConfiguration)],
    tags: ['RP entity configuration'],
  },
  {
    from: 'og.op', to: 'idp', badge: 'GET TA subordinate statement', channel: 'back',
    detail: 'The OP walks to the Trust Anchor: it fetches the SS about the RP and verifies that the RP’s federation key is bound by the federation.',
    http: {
      req: `GET /federation_fetch_endpoint?sub=https%3A%2F%2Frp.example.com HTTP/1.1
Host: ta.example.com`,
      res: `HTTP/1.1 200 OK
Content-Type: application/entity-statement+jwt

(Subordinate Statement: iss=TA, sub=RP)`,
    },
    vault: [add('onegate', rpSubordinateStatement)],
    tags: ['fetch', 'key binding'],
  },
  {
    from: 'idp', to: 'og.op', badge: 'SS about RP', channel: 'back',
    detail: 'The signed Subordinate Statement arrives. The OP now has everything it needs to validate the RP’s membership and metadata.',
    tags: ['signed statement'],
  },
  {
    from: 'og.op', to: 'og.op', badge: 'validate + register in memory',
    detail: 'The OP validates every statement, applies the Trust Anchor’s **metadata policy**, checks the redirect URI against `redirect_uris`, and creates an internal client registration. Key point: no `client_secret` is generated. The RP will authenticate with `private_key_jwt`.',
    channel: 'internal',
    vault: [add('onegate', ITEM.claims({ id: 'clientreg', name: 'Internal client registration', meta: 'client_id = RP entity ID · private_key_jwt' }))],
    tags: ['automatic registration', 'private_key_jwt', 'no secret'],
  },
  {
    from: 'og.op', to: 'user', badge: 'login page / SSO',
    detail: 'Trust is established and the client is registered. The OP authenticates the user normally. Federation changes how the client is trusted, not how the user logs in.',
    tags: ['normal login'],
  },
  {
    from: 'user', to: 'og.op', badge: 'POST credentials',
    detail: 'The user authenticates at the OP. The OP creates its SSO session; the RP never sees the password.',
    vault: [add('onegate', ITEM.session({ name: 'OneGate SSO session', meta: 'server-side' }))],
    tags: ['SSO'],
  },
  {
    from: 'og.op', to: 'user', badge: '302 ?code',
    detail: 'The OP redirects to the `redirect_uri` that came from the RP’s **federated metadata**, carrying a one-time code and the state.',
    vault: [add('browser', ITEM.code())],
    tags: ['code', 'resolved redirect_uri'],
  },
  {
    from: 'user', to: 'frontend', badge: 'GET /cb?code',
    detail: 'The browser returns the code to the RP. The RP checks `state` and its login transaction. No token is in the browser.',
    tags: ['state check'],
  },
  {
    from: 'frontend', to: 'og.op', badge: 'POST /token + private_key_jwt',
    detail: 'The RP authenticates to the token endpoint with a **client assertion** signed by its private key — not a client secret. `client_id` is again its Entity Identifier.',
    channel: 'back',
    http: {
      req: `POST /token HTTP/1.1
Host: op.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=ac_7Kd2…
&redirect_uri=https%3A%2F%2Frp.example.com%2Fcb
&client_id=https%3A%2F%2Frp.example.com
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer
&client_assertion=eyJhbGciOiJSUzI1NiIsImtpZCI6InJwLWZlZC0xIn0...`,
    },
    tags: ['no client secret', 'client assertion'],
  },
  {
    from: 'og.op', to: 'og.op', badge: 'verify assertion',
    detail: 'The OP looks up the client by Entity Identifier, takes the RP’s protocol `jwks` from the resolved metadata, and verifies the assertion’s signature, `iss`, `aud`, `exp` and `jti`. It also re-checks the code and redirect URI.',
    channel: 'internal',
    tags: ['jwks', 'replay', 'code'],
  },
  {
    from: 'og.op', to: 'frontend', badge: 'tokens', channel: 'back',
    detail: 'The OP issues the normal access token, ID token and (if configured) refresh token. The federation layer has added no new token type; it only decided that this client and this OP trust each other.',
    vault: [
      add('frontend', ITEM.access({ meta: 'normal OneGate access token' })),
      add('frontend', ITEM.id()),
      add('frontend', ITEM.refresh()),
      del('browser', 'code'),
    ],
    tags: ['normal OIDC tokens'],
  },
  {
    from: 'frontend', to: 'frontend', badge: 'cache trust chain',
    detail: 'The RP caches the trust chain only until the **earliest `exp`** of its statements. When the cache expires — or the OP rotates federation keys or changes metadata — the RP re-resolves the chain. Caching forever is how key rollover becomes an outage.',
    channel: 'internal',
    tags: ['cache', 'earliest exp', 'key rollover'],
  },
  {
    from: 'frontend', to: 'user', badge: '200 app page',
    detail: 'The user is inside the app. The browser has only the RP’s session cookie. The OP and RP never exchanged a pre-shared client secret; they proved membership through the Trust Anchor.',
    vault: [add('browser', ITEM.cookie({ id: 'rp', name: 'RP session cookie', cookieName: 'RP_SESSION', cookiePath: '/', meta: 'HttpOnly · Secure · SameSite=Lax' }))],
    tags: ['done', 'cookie only'],
  },
];

export const openidFederation = {
  id: 'openid-federation',
  title: 'OpenID Federation — trust chains & automatic registration',
  category: 'federation',
  level: 'advanced',
  minutes: 16,
  modeLabel: 'Trust chain / automatic',
  defaultMode: 'trust-chain',
  summary:
    'OpenID Federation 1.0 is a JWT-based trust layer, not another login protocol. An RP and an OP prove they belong to the same federation through a Trust Anchor, resolve each other’s metadata, and can register a client automatically — with no manual client_secret. This scenario has two modes: the trust chain itself, and the full automatic-registration login.',
  configNote: 'This scenario is standards-based. The OneGate Administration Manual does not document OpenID Federation entity statements, trust anchors or automatic registration; its only passing mention is an ACL note that “OpenID federation” does not support Max inactive time. Treat these as OpenID Federation 1.0 entities, not Control Center menus. Verify support in your OneGate version.',
  nodeLabels: {
    onegate: { name: 'OneGate OP', sub: 'federated OpenID Provider' },
    frontend: { name: 'Federated RP', sub: 'client_id = entity ID' },
    idp: { name: 'Trust Anchor', sub: 'issues subordinate statements' },
  },
  storeLabels: {
    frontend: 'Federated RP',
    onegate: 'Federated OP',
    idp: 'Trust Anchor',
  },
  productionChecks: [
    'Pin the Trust Anchor key out-of-band; never trust a key because it arrived inside the same statement.',
    'Allow-list which Trust Anchors and entity hosts you will fetch; protect the resolver against SSRF and denial of service.',
    'Re-resolve a cached trust chain before its earliest `exp` and on federation-key rollover.',
  ],
  variants: {
    'trust-chain': { label: 'Trust chain (the fabric)', steps: trustChainSteps },
    automatic: { label: 'Automatic registration', steps: automaticSteps },
  },
  notes: [
    'OpenID Federation is not OIDC Discovery. `.well-known/openid-federation` returns a signed **Entity Configuration** JWT; `.well-known/openid-configuration` returns JSON metadata. They solve different problems.',
    'The Trust Anchor key is the root of trust. Pin it out-of-band or obtain it through a secured key-distribution mechanism; a self-signed statement proves key possession, not federation membership.',
    'Entity Identifiers are HTTPS URLs without query or fragment components. Use the exact string; do not normalise it into a different identity.',
    'Federation Entity Keys and protocol keys are separate. The `jwks` in the Entity Statement signs federation statements; the `jwks` inside `metadata.openid_provider` or `metadata.openid_relying_party` signs OIDC messages.',
    'Automatic registration removes the manual client-registration step, not the trust decision. The Trust Anchor and its metadata policy still decide who is allowed in.',
    'Explicit registration is the fallback for RPs that cannot use signed requests or PAR; it still relies on a trust chain and returns a normal client registration.',
  ],
  config: [
    cfg('OpenID Federation 1.0 — standards reference (not a Control Center menu)', [
      '**Entity Configuration (EC)** — self-issued JWT at `/.well-known/openid-federation`: `iss = sub`, federation `jwks`, `authority_hints`, typed metadata and optional trust marks.',
      '**Subordinate Statement (SS)** — issued by a Trust Anchor or Intermediate about an immediate subordinate: `iss`, `sub`, subject federation `jwks`, optional `metadata`, `metadata_policy`, `constraints` and `source_endpoint`.',
      '**Trust Anchor (TA)** — the root entity. Its federation key is pinned out-of-band; it publishes a `federation_fetch_endpoint`.',
      '**Fetch** — `GET <federation_fetch_endpoint>?sub=<urlencoded entity id>` returns the SS as `application/entity-statement+jwt`.',
      '**Trust chain** — leaf EC + zero or more SS + TA EC, verified from the pinned TA key down to the leaf key. The chain expires at the earliest `exp`.',
      '**Metadata policy** — operators such as `value`, `add`, `default`, `one_of`, `subset_of`, `superset_of` and `essential` narrow or assert metadata along the chain.',
      '**Automatic registration** — `client_id` is the RP’s Entity Identifier; the OP resolves the RP chain, applies policy and creates an internal registration. The RP authenticates with `private_key_jwt` or another asymmetric method; no client secret is issued.',
      '**Explicit registration** — the RP POSTs its EC or trust chain to the OP’s `federation_registration_endpoint`; the OP returns a normal client registration. Use it when signed requests/PAR are not possible.',
      '**Trust marks** — separately signed JWTs issued by a trust mark issuer, used for accreditation (for example “eIDAS high”). They are not a replacement for the trust chain.',
    ]),
    cfg('What must be pinned and validated', [
      'Pin the Trust Anchor key(s) and allow-list the Trust Anchors you accept.',
      'Enforce `typ=entity-statement+jwt`, an acceptable `alg` (never `none`), a non-empty `kid`, and the signature from the issuer’s EC key.',
      'Check `iss`/`sub` linkage at every hop, the subject key in the SS `jwks`, `iat`/`exp`, and the chain’s earliest expiry.',
      'Apply metadata policy and then check the actual `redirect_uris` / client metadata you will use — never trust the leaf’s metadata unmodified.',
      'Protect the resolver: HTTPS only, timeouts, response-size limits, cached statements, and no arbitrary `authority_hints` fetched from untrusted input.',
    ]),
    cfg('Where OneGate fits', [
      'The OneGate Administration Manual documents OIDC Local Providers/Remote Clients and OIDC RP/SAML federation, but not OpenID Federation 1.0 trust anchors, entity statements or automatic registration.',
      'The manual’s one mention of “OpenID federation” is an ACL limitation: it does not support configuring Max inactive time (Administration Manual, ACL section). Do not read that as a feature description.',
      'If your OneGate version adds federation support, keep the concepts separate: a Local Provider is still an OP; a Remote Client is still a client registration; OpenID Federation would be an additional trust layer in front of them.',
    ]),
  ],
  pitfalls: [
    'Treating a self-signed Entity Configuration as trusted. It proves key possession, not membership. Resolve the chain to a pinned Trust Anchor.',
    'Forgetting the reverse direction. The RP must trust the OP, and the OP must trust the RP; both resolve chains.',
    'Using the OIDC signing key as the federation entity key (or vice versa). They are different keys with different jobs.',
    'Accepting a `client_id` URL without checking the signed request and the trust chain. Automatic registration is not “open registration”.',
    'Skipping metadata policy and `redirect_uris` checks. A trusted entity can still ask to redirect to the wrong place.',
    'Caching a trust chain past its earliest `exp`, or not re-resolving after a federation key rollover or revocation.',
    'Fetching any `authority_hints` or entity URL supplied by a client. That is an SSRF and denial-of-service surface; allow-list federation hosts.',
    'Confusing `.well-known/openid-federation` (Entity Configuration JWT) with `.well-known/openid-configuration` (OIDC discovery JSON).',
    'Assuming explicit registration is “more secure” than automatic. Both still depend on a valid trust chain and metadata policy.',
  ],
};

export { trustChainSteps, automaticSteps };
