# Configuring the OneGate OpenID Provider

This chapter walks through the settings that make OneGate behave as an OpenID Provider: the **Local Provider**, the **Realm Settings** that decide what goes into tokens, and the **Remote Clients** that represent applications. Menu names follow the federation menu; labels differ slightly between versions, and the exact endpoint paths are generated for your deployment.

> All paths in this lab look like `https://login.example.com/mg-local/portal/...`. Treat them as illustrative. Always read your own discovery document.

## The object model

```
Local Provider (one per realm / virtual host)
├── Metadata + endpoints          ← generated; advertised via discovery
├── Provider settings             ← token format, lifetimes, algorithms
├── Realm Settings                ← attribute profiles (what goes in tokens)
├── Signing keys                  ← JWKS, rotation
└── Remote Clients                ← one per application
      ├── client_id / client_secret
      ├── redirect_uris
      ├── scopes + grants
      └── token endpoint auth method

Remote Providers                  ← external OPs / IdPs you consume (federation)
RP → Authentication               ← an RP configuration that points at a provider
```

If you remember one thing: **the Local Provider issues, the Remote Client describes the application, the Realm Settings decide the claims, and the RP consumes identity.** They are four different screens because they answer four different questions.

## 1. Local Providers

A Local Provider is OneGate acting as an OP for a realm. You create one per trust domain — for example `portal` for employees, `partner` for external users, `ops` for internal tools.

### General

| Setting | What it does | Practical advice |
|---|---|---|
| **Name / realm** | Appears in the path (`/mg-local/{realm}/...`) and in `iss` | Short, stable, lowercase. Changing it breaks every token and every registered redirect. |
| **Virtual host** | The public hostname users see | Use the same host as the app or a dedicated login host; be consistent with cookies. |
| **Enabled** | Whether the provider answers | Disable rather than delete during migrations. |
| **Display name** | Shown on the login page | Use the organisation’s name, not the protocol. |

The issuer is derived from host + realm. If your issuer changes, every API’s `iss` check fails. Plan it before production.

### Metadata

OneGate generates the metadata. The settings that matter:

| Metadata field | Safe value for most deployments | Why |
|---|---|---|
| `response_types_supported` | `code` | The implicit flow is deprecated and leaks tokens in URLs. |
| `grant_types_supported` | `authorization_code`, `refresh_token`, `client_credentials` (only if needed) | Disable what you do not use. |
| `token_endpoint_auth_methods_supported` | `client_secret_basic` (add `private_key_jwt`/mTLS if used) | Fewer methods, fewer mistakes. |
| `id_token_signing_alg_values_supported` | `RS256` | Broad compatibility; ES256 is fine if all clients support it. |
| `scopes_supported` | `openid`, `profile`, `email`, plus your API scopes | Keep the list honest. |
| `claims_supported` | The claims your attribute profiles actually emit | Avoid promising claims that never appear. |

The discovery URL is usually:

```
https://login.example.com/mg-local/portal/.well-known/openid-configuration
```

Use it in clients and RPs instead of hard-coding endpoints. If discovery is unreachable, the RP cannot start; that is a deployment dependency worth monitoring.

### Provider settings

