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
  cookie: (o = {}) => ({ id: 'bff', kind: 'cookie', name: 'BFF cookie', meta: 'HttpOnly · Secure · SameSite=Lax', cookieName: 'ONEGATE_BFF', cookiePath: '/mg-local/portal/bff', ...o }),
  session: (o = {}) => ({ id: 'sess', kind: 'session', name: 'Session', meta: 'server-side', ...o }),
  csrf: (o = {}) => ({ id: 'csrf', kind: 'csrf', name: 'CSRF token', meta: 'header X-CSRFTOKEN', ...o }),
  claims: (o = {}) => ({ id: 'claims', kind: 'claims', name: 'Validated claims', meta: 'sub, scope, aud', ...o }),
  jwk: (o = {}) => ({ id: 'jwk', kind: 'jwk', name: 'Signing keys', meta: 'jwks_uri cache', ...o }),
  secret: (o = {}) => ({ id: 'secret', kind: 'secret', name: 'Client secret', meta: 'never leaves the server', ...o }),
  saml: (o = {}) => ({ id: 'saml', kind: 'saml', name: 'SAML assertion', meta: 'signed XML', ...o }),
  statement: (o = {}) => ({ id: 'stmt', kind: 'statement', name: 'Federation entity statement', meta: 'JWT · typ=entity-statement+jwt', ...o }),
  image: (o = {}) => ({ id: 'image', kind: 'image', name: 'Container image', meta: 'tag + digest', ...o }),
  container: (o = {}) => ({ id: 'container', kind: 'container', name: 'Container', meta: 'running process', ...o }),
  volume: (o = {}) => ({ id: 'volume', kind: 'volume', name: 'Volume', meta: 'persistent data', ...o }),
  compose: (o = {}) => ({ id: 'compose', kind: 'compose', name: 'compose.yaml', meta: 'services · networks · volumes', ...o }),
  dockerfile: (o = {}) => ({ id: 'dockerfile', kind: 'dockerfile', name: 'Dockerfile', meta: 'build recipe', ...o }),
  layer: (o = {}) => ({ id: 'layer', kind: 'layer', name: 'Image layer', meta: 'content-addressed filesystem diff', ...o }),
  commit: (o = {}) => ({ id: 'commit', kind: 'commit', name: 'Git commit', meta: 'snapshot + parent + author', ...o }),
  branch: (o = {}) => ({ id: 'branch', kind: 'branch', name: 'Branch', meta: 'movable ref', ...o }),
  tag: (o = {}) => ({ id: 'tag', kind: 'tag', name: 'Git tag', meta: 'stable version marker', ...o }),
  workflow: (o = {}) => ({ id: 'workflow', kind: 'workflow', name: 'GitHub Actions workflow', meta: 'CI · publish', ...o }),
  network: (o = {}) => ({ id: 'network', kind: 'network', name: 'Container network', meta: 'service DNS · isolation', ...o }),
  file: (o = {}) => ({ id: 'file', kind: 'file', name: 'Project file', meta: 'tracked or ignored', ...o }),
};

/** Config checklist block. */
export const cfg = (title, items) => ({ title, items });

