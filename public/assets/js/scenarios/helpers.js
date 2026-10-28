/* Shared helpers for scenario definitions.
   A scenario is a plain object; see scenarios/index.js for the shape. */

/** Vault mutation: add a token/item to a store. */
export const add = (store, item) => ({ store, add: item });
/** Vault mutation: remove an item by id from a store. */
export const del = (store, id) => ({ store, del: id });
/** Vault mutation: remove everything from a store. */
export const clear = (store) => ({ store, clearStore: true });

export const ITEM = {
  access: (o = {}) => ({ id: 'at', kind: 'jwt', name: 'Access token', meta: 'aud=api.orders · 15 min', ...o }),
  opaque: (o = {}) => ({ id: 'at', kind: 'opaque', name: 'Access token', meta: 'opaque · must be introspected', ...o }),
  id: (o = {}) => ({ id: 'id', kind: 'id', name: 'ID token', meta: 'RS256 · identifies the user', ...o }),
  refresh: (o = {}) => ({ id: 'rt', kind: 'rt', name: 'Refresh token', meta: 'rotating · 8 h', ...o }),
  code: (o = {}) => ({ id: 'code', kind: 'code', name: 'Authorization code', meta: 'one-time · 60 s', ...o }),
  cookie: (o = {}) => ({ id: 'bff', kind: 'cookie', name: 'BFF cookie', meta: 'HttpOnly · Secure · SameSite=Lax', ...o }),
  session: (o = {}) => ({ id: 'sess', kind: 'session', name: 'Session', meta: 'server-side', ...o }),
  csrf: (o = {}) => ({ id: 'csrf', kind: 'csrf', name: 'CSRF token', meta: 'header X-CSRFTOKEN', ...o }),
  claims: (o = {}) => ({ id: 'claims', kind: 'claims', name: 'Validated claims', meta: 'sub, scope, aud', ...o }),
  jwk: (o = {}) => ({ id: 'jwk', kind: 'jwk', name: 'Signing keys', meta: 'jwks_uri cache', ...o }),
  secret: (o = {}) => ({ id: 'secret', kind: 'secret', name: 'Client secret', meta: 'never leaves the server', ...o }),
  saml: (o = {}) => ({ id: 'saml', kind: 'saml', name: 'SAML assertion', meta: 'signed XML', ...o }),
};

/** Config checklist block. */
export const cfg = (title, items) => ({ title, items });

/** Reusable OneGate config fragments. */
export const CFG = {
  localProvider: cfg('OpenID Connect → Local Providers → (your provider)', [
    'General: realm + virtual host; Discovery URL is generated for you.',
    'Metadata: `response_types_supported = code`, `grant_types_supported = authorization_code`, `token_endpoint_auth_methods_supported = client_secret_basic`, `id_token_signing_alg_values_supported = RS256`.',
    'Provider settings: choose **Access Token Type** (opaque or JWT) and the access / ID token lifetimes.',
    'Realm Settings: pick the **Default Attribute Profile** plus the Access Token and ID Token attribute profiles.',
    'Remote Clients: create one entry per application, with an exact `redirect_uris` whitelist.',
  ]),
  remoteClient: (id = 'my-app', extra = []) => cfg(`OpenID Connect → Remote Clients → ${id}`, [
    '`client_id` + `client_secret` (used by the client at the token endpoint).',
    '`redirect_uris`: exact URIs only — no wildcards unless you really must.',
    '`scope`: include `openid`, then `profile`, `email` and any custom scope your claims need.',
    '`response_types = code`, `grant_types = authorization_code`.',
    '`token_endpoint_auth_signing_alg = RS256`, `id_token_signed_response_alg = RS256`.',
    ...extra,
  ]),
  bff: (realm = 'portal', extra = []) => cfg(`OpenID Connect RP → Backend For Frontend → ${realm}`, [
    '**Realm**: the `realm` path segment, e.g. `/mg-local/portal/bff/...`. Domain + realm must be unique.',
    '**Limit for domains**: the host(s) this BFF is valid for.',
    '**RP Authentication**: which remote provider authenticates the user.',
    '**Local Provider** + **Remote Client**: which OneGate OP issues the tokens, and as which client.',
    '**Client Redirect URIs**: prefix whitelist for the SPA redirect after login.',
    '**CSRF Token header name**: `X-CSRFTOKEN`.',
    ...extra,
  ]),
  rp: (name = 'corp-entra') => cfg(`OpenID Connect RP → Authentication → ${name}`, [
    '**Remote Provider**: points at the partner OP (discovery or manual metadata).',
    '**scope** `openid profile email`, **response_types** `code`, **token_endpoint_auth_method** `client_secret_basic`.',
    '`client_id` / `client_secret` as registered at the partner OP.',
    '**Local user handling**: how `sub` (or another attribute) maps to a local user; what to do with unknown users.',
    '**Session Properties**: copy values out of the response, e.g. `profile = PARM{prop-oidc.realm.userinfo.profile}`.',
  ]),
  resourceSSO: cfg('Proxy resource → SSO / authentication = your BFF config', [
    'Protect the resource with the BFF instead of a plain form login.',
    'OneGate validates the BFF cookie on every request and injects the bearer token towards the backend.',
    'Strip any inbound `X-Forwarded-User` / `Authorization` headers at the edge so clients cannot spoof identity.',
  ]),
  attributeSource: (id = 'attr-0') => cfg(`Attribute source (REST / JVAP) → ${id}`, [
    '**API URL** + method (`GET`/`POST`), connect/read timeout, skip-SSL only for internal self-signed services.',
    '**Realm**, **Audience**, **Subject** (`PARM{mguid}`), optional **Actor** and **Ext**.',
    '**Include Access Token**: signs the attribute request with `iss`, `aud`, `sub` and a key.',
    '**Valid time**: how long resolved attributes are cached in the local session.',
    '**Attributes**: remote names to request, optional **JsonPath**, then use `PARM{attr-0.attributes.department}` in the attribute profile.',
  ]),
};
