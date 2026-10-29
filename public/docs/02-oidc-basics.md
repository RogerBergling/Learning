# OIDC & OAuth 2.0, the parts you need

This is a working vocabulary, not a specification. If you know these pieces, every OneGate setting and every simulator step has a name you can look up.

## Two protocols, one flow

- **OAuth 2.0** is about **delegated access**. It answers: *may this client call this API, for this user, with this scope?*
- **OpenID Connect (OIDC)** is a thin identity layer on top of OAuth 2.0. It answers: *who just authenticated, and when?* It adds the ID token, the `openid` scope, the UserInfo endpoint and discovery.

A login uses both. The access token is for the API; the ID token is for the client. They are not interchangeable.

## The roles

| Role | In this lab | Job |
|---|---|---|
| **Resource owner** | The user | Owns the data; consents to access |
| **Client** | SPA, web app, service, BFF | Requests tokens; authenticates to the token endpoint if confidential |
| **Authorization server / OP** | OneGate Local Provider, partner IdP | Authenticates the user, issues tokens |
| **Resource server** | Backend API | Validates the access token, enforces scope |
| **Relying Party (OIDC)** | OneGate RP, your app server | Consumes the ID token; validates it |

“Client” and “RP” overlap in OIDC: the client is the RP. OneGate can be both an OP and an RP, which is why the BFF flow can talk to itself.

## The endpoints you will actually use

Paths below are illustrative. OneGate generates them per realm/virtual host; always read them from discovery in your own deployment.

| Endpoint | Purpose | Typical request |
|---|---|---|
| `/.well-known/openid-configuration` | Discovery: all endpoints, supported algorithms, claims | `GET` |
| `/authorize` | Start a login; returns a code via redirect | Browser `GET` |
| `/token` | Exchange code, refresh token or client credentials | Back channel `POST` |
| `/userinfo` | Claims about the authenticated user (OIDC) | `GET` with bearer token |
| `/jwks` | Public signing keys for JWT validation | `GET`, cached |
| `/introspect` | Ask whether an opaque token is active, and what it means | Back channel `POST` |
| `/revoke` | Invalidate a refresh or access token | Back channel `POST` |
| `/end_session` | RP-initiated logout at the OP | Browser redirect |

Example discovery fragment:

```json
{
  "issuer": "https://login.example.com/mg-local/portal",
  "authorization_endpoint": "https://login.example.com/mg-local/portal/authorize",
  "token_endpoint": "https://login.example.com/mg-local/portal/token",
  "jwks_uri": "https://login.example.com/mg-local/portal/jwks",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic"]
}
```

## The Authorization Code flow, exactly

This is the flow behind almost every scenario in the lab.

1. **The client generates** `state`, `nonce` (OIDC), and a PKCE `code_verifier`; it derives `code_challenge = BASE64URL(SHA256(verifier))`.
2. **The browser is sent to** `/authorize` with `response_type=code`, `client_id`, the exact `redirect_uri`, `scope`, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256`.
3. **The OP authenticates the user** (password, SSO session, federation, MFA) and records consent if needed.
4. **The OP redirects back** to the registered `redirect_uri` with `?code=...&state=...`. The code is single-use and short-lived.
5. **The client verifies `state`** against the value it stored, then exchanges the code on the back channel.
6. **The token request** is a `POST /token` with `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, and client authentication (`client_secret_basic` or another method).
7. **The OP returns** `access_token`, `token_type`, `expires_in`, and usually `id_token` and `refresh_token`.
8. **The client validates the ID token** (signature, `iss`, `aud`, `exp`, `nonce`, `azp` if needed) and creates its own session.
9. **The API call** carries `Authorization: Bearer <access_token>`; the API validates it or introspects it.

The browser carries the code for exactly one hop. It never sees the client secret, the refresh token, or — in a BFF — the access token.

### A concrete authorize request

```http
GET /mg-local/portal/authorize?
  response_type=code
  &client_id=bff-portal
  &redirect_uri=https%3A%2F%2Flogin.example.com%2Fmg-local%2Fportal%2Frp%2Fcallback
  &scope=openid%20profile%20orders.read
  &state=8f2c1d0a4b6e
  &nonce=3b91ae77c2d1
  &code_challenge=Q1x7Yk9m2v0a8...
  &code_challenge_method=S256
Host: login.example.com
```