/** Reusable OneGate config fragments (menu labels follow the Administration Manual). */
export const CFG = {
  localProvider: (realm = 'portal') => cfg(`Federation → OpenID Connect → Local Providers → ${realm}`, [
    '**General**: Description, Virtual Host Domain and a unique **Realm** (the realm forms the endpoint paths). **Discovery URL** appears once the provider exists.',
    '**Metadata**: `response_types_supported = code`, `grant_types_supported = authorization_code`, `token_endpoint_auth_methods_supported = client_secret_basic`, `token_endpoint_auth_signing_alg_values_supported = RS256`, `id_token_signing_alg_values_supported = RS256`, `subject_types_supported = public`.',
    '**Provider Settings**: **Access Token Type** (`opaque` or `jwt`), **Access Token Lifetime (min)**, **ID Token Lifetime (min)**.',
    '**Refresh token**: lifetime, total lifetime, max idle, **Update refresh token**, **Reuse detection**, **Reuse grace period (sec)**, **Issue id token**.',
    '**Realm Settings**: enable the provider on the virtual host, choose the **Default Attribute Profile**, **Access Token Attribute Profile** and **ID Token Attribute Profile**.',
    '**Key Settings**: RSA 2048/3072/4096, optional x5c certificate, `x5t` / `x5t#S256` thumbprints. OneGate can also generate EdDSA, EC and encryption keys; the manual provides **No EdDSA key** / **No EC key** / **No encryption keys** switches for clients that cannot consume them.',
    '**Remote Clients**: one entry per application; see below.',
  ]),
  remoteClient: (id = 'my-app', extra = []) => cfg(`Federation → OpenID Connect → Local Providers → Remote Clients → ${id}`, [
    '**redirect_uris**: comma-separated whitelist; the incoming `redirect_uri` is matched against the whole list. Wildcards (`*`) are possible but the manual strongly advises exact URIs.',
    '**scope**: space separated, must include `openid`; `profile`, `email`, `address`, `phone` are pre-defined. Every claim still needs a mapping in the attribute profile.',
    '**response_types**: use `code`; the manual explicitly discourages implicit and hybrid.',
    '**grant_types**: `authorization_code` is required for the code flow.',
    '**token_endpoint_auth_signing_alg** `RS256`, **id_token_signed_response_alg** `RS256`, **userinfo_signed_response_alg** `RS256`.',
    '**client_id** + **client_secret**: the client authenticates with both at the token endpoint.',
    '**Local properties for claims**: values become `PARM{oidcclient.NAME}` during claim evaluation (e.g. a client-specific `sub`, or `PARM{oidcclient.name}` used as a REST attribute-source audience).',
    '**Access Token JWT**: **Default resource (`aud`)** (overrides the default `client_id`), **Allowed resources from parameter** (`resource` request parameter), **Resource indicator from scope**.',
    ...extra,
  ]),
  bff: (realm = 'portal', extra = []) => cfg(`Federation → OpenID Connect RP → Backend For Frontend → ${realm}`, [
    '**Description**, **Realm** (URL-safe path segment) and **Limit for domains** (comma separated). Domain + realm must be unique per BFF config.',
    '**RP Authentication**: the OpenID remote provider used to authenticate the user.',
    '**Local Provider** + **Remote Client**: the local OP that issues the tokens, and the client it issues them for.',
    '**Client Redirect URIs**: comma-separated list; each string is matched against the **beginning** of the requested `redirect_uri` (prefix match).',
    '**Logout URL**: returned by the response to `/mg-local/(realm)/bff/logout` after the session is logged out.',
    '**Authenticate users from tokens**: check this only when a **third-party** OP authenticates the user. Leave it off when the BFF’s RP points at the same OneGate.',
    '**Enable AT Endpoint (debug)**: exposes `/mg-local/(realm)/bff/accessToken`. Testing only — it defeats the point of the BFF.',
    '**CSRF Token header name**: suggested `X-CSRFTOKEN`.',
    '**Initial subject / ext / audience / realm** become `PARM{bffN.subject|ext|audience|realm}` after login. **Default exchange ext / audience / realm** apply when an exchange request omits them.',
    '**Actor claims**: comma-separated claim names copied from the original token into the `act` claim of the exchanged token; the authenticated user’s `sub` is always added.',
    ...extra,
  ]),
  rp: (name = 'corp-entra') => cfg(`Federation → OpenID Connect RP → RP Authentication → ${name}`, [
    '**Description** + **Unique Name** (also forms the callback endpoint) + **Virtual Host Domain**.',
    '**Remote Provider**: the partner OP, configured with a Discovery URL or manual metadata (`issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`).',
    '**scope** must include `openid`; **response_types** `code`; **token_endpoint_auth_method** usually `client_secret_basic` or `client_secret_post`.',
    '**client_id** / **client_secret** as registered at the partner OP; **id_token_signed_response_alg** per the OP.',
    '**Local user handling**: custom UserId attribute, use `sub` as username, or map to a local attribute. **Handle unknown users**: reject, allow (try local match), or no user-db check.',
    '**Session Properties**: copy response values, e.g. `profile = PARM{prop-oidc.realm.userinfo.profile}`.',
    '**prompt**: normally left empty. `none`, `login`, `consent`, `select_account` are available but this lab’s flows do not rely on them.',
  ]),
  webResource: cfg('Administration → User Services → Web Resource → Advanced / Access Control', [
    '**Send Custom Headers** (Advanced tab): enter the header **without** the `X-` prefix, e.g. `USERID`; OneGate adds `X-` and sends `X-USERID` to the web resource.',
    'The manual states headers starting with `X` are **never passed from the client** — so an inbound `X-USERID` cannot be spoofed through OneGate.',
    '**Access Control (ACL)**: authorise by group, IP address, date/time and authentication method before the request reaches the app.',
    '**SSO Settings → Authentication type = Normal** means no resource-specific SSO; normal OneGate authentication plus the ACL protects the app.',
  ]),
  attributeSource: (id = '0') => cfg(`Authentication → Attribute Sources → ${id}`, [
    '**Description**; **Log out user on fail** logs the user out when they are not found in the source.',
    '**Type**: LDAP, REST or Graph API service.',
    '**API URL** + method, connect/read timeout, skip-SSL only for internal self-signed services.',
    'REST request body: **realm**, **subject**, **actor** as `{ "subject": "..." }`, **requested_attributes**, optional **Ext**.',
    '**Include Access Token**: check to send a JWT to the attribute service; set **`iss`**, **`aud`**, **`sub`** and the sign/encrypt **Key**.',
    '**Valid time**: how long resolved attributes are cached in the local session. **Attributes**: Attribute Name, optional **JsonPath** and **Friendly Name** (GUI label only).',
    'Use `PARM{attr-0.attributes.NAME}` (or `PARM{attr-0.ATTRIBUTE_NAME}` for a JsonPath attribute) in an attribute profile to turn the value into a claim.',
  ]),
};
