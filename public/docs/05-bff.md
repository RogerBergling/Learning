# Backend for Frontend, end to end

The BFF pattern is the answer to a simple question: *where can a browser app keep an access token safely?* The honest answer is “nowhere that survives an XSS bug”. So the token moves to a server, and the browser gets a cookie that is useless to JavaScript.

OneGate’s BFF is also the clearest place to see OneGate acting as **RP and OP at the same time**, because the BFF’s RP configuration points at OneGate’s own Local Provider.

## The problem in one table

| Storage | Readable by JS | Survives reload | XSS impact | Verdict |
|---|---|---|---|---|
| `localStorage` | Yes | Yes | Token stolen | Avoid |
| `sessionStorage` | Yes | Per tab | Token stolen | Avoid |
| In-memory variable | Yes, while running | No | Token stolen while page is open | Acceptable for a short-lived SPA token |
| HttpOnly cookie | No | Yes | Requests can be made, token cannot be read | Good, but needs CSRF defence |
| Server-side session | No | Yes | Cookie theft only; server can revoke | Best for confidential apps |

A BFF combines the last two: HttpOnly cookie in the browser, tokens in server-side state. The browser never learns the access token, the refresh token, or the client secret.

## What the BFF actually does

1. **Starts the login** at `/bff/login`, storing a transaction (`state`, `nonce`, PKCE verifier, return URL).
2. **Delegates to an RP configuration**, which performs a normal OIDC code flow.
3. **Keeps the tokens** in a server-side session keyed by an opaque cookie.
4. **Proxies API calls**, attaching the bearer token server-side.
5. **Refreshes silently** using the refresh token before it expires.
6. **Enforces CSRF** on state-changing requests.
7. **Logs out** locally and, if configured, at the OP/partner.

The SPA is reduced to a static asset. It calls same-origin `/api/...` routes; the BFF decides who the user is and which token to use.

## The flagship flow