Note that `redirect_uri` is matched against the registered whitelist. Exact, literal URIs are the safest choice and the manual’s recommendation; wildcards are possible but dangerous. A mismatch is the single most common cause of `redirect_uri_mismatch`.

## PKCE in one minute

PKCE (Proof Key for Code Exchange, RFC 7636) prevents a stolen authorization code from being redeemed by someone else.

- The client picks a random `code_verifier` (43–128 characters).
- It sends only the hash (`code_challenge`) in the front channel.
- It sends the original verifier in the back channel at `/token`.
- The OP checks that `SHA256(verifier)` matches the challenge it stored with the code.

Public clients **must** use it. Confidential clients **should**. With OneGate, PKCE is configured per remote client; the BFF and SPA simulations both use S256.

## `state`, `nonce`, and what they defend

| Value | Lives in | Defends against | Checked where |
|---|---|---|---|
| `state` | Client session, echoed in the redirect | Login CSRF, mix-up between parallel logins | Client, before exchanging the code |
| `nonce` | Client session, embedded in the ID token | ID token replay | Client, when validating the ID token |
| PKCE verifier | Client/server session, sent to `/token` | Code interception and injection | OP, at the token endpoint |
| `jti` | Inside a JWT | Replay in some profiles | API/gateway, if it keeps a replay cache |

A missing `state` check is not a theoretical issue: it lets an attacker log you into *their* account and then watch what you do.

## Tokens, precisely

### Access token

The credential for an API. It may be a JWT or an opaque string.

A simulated JWT access token payload:

```json
{
  "iss": "https://login.example.com/mg-local/portal",
  "sub": "a1b2c3d4-7f31-4a1e-9d2c-55e0f1a2b3c4",
  "aud": "api.orders",
  "client_id": "bff-portal",
  "scope": "openid profile orders.read",
  "exp": 1790000900,
  "iat": 1790000000,
  "jti": "Vf3k...",
  "typ": "at+jwt"
}
```

Validation is not just “is the signature valid?”:

- signature against the issuer’s JWKS, using the `kid`;
- `iss` equals the expected issuer, exactly;
- `aud` contains **this** API;
- `exp` / `nbf` with a small clock leeway;
- `scope` contains what the endpoint requires;
- for delegated tokens, the `act` claim is who is acting.

### ID token

Proof of authentication for the client. Minimum claims: `iss`, `sub`, `aud` (the client ID), `exp`, `iat`. OIDC adds `nonce` when requested, `auth_time`, `acr`, `amr`, and possibly `azp`.

Never send an ID token to an API. Its audience is the client, not the API. An API that accepts ID tokens as access tokens has a confused-deputy bug.

### Refresh token

A long-lived credential for obtaining new access tokens without a new login. It is normally opaque and must live only on a confidential server. Rotation means every use returns a new refresh token and invalidates the old one; reuse of the old one is a breach signal and should revoke the family.

### Authorization code

Short-lived, single-use, bound to the client, redirect URI and PKCE challenge. It is the only credential that legitimately travels through the browser in a code flow.

## Scopes and claims

A **scope** is a permission string requested by the client and granted by the OP, e.g. `orders.read`. A **claim** is a fact about the subject, e.g. `email` or `department`.

They are related but not the same:

- `openid` is mandatory for OIDC and triggers the ID token.
- `profile`, `email`, `address`, `phone` map to standard claim sets.
- Custom scopes can gate custom claims; OneGate attribute profiles decide which claims are emitted.
- Never infer authorization from a claim the user can edit. Entitlements belong in a trusted attribute source or a scope enforced by the API.

## JWT anatomy, without the mystique

A JWT is three base64url parts separated by dots:

```
header.payload.signature
```

Header:

```json
{ "alg": "RS256", "typ": "at+jwt", "kid": "og-sig-2026-07" }
```

Payload: the claims. Signature: `RS256(base64url(header) + "." + base64url(payload), privateKey)`.

Rules that prevent most JWT bugs:

- **Never trust `alg` from the token.** Pin the algorithms you accept.
- **Never accept `none`.**
- **Fetch JWKS by `kid` and cache it**, but refresh on an unknown `kid` — key rotation is normal.
- **Verify `iss` and `aud` as exact strings**, not prefixes.
- **Do not put secrets or unnecessary PII in a JWT**; it is readable by anyone who sees it.
- **Keep access tokens short-lived**; revocation of a JWT is delayed by design unless you add a deny-list.

