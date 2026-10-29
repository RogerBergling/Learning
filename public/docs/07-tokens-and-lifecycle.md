# Tokens, storage and lifetimes

A token is a **credential with a scope, an audience and an expiry**. Everything else is detail. The incidents happen when one of those three is missing, or when the credential is stored somewhere it does not belong.

## The cast

| Token | Audience | Who holds it | Lifetime | Readable? |
|---|---|---|---|---|
| Authorization code | The client / OP | Browser for one hop | Seconds | Opaque |
| Access token | The API (`aud`) | Client or BFF/API gateway | Minutes | JWT or opaque |
| ID token | The client (`aud` = client ID) | Client | Minutes | JWT |
| Refresh token | The OP | Confidential client only | Hours–days | Opaque |
| Session cookie | The BFF / web tier | Browser | Minutes–hours | Opaque pointer |
| CSRF token | The BFF | Browser page + BFF session | Session | Readable on purpose |
| SAML assertion | The SP | Browser for one POST | Minutes | XML |

### Access token

The only token an API should accept. It carries (or points to) the subject, scopes and audience. Keep it short-lived; treat it as a bearer credential — whoever holds it can use it until it expires.

### ID token

Proof that authentication happened, for the **client**. It must not be used as an API credential. The audience is the client ID, and the client validates signature, `iss`, `aud`, `exp`, `nonce` and `azp` where relevant.

### Refresh token

A long-lived credential whose only job is to obtain new access tokens. It must live on a confidential server, rotate on every use, and — ideally — be revocable. If a refresh token reaches a browser, the design is wrong.

The manual’s Local Provider exposes the levers directly: **Refresh token lifetime**, **Refresh token total lifetime**, **Refresh token max idle**, **Update refresh token**, **Reuse detection**, **Reuse grace period** and **Issue id token**.

### Authorization code

One-time, short-lived, bound to the client, redirect URI and PKCE verifier. It is safe to send through the browser precisely because stealing it is not enough to redeem it.

## JWT or opaque

| | JWT | Opaque |
|---|---|---|
| API validation | Local signature + claims | Introspection call |
| Revocation | Delayed until `exp` | Immediate |
| Latency | CPU only after JWKS cache | Network round trip |
| Disclosure | Claims readable by anyone | Nothing readable |
| Size | Larger | Small |
| Key management | JWKS rotation | Introspection credentials |
| Best for | Many APIs, low latency, short tokens | Central revocation, high assurance |

Mix them if it helps: JWT access tokens for high-volume APIs, opaque refresh tokens always, opaque access tokens for the highest-risk APIs.

### JWT validation, in order

1. Parse compact serialisation; reject anything else.
2. Select the key by `kid` from the issuer’s JWKS; refresh JWKS on an unknown `kid`.
3. Verify the signature with a pinned algorithm (`RS256`, `ES256`), never `none`.
4. Check `iss` exactly.
5. Check `aud` contains this API.
6. Check `exp` and `nbf` with a small leeway (60–120 s).
7. Check `scope` for the endpoint.
8. Check delegated claims (`act`) if the API cares who is acting.
9. Optionally check `jti` against a replay cache for high-risk operations.

If any step fails, return `401` with `WWW-Authenticate: Bearer error="invalid_token"`. Do not explain which check failed to the caller; log it internally with the `jti`.

### Opaque validation

```http
POST /introspect
Authorization: Basic <api-client:secret>
Content-Type: application/x-www-form-urlencoded

token=at_9f2c...&token_type_hint=access_token
```

Check `active`, then `aud`, `scope`, `exp`. Cache positive results briefly (no longer than the remaining lifetime); cache negatives only for a few seconds. If the OP is unreachable, fail closed for writes and consider a bounded stale cache for reads.

## Where tokens may live

| Credential | Browser | OneGate | Frontend / BFF | Backend API |
|---|---|---|---|---|
| Authorization code | One hop | Creates/consumes | Exchanges (web app) | Never |
| Access token (JWT) | SPA only, in memory | Yes | Yes | Validate, do not store |
| Access token (opaque) | SPA only, in memory | Yes | Yes | Introspect |
| Refresh token | **Never** | Yes | Confidential server only | Never |
| ID token | SPA needs it briefly | Yes (RP) | Yes | **Never** |
| BFF cookie | Yes, HttpOnly | Yes | No (other tier) | No |
| Client secret | **Never** | Yes | Yes (confidential) | Only if it is the client |
| SAML assertion | One POST | Yes | No | No |
| CSRF token | Yes, readable | Yes | Yes | No |

Two rules that prevent most storage bugs:

1. **If JavaScript can read it, assume it will leak.** Put only short-lived, narrowly scoped values there.
2. **A cookie is not a token.** It points at server-side state and carries no claims. Keep it HttpOnly, Secure and narrow.

## Lifetimes