This is exactly what the [BFF login simulation](#/sim/bff-login) animates.

| # | Hop | What happens |
|---|---|---|
| 1 | SPA → BFF | `GET /bff/login?redirect_uri=...`; the return URL is checked against the **Client Redirect URIs** whitelist |
| 2 | BFF creates a transaction | `state`, `nonce`, `code_verifier`, return URL stored server-side |
| 3 | BFF → RP | The BFF does not invent a login; it uses its **RP Authentication** configuration |
| 4 | RP → browser | `302` to the Local Provider `/authorize` with `client_id=bff-portal` and the BFF callback as `redirect_uri` |
| 5 | OP validates | client, exact redirect URI, scopes, PKCE |
| 6 | OP authenticates | login page, or an existing SSO session is reused |
| 7 | OP → browser | `302` to `/bff/callback?code=...&state=...` |
| 8 | BFF callback | checks `state`, consumes the transaction, rejects replay |
| 9 | BFF → token endpoint | `POST /token` with `client_secret_basic`, code, redirect URI and `code_verifier` |
| 10 | Tokens → BFF session | access, ID and refresh tokens stored server-side; code and transaction deleted |
| 11 | BFF → browser | sets the HttpOnly session cookie, redirects to the SPA |
| 12 | SPA → BFF → API | the SPA calls same-origin; the BFF attaches the bearer token |

The key insight is step 3. OneGate-as-BFF talks to OneGate-as-RP, which talks to OneGate-as-OP. It is the same protocol you would use with Entra, with no privileged shortcut. That means a local login and a federated login exercise the same validation code.

## Configuration

### BFF realm settings

| Setting | Meaning | Notes |
|---|---|---|
| **Realm** | Path segment, e.g. `/mg-local/portal/bff/...` | Domain + realm must be unique |
| **Limit for domains** | Which host(s) this BFF is valid for | Prevents a BFF from serving an unintended host |
| **RP Authentication** | The RP config that authenticates the user | Local or partner provider |
| **Local Provider** | The OP that issues the local tokens | Usually OneGate itself |
| **Remote Client** | The client the BFF authenticates as | `bff-portal` here |
| **Client Redirect URIs** | Post-login redirect whitelist | Prefix rules must end with `/` |
| **CSRF token header** | Header the SPA must send | `X-CSRFTOKEN` in this lab |
| **Logout URL** | Where to go after logout | Coordinate with the SPA |
| **Enable AT Endpoint (debug)** | Exposes the access token to the browser | Leave **off** in production |

### The RP config behind it

| Setting | Value |
|---|---|
| Remote Provider | OneGate Local Provider (discovery or manual) |
| Client ID / secret | `bff-portal` / generated secret |
| Response type | `code` |
| Scopes | `openid profile orders.read` |
| Token endpoint auth | `client_secret_basic` |
| Redirect URI registered at the OP | `https://login.example.com/mg-local/portal/bff/callback` |

### The remote client

| Setting | Value |
|---|---|
| Client ID | `bff-portal` |
| Redirect URI | the BFF callback above, exactly |
| Grants | `authorization_code`, `refresh_token` |
| PKCE | required |
| Access token type | JWT or opaque (API-dependent) |

If any one of these three objects disagrees — BFF, RP, remote client — the login fails in a different place. The simulator’s **Setup** tab lists all three so you can see which layer owns each value.

## Cookies and CSRF

The BFF cookie is a **session pointer**, not a token.

```
Set-Cookie: ONEGATE_BFF=...; HttpOnly; Secure; SameSite=Lax;
            Path=/mg-local/portal/bff; Max-Age=1800
```

| Attribute | Why |
|---|---|
| `HttpOnly` | JavaScript cannot read it, so XSS cannot exfiltrate it |
| `Secure` | Never sent over plain HTTP |
| `SameSite=Lax` | Blocks most cross-site requests while allowing top-level navigation back from the OP |
| `Path` | Limits which routes receive it |
| `Max-Age` / idle timeout | Bounds a stolen cookie’s usefulness |
| Domain | Keep it as narrow as possible; avoid sharing across unrelated hosts |

If the SPA and BFF are on different sites, `SameSite=Lax` will not be sent on cross-site `fetch`. You then need `SameSite=None; Secure` **and** CORS with credentials, **and** explicit CSRF defence. Prefer same-site deployment; it removes a class of bugs.

CSRF is separate from authentication. The SPA reads a CSRF token (from a response header or a readable cookie) and sends it in `X-CSRFTOKEN` on `POST`/`PUT`/`PATCH`/`DELETE`. The BFF compares it with the session. A missing or stale token produces a 403 that looks like an auth failure but is not.

Rules:

- Never accept state-changing requests on `GET`.
- Do not rely on `SameSite` alone; use the token too.
- Rotate the CSRF token on login and logout.
- Do not put the CSRF token in `localStorage` if you can keep it in memory.
- If you allow multiple tabs, make sure refresh does not invalidate the other tab’s token unexpectedly.

## Calling APIs through the BFF

Two common shapes:

**Proxy shape (recommended for same-origin):**

```
Browser ──cookie──▶ BFF /api/orders ──Bearer AT──▶ Backend API
```

The SPA calls a path on the BFF’s own origin. No CORS, no token in the browser, and the BFF can shape or filter the response.

**Token-endpoint shape (avoid):**

```
Browser ──cookie──▶ BFF /bff/accessToken ──AT──▶ Browser ──AT──▶ API
```

This is the debug endpoint. It hands the access token to JavaScript and undoes the entire pattern. If you need it for troubleshooting, gate it to a non-production environment and a privileged operator.

When proxying, do not forward client-supplied identity headers. Strip `Authorization`, `X-Forwarded-User`, `X-User`, `X-Authenticated-User` and similar at the edge, then add the trusted ones yourself. Header injection is a classic way to bypass the BFF.

## Refresh and session lifetime

The BFF keeps the refresh token server-side and renews the access token before it expires.

- Refresh proactively (e.g. when 60 seconds remain), not after a 401, to avoid a burst of failed calls.
- Serialise refresh per session: ten parallel requests must not trigger ten refreshes and invalidate each other under rotation.
- If refresh fails with `invalid_grant`, treat the session as dead: clear it and send the user to login. Do not loop.
- Apply an absolute session lifetime even if the refresh token is longer-lived.
- On logout, revoke the refresh token at the OP **and** delete the server-side session. One without the other leaves a usable credential or a zombie session.

## Logout

A correct BFF logout does all of this:

1. `POST /bff/logout` with a valid CSRF token.
2. Delete the server-side session and revoke the refresh token.
3. Clear the BFF cookie with an expired `Set-Cookie`.
4. Redirect to the RP/OP end-session endpoint if a federated SSO session should also end.
5. Redirect the browser to the configured **Logout URL**.
6. On the SPA, clear in-memory state and any cached user data.

If you only clear the cookie, the OneGate SSO session may still exist; the next login will be silent and the user will appear “already logged in”. See [logout](#/sim/logout).

## Delegation and exchange

The BFF can also act as a token-exchange point. A support agent logs in normally, then the BFF exchanges the agent’s session token for a token that represents the customer, with the agent recorded as the actor:

```
sub = customer
act = { sub: agent, name: "Roger Lind" }
aud = api.support
```

This is **delegation**, not impersonation: the audit trail keeps both identities. The exchange must be authorised server-side — never trust `requested_subject` from the SPA. Exchanged tokens should be narrower and shorter-lived than the original. See [BFF exchange](#/sim/bff-exchange).

## Deployment shapes

| Shape | Cookie | Notes |
|---|---|---|
| BFF and SPA on the same host, BFF proxies `/api` | `SameSite=Lax` | Simplest; no CORS; recommended |
| BFF on `login.example.com`, API on `api.example.com` | `SameSite=Lax` if same site; `None` if truly cross-site | CORS credentials + CSRF + explicit `Access-Control-Allow-Origin` |
| BFF behind an external reverse proxy/LB | Ensure `X-Forwarded-Proto` and host are correct | Wrong scheme causes `Secure` cookies to be dropped |
| Multiple BFF realms | Separate cookie names/paths | Avoid collisions and cross-realm leakage |

## What can go wrong

| Symptom | Cause |
|---|---|
| Login redirects forever | Callback not registered, or the BFF is not creating a session |
| Cookie set but never sent | Wrong domain/path, `Secure` over HTTP, `SameSite` mismatch |
| 403 on POST | Missing/stale `X-CSRFTOKEN` |
| API returns 401 while the SPA is logged in | BFF refresh failed, or the token audience is wrong |
| Two tabs log each other out | Refresh rotation without per-session serialisation |
| User is “logged out” but a refresh logs them back in | SSO session at the OP was never ended |
| `accessToken` visible in DevTools | Debug endpoint enabled, or the SPA calls it directly |
| CORS error on `/bff/login` | The SPA is calling the BFF as a cross-origin API; it should navigate, not fetch |

## Simulate it

- [BFF login](#/sim/bff-login) — the complete flow, with the live vault.
- [BFF with a partner IdP](#/sim/bff-thirdparty) — same BFF, different RP.
- [BFF exchange](#/sim/bff-exchange) — delegation and the actor claim.
- [Logout](#/sim/logout) — local, OP and partner sessions.

Next: [Attribute providers & JVAP](#/learn/06-attribute-providers).