The **Tokens** tab in every simulation decodes a simulated JWT and shows the expiry relative to now. Use it to see how much a leaked token would disclose.

## Opaque tokens and introspection

An opaque token is a random string. The API learns its meaning by calling `/introspect`:

```http
POST /mg-local/portal/introspect HTTP/1.1
Authorization: Basic <api-client-id:api-client-secret>
Content-Type: application/x-www-form-urlencoded

token=at_9f2c...&token_type_hint=access_token
```

```json
{
  "active": true,
  "scope": "orders.read",
  "client_id": "bff-portal",
  "sub": "a1b2c3d4-...",
  "aud": "api.orders",
  "iss": "https://login.example.com/mg-local/portal",
  "exp": 1790000900,
  "iat": 1790000000,
  "jti": "Vf3k..."
}
```

`active: false` is the only reliable negative answer. A malformed token is also inactive; do not leak which reason applied. Cache positive results no longer than the remaining lifetime (a few seconds is typical), and never cache a negative result for long.

## Grant types and when to use them

| Grant | Who uses it | Lab scenario |
|---|---|---|
| `authorization_code` (+ PKCE) | Web apps, SPAs, BFF, native apps | BFF, SPA, confidential web app |
| `refresh_token` | Confidential clients with long sessions | Refresh rotation |
| `client_credentials` | Services with no user | Client credentials |
| Token exchange | Delegation / audience narrowing | BFF exchange, attribute delegation |
| Implicit | Legacy only; avoid | Not used |
| Password (`ROPC`) | Migration only; avoid | Not used |

If someone proposes implicit or ROPC for a new application, ask what problem PKCE and a BFF do not solve.

## Client authentication methods

| Method | Secret in browser? | Notes |
|---|---|---|
| `client_secret_basic` | No | Default for confidential clients; credentials in the `Authorization` header |
| `client_secret_post` | No | Credentials in the body; simpler, slightly more log-exposure risk |
| `private_key_jwt` | No | Client signs an assertion; no shared secret; strong choice |
| `tls_client_auth` / mTLS | No | Certificate-bound; strong, operationally heavier |
| `none` | Yes (public client) | Only for public clients, and only with PKCE |

A SPA is a public client. It has no secret, no matter how well you obfuscate the JavaScript.

## Errors: the ones you will meet

Authorization endpoint errors arrive as redirect parameters (`?error=...&state=...`). Token endpoint errors arrive as JSON with an HTTP status.

| Error | Usually means |
|---|---|
| `invalid_request` | Missing/duplicated parameter, bad PKCE, wrong method |
| `invalid_client` | Unknown client, wrong secret, wrong auth method, secret sent in the wrong place |
| `invalid_grant` | Bad/expired/reused code, wrong redirect URI, PKCE mismatch, expired refresh token |
| `invalid_scope` | Scope not allowed for this client |
| `redirect_uri_mismatch` | Exact-match failure against the registered URI |
| `unauthorized_client` | Client exists but may not use this grant |
| `access_denied` | User or policy refused |
| `login_required` / `interaction_required` | No session, or step-up needed |
| `invalid_token` (API) | Signature/issuer/audience/expiry failure |
| `insufficient_scope` (API) | Valid token, not enough permission |

The [troubleshooting playbook](#/learn/10-troubleshooting) turns these into an ordered checklist.

## OIDC next to SAML

| | OIDC | SAML 2.0 |
|---|---|---|
| Message format | JSON + JWT | XML with XMLDSig |
| Transport | Redirect / POST / back channel | Redirect, POST binding, artifact |
| Token | ID token (JWT) | Assertion (XML) |
| Discovery | `.well-known/openid-configuration` | Metadata XML |
| Typical client | Modern web, mobile, SPA, service | Enterprise SaaS, legacy federation |
| Signature | JWS over compact JSON | XMLDSig over assertion/response |
| Failure style | JSON error codes | Status codes + XML status |

OneGate can bridge them: OIDC in, SAML out, or the reverse. The identity mapping is the hard part, not the envelope. See [federation](#/learn/04-federation-rp-saml).

> **Rule of thumb:** use the code flow, keep tokens out of the browser when you can, validate `aud` everywhere, and treat every value that crossed the browser as public.

Next: [Configuring the OneGate OpenID Provider](#/learn/03-onegate-local-provider).