There is no universal number, but there are sane starting points:

| Credential | Start here | Tighten when |
|---|---|---|
| Authorization code | 30–60 s | Always; single use |
| Access token | 5–15 min | Write access, sensitive data, third-party APIs |
| ID token | 5–60 min | The client needs fresher authentication evidence |
| Refresh token | 8 h–30 d | Regulated data, admin consoles |
| Session (idle) | 15–30 min | Shared devices, high-risk apps |
| Session (absolute) | 8–12 h | Always cap it |
| JWKS cache | 5–60 min | Follow `Cache-Control`; refresh on unknown `kid` |

Shorter is not always better: very short access tokens create refresh storms and more chances to fail. Measure the refresh rate and the user impact.

## Refresh token rotation

Rotation means every successful refresh returns a **new** refresh token and invalidates the old one. The OP keeps the family lineage.

```
login        → RT1
refresh(RT1) → AT2 + RT2   (RT1 now invalid)
refresh(RT2) → AT3 + RT3
refresh(RT1) → ERROR, revoke the whole family
```

Why it matters: a stolen refresh token is useful once, and the theft becomes visible when the legitimate client tries to use the old one. That is **reuse detection** — an explicit setting in the manual. A short **Reuse grace period** covers legitimate parallel requests.

Implementation rules:

- Store only a hash of the refresh token, not the value.
- Rotate atomically; a crash between “issue new” and “invalidate old” must not leave both valid.
- Serialise refresh per session. Parallel requests from the same tab should share one refresh, not race.
- On reuse, invalidate the whole refresh-token set and force re-authentication. Do not just return an error and continue.
- Keep an absolute session cap; rotation must not extend a session forever (the manual’s **total lifetime** is the cap).
- Revoke or delete on logout, password change, admin action and suspicious activity.

## Revocation and logout

Revocation is not one operation:

| Layer | Action |
|---|---|
| Refresh token | Revoke at the OP if supported; delete server-side |
| Access token (opaque) | Introspection immediately returns `active: false` |
| Access token (JWT) | Valid until `exp`; use short lifetimes or a deny-list |
| Session | Delete server-side; expire the cookie |
| OP SSO session | End at the OP (`/end_session`) |
| Partner session | Partner logout / SAML SLO if available |
| Client caches | Clear user data, in-memory tokens, service worker caches |

The Administration Manual does not document a token revocation endpoint, an introspection endpoint or OIDC back-channel logout. Those are standard OAuth/OIDC capabilities that may exist in your deployment — verify before depending on them. What the manual does give you is the refresh-token lifecycle above, which is the main lever for bounding a stolen token.

“Logout” that only deletes a cookie is a UI gesture. See [logout](#/sim/logout).

## The token journey

Every simulation has a live vault and a **token journey** table. A useful exercise: after each scenario, ask

- Where was this token **created**?
- Which stores did it **pass through**?
- Where does it **still exist** at the end?
- Who could read it at each point?

Typical mistakes the journey exposes:

- an access token left in the browser after the flow “finished”;
- a refresh token in `localStorage`;
- an authorization code that was never deleted;
- an ID token forwarded to an API;
- a partner token kept in the local session “just in case”;
- a client secret copied into a frontend config.

## Logging and observability

Log the **decision**, not the credential:

```
event=token.validation result=deny reason=audience_mismatch
  iss=https://login.example.com/mg-local/portal aud=api.billing expected=api.orders
  sub_hash=… jti=… client_id=bff-portal
```

Do not log:

- full tokens or authorization codes;
- refresh tokens;
- client secrets;
- cookies;
- SAML assertions with personal data;
- introspection responses containing claims.

If you must correlate, hash the `jti` or the subject with a per-environment salt.

## Failure modes

| Symptom | Likely cause |
|---|---|
| API accepts a token after logout | JWT still within `exp`, or introspection cache too long |
| Refresh works once, then fails | Rotation not stored atomically, or two tabs racing |
| “Reuse detected” for a legitimate user | Parallel refresh, or a retry after a network timeout |
| `invalid_token` only on one API | Wrong `aud`, wrong issuer, stale JWKS, clock skew |
| Token is huge | Too many claims; move display data to UserInfo |
| Token appears in a URL | Implicit flow, or a token passed as a query parameter |
| Browser has a refresh token | A SPA flow was used where a BFF was needed |
| Token works in Postman, not in the app | CORS, cookie, or the app sends the wrong header |

## Simulate it

- [JWT vs opaque](#/sim/token-formats) — switch formats and watch validation.
- [Refresh rotation](#/sim/refresh-rotation) — rotation and reuse detection.
- [Logout](#/sim/logout) — every layer, in order.
- [Multi-audience](#/sim/multi-audience) — why one token must not open every API.

Next: [Server-to-server & client credentials](#/learn/08-server-to-server).