| Setting | Options | Effect |
|---|---|---|
| **Access Token Type** | `opaque` or `JWT` | Decides whether APIs validate locally or introspect. See [JWT vs opaque](#/sim/token-formats). |
| **Access token lifetime** | e.g. 5–15 min | Shorter limits damage; longer reduces refresh traffic. |
| **ID token lifetime** | e.g. 5–60 min | It proves a login; it is not a session. |
| **Refresh token lifetime** | e.g. 8 h–30 d | Cap it with an absolute session policy. |
| **Refresh token rotation** | on/off | Turn it on. Reuse detection depends on it. |
| **PKCE** | required / optional / off | Required for public clients, recommended for all. |
| **Signing key** | select or rotate | Publish via JWKS; keep the old key until tokens expire. |
| **Consent** | none / first use / always | Use first-use for third-party apps, none for first-party. |

A useful default for a BFF: opaque or JWT access tokens with 10–15 minute lifetime, ID token 15 minutes, refresh token 8 hours with rotation, PKCE required, consent first-use.

### Signing keys and JWKS

The OP signs ID tokens (and JWT access tokens) with a private key. Clients and APIs fetch the public keys from `jwks_uri` and select by `kid`.

Operational rules:

- Publish **all** keys that may still have valid tokens, not just the newest.
- Rotate with overlap: new key published → new tokens signed with it → old key removed only after the maximum token lifetime.
- APIs must refresh JWKS when they see an unknown `kid`, not just on a timer.
- Never let a client disable signature validation “because it is internal”.

## 2. Realm Settings and attribute profiles

Realm Settings decide **which claims go into which token**. This is where OneGate stops being a generic OAuth server.

There are usually three profiles:

| Profile | Applies to | Typical claims |
|---|---|---|
| **Default Attribute Profile** | UserInfo / general identity | `sub`, `preferred_username`, `name`, `email` |
| **Access Token Attribute Profile** | The access token | `sub`, `scope`, `client_id`, roles, entitlements |
| **ID Token Attribute Profile** | The ID token | `sub`, `auth_time`, `acr`, `amr`, `nonce`, name/email if the client needs them |

Two principles:

1. **Keep access tokens lean.** Every claim is copied to every API and every log line. Put entitlements the API enforces in the token; put display data in UserInfo or the ID token.
2. **Use attribute profiles to expose, not to compute.** If a claim must be derived, resolve it through an attribute provider and map the result. Do not rely on a client to send it.

A claim entry often looks like a `PARM{...}` reference:

```
PARM{mguid}
PARM{prop-oidc.realm.userinfo.email}
PARM{attr-0.attributes.department}
```

The exact parameter namespace is deployment-specific; the pattern is stable: **profile entry → parameter reference → value from user store, federation response or attribute provider.**

### Scopes and claims

- A client requests scopes; the OP decides which claims those scopes release.
- Custom scopes (e.g. `orders.read`) can be enforced by the API and can also gate custom claims.
- Do not put a claim in a token just because it is easy. A JWT is readable by anyone who sees it.
- If a claim changes often (entitlements, department), prefer short token lifetimes or introspection over a long-lived JWT snapshot.

## 3. Remote Clients

A Remote Client is an application registered at the Local Provider. One entry per app, even if two apps share a codebase.

### Required fields

| Field | Notes |
|---|---|
| **Client ID** | Stable, human-readable: `bff-portal`, `orders-api`, `reporting-spa`. |
| **Client secret** | Generate strong, store in a secret manager. Rotate with overlap. |
| **Redirect URIs** | Exact match. One URI per line. Prefer `https` and a trailing path. |
| **Scopes** | Include `openid` for OIDC, then the minimum API scopes. |
| **Grant types** | `authorization_code` (+ `refresh_token` if the client is confidential). |
| **Response types** | `code` only. |
| **Token endpoint auth method** | `client_secret_basic` for confidential clients; `none` + PKCE for public clients. |
| **ID token signing alg** | `RS256` unless you have a reason. |
| **Access token type** | Usually inherited from the provider; override only with a reason. |

### Redirect URI rules

- Exact string match, including scheme, host, port, path and trailing slash.
- No wildcards. If you need many environments, register each one explicitly.
- A prefix whitelist (as in the BFF) must end with `/`, or `https://app.example.com.evil.tld` will match.
- Loopback redirects for native apps are a special case; follow the current best practice for your platform.
- Never register a URI you do not control. An open redirect on that host becomes a token leak.

### Confidential vs public clients

| | Confidential | Public |
|---|---|---|
| Example | Web app server, BFF, service | SPA, mobile app |
| Secret | Yes, server-side | No |
| PKCE | Recommended | Required |
| Refresh token | Allowed, server-side | Avoid; use a BFF or silent re-auth |
| Token endpoint auth | `client_secret_basic` / mTLS / private_key_jwt | `none` |

If a “public” client has a secret embedded in its bundle, it is not confidential; it is a leaked secret with extra steps.

### A worked registration: `bff-portal`

| Setting | Value |
|---|---|
| Client ID | `bff-portal` |
| Client secret | generated, stored in the BFF secret store |
| Redirect URI | `https://login.example.com/mg-local/portal/bff/callback` |
| Scopes | `openid profile orders.read` |
| Grant types | `authorization_code`, `refresh_token` |
| Response type | `code` |
| Auth method | `client_secret_basic` |
| PKCE | required, S256 |
| Access token type | JWT (or opaque if the API introspects) |
| Consent | first use |

Then create the RP configuration that points back at this provider:

| RP setting | Value |
|---|---|
| Name | `bff-portal-rp` |
| Remote Provider | the Local Provider above (discovery URL) |
| Client ID / secret | `bff-portal` / the same secret (or a dedicated RP secret) |
| Scopes | `openid profile orders.read` |
| Response type | `code` |
| Token endpoint auth | `client_secret_basic` |
| Redirect URI at the OP | the BFF callback above |

The BFF then references `bff-portal-rp` in its **RP Authentication** setting. The result is OneGate-as-RP talking to OneGate-as-OP. See [BFF](#/learn/05-bff).

## 4. Remote Providers (the other direction)

A Remote Provider describes an **external** OP or IdP that OneGate will consume as an RP. It is not used when OneGate issues tokens; it is used when OneGate accepts someone else’s.

| Setting | Notes |
|---|---|
| **Discovery URL** or manual metadata | Prefer discovery; pin the issuer and endpoints you expect. |
| **Client ID / secret** | Registered at the partner. |
| **Scopes** | `openid profile email`, plus partner-specific scopes. |
| **Response type** | `code`. |
| **Token endpoint auth** | Whatever the partner requires: Basic, POST, private_key_jwt, mTLS. |
| **Signing algorithms** | What the partner uses; validate `alg`, never accept `none`. |
| **Timeouts / TLS** | Sensible connect/read timeouts. Do not disable TLS verification in production. |
| **Attribute mapping** | Partner claims → local session/attributes. |

A Remote Provider is reusable: several RP configurations can point at the same partner with different client IDs and scopes.

## 5. The configuration order that avoids pain

1. Decide the **issuer** (host + realm) and never change it casually.
2. Create the **Local Provider**; verify discovery returns the expected endpoints.
3. Configure **Realm Settings** and the three attribute profiles.
4. Create **Remote Clients** for each application, with exact redirect URIs.
5. For browser apps, create the **RP Authentication** entry and point it at the provider.
6. For a BFF, create the BFF config and reference the RP.
7. For APIs, decide JWT vs opaque and configure validation accordingly.
8. Test with a real client, not just the admin UI: login, token exchange, API call, refresh, logout.
9. Document the issuer, client IDs, redirect URIs and scopes in your runbook.

## Common configuration mistakes

| Symptom | Likely setting |
|---|---|
| `redirect_uri mismatch` | Whitespace, trailing slash, `http` vs `https`, wrong realm, wrong host |
| `invalid_client` at `/token` | Secret rotated on one side only; wrong auth method; client disabled |
| Login works, API says `invalid_token` | API expects a different issuer/audience; JWKS stale; token is an ID token |
| Claims missing | Attribute profile does not include them; scope not granted; attribute source failed silently |
| Refresh fails after a while | Refresh lifetime shorter than session policy, or rotation reuse detection triggered |
| CORS errors from a SPA calling the token endpoint | The token endpoint is not a browser API; use a BFF or a public client flow |
| Consent loop | Consent required but the client does not preserve `state`, or cookies are blocked |
| SSO does not happen across apps | Different realms/hosts, or the session cookie is scoped too narrowly |

## Simulate it

- [BFF login](#/sim/bff-login) — Local Provider + Remote Client + BFF, with OneGate as OP and RP.
- [Client credentials](#/sim/client-credentials) — a machine client with no browser.
- [Multi-audience](#/sim/multi-audience) — scopes, audiences and resource indicators.
- [JWT vs opaque](#/sim/token-formats) — the Access Token Type setting in motion.

Next: [Federation: RP, SAML IdP and SAML SP](#/learn/04-federation-rp-saml).
