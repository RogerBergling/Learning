# Configuring the OneGate OpenID Provider

This chapter walks through the settings that make OneGate behave as an OpenID Provider: the **Local Provider**, the **Realm Settings** that decide what goes into tokens, and the **Remote Clients** that represent applications. Menu names follow the Administration Manual; labels differ slightly between versions, and the exact endpoint paths are generated for your deployment.

> All paths in this lab look like `https://login.example.com/mg-local/portal/...`. Treat them as illustrative. Always read your own discovery document.

## The object model

```
Local Provider (one per realm / virtual host)
├── Metadata + endpoints          ← generated; advertised via discovery
├── Provider Settings             ← access-token type, lifetimes, refresh behaviour
├── Key Settings                  ← RSA keys, x5c, thumbprints
├── Realm Settings                ← attribute profiles (what goes in tokens)
└── Remote Clients                ← one per application
      ├── client_id / client_secret
      ├── redirect_uris
      ├── scopes + response/grant types
      ├── signing algorithms
      ├── local properties for claims
      └── Access Token JWT audience settings

Remote Providers                  ← external OPs you consume as an RP
RP Authentication                 ← an RP configuration that points at a provider
```

If you remember one thing: **the Local Provider issues, the Remote Client describes the application, the Realm Settings decide the claims, and the RP consumes identity.** They are four different screens because they answer four different questions.

## 1. Local Providers

A Local Provider is OneGate acting as an OP for a realm. You create one per trust domain — for example `portal` for employees, `partner` for external users, `ops` for internal tools.

### General Settings

| Setting | What it does | Practical advice |
|---|---|---|
| **Description** | Descriptive name of the provider | Use the organisation’s name, not the protocol. |
| **Virtual Host Domain** | The host this provider is configured for | Must match the virtual host users actually reach. |
| **Realm** | Unique realm used to build the endpoint paths | Short, stable, lowercase. Changing it breaks every token and every registered redirect. |
| **Discovery URL** | Generated endpoint, visible after creation | Hand this to clients instead of hard-coding endpoints. |

The issuer is derived from host + realm. If your issuer changes, every API’s `iss` check fails. Plan it before production.

### Metadata

OneGate generates the metadata. The values the manual marks as required or recommended:

| Metadata field | Recommended value | Why |
|---|---|---|
| `issuer` | generated | The anchor every client and API validates. |
| `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri` | generated | Do not hand-edit these. |
| `scopes_supported` | `openid`, `profile`, `email`, plus your API scopes | Keep the list honest. |
| `response_types_supported` | `code` | The manual explicitly discourages implicit and hybrid flows. |
| `response_modes_supported` | `query`, `fragment` | Default recommended. |
| `grant_types_supported` | `authorization_code` | The manual documents the code flow. Client credentials and other grants are not described — confirm support in your version before relying on them. |
| `token_endpoint_auth_methods_supported` | `client_secret_basic` | Recommended method. |
| `token_endpoint_auth_signing_alg_values_supported` | `RS256` | Must support RS256. |
| `subject_types_supported` | `public` | Recommended; `pairwise` exists for privacy. |
| `id_token_signing_alg_values_supported` | `RS256` | Recommended. |
| `userinfo_signing_alg_values_supported` | `RS256` | Recommended. |
| `claim_types_supported` | `normal` | Default. |

**Advanced Settings** contains `code_challenge_methods_supported` (PKCE), `display_values_supported` (only `page` today) and `claims_supported`. The manual lists PKCE as a metadata capability, not as an enforcement switch — do not assume a “PKCE required” checkbox exists on every version.

The discovery URL is usually:

```
https://login.example.com/mg-local/portal/.well-known/openid-configuration
```

Use it in clients and RPs instead of hard-coding endpoints. If discovery is unreachable, the RP cannot start; that is a deployment dependency worth monitoring.

### Provider Settings

| Setting | Options | Effect |
|---|---|---|
| **Access Token Type** | `opaque` or `jwt` | JWT lets APIs validate locally; opaque requires introspection where the deployment provides it. See [JWT vs opaque](#/sim/token-formats). |
| **Access Token Lifetime (min)** | e.g. 5–15 | Shorter limits damage; longer reduces refresh traffic. |
| **ID Token Lifetime (min)** | e.g. 5–60 | It proves a login; it is not a session. |

#### Refresh token

| Setting | What it does |
|---|---|
| **Refresh token lifetime (min)** | How long a specific refresh token is valid. |
| **Refresh token total lifetime (min)** | How long the set of refresh tokens is valid; measured from the initial token when update is enabled. |
| **Refresh token max idle (min)** | How long a refresh token can go unused. |
| **Update refresh token** | Issues a new refresh token at the refresh endpoint and invalidates the old one. |
| **Reuse detection** | Checks that the token used is the latest issued. Reuse of an old token should invalidate the whole set and force a new login. |
| **Reuse grace period (sec)** | Allows a short reuse window when a client sends overlapping refresh requests. |
| **Issue id token** | Whether the refresh endpoint may issue a new ID token. |

A useful default for a BFF: JWT or opaque access tokens at 10–15 minutes, ID token 15 minutes, refresh token 8 hours with **Update refresh token** and **Reuse detection** on, and a short **Reuse grace period** for mobile/network retries.

### Key Settings

The OP signs ID tokens (and JWT access tokens) with a private key. Clients and APIs fetch the public keys from `jwks_uri` and select by `kid`.

| Setting | Notes |
|---|---|
| **RSA Key Size** | 2048, 3072 or 4096. Default 2048. |
| **x5c Certificate** | An externally configured certificate (with private key) to embed in the JWK. Takes priority over self-signed settings. |
| **No EdDSA key** | Disable Ed25519/OKP keys for clients that cannot use them. |
| **No EC key** | Disable elliptic-curve signing and encryption keys. |
| **No encryption keys** | Disable keys with `key use = enc`. |
| **x5c Self-Signed** | Generate a self-signed certificate; requires Subject and Validity (days). |
| **Regenerate x5c on rotate** | Generate a new certificate on each key rotation, or retain the previous one. |
| **Include x5t / x5t#S256** | Add the SHA-1 / SHA-256 certificate thumbprints to the JWK. |

The manual exposes **No EdDSA key**, **No EC key** and **No encryption keys** because OneGate can generate those key types by default. Disable them only when your clients cannot consume them; they are not a substitute for RSA/RS256, which the metadata requires. Operational rules still apply:

- Publish **all** keys that may still have valid tokens, not just the newest.
- Rotate with overlap: new key published → new tokens signed with it → old key removed only after the maximum token lifetime.
- APIs must refresh JWKS when they see an unknown `kid`, not just on a timer.
- Never let a client disable signature validation “because it is internal”.

## 2. Realm Settings and attribute profiles

Realm Settings bind the provider to a virtual host and decide **which claims go into which token**. This is where OneGate stops being a generic OAuth server.

| Setting | Applies to | Typical claims |
|---|---|---|
| **Default Attribute Profile** | UserInfo / token introspection | `sub`, `preferred_username`, `name`, `email` |
| **Access Token Attribute Profile** | A JWT access token | `sub`, `scope`, `client_id`, roles, entitlements |
| **ID Token Attribute Profile** | The ID token | `sub`, `auth_time`, `acr`, `amr`, `nonce`, name/email if the client needs them |

Two principles:

1. **Keep access tokens lean.** Every claim is copied to every API and every log line. Put entitlements the API enforces in the token; put display data in UserInfo or the ID token.
2. **Prefer mapping over computing.** Attribute profiles can call simple functions (`function:substring(...)` appears in the manual’s own example), but complex derivation belongs in an attribute source. Map the result rather than relying on a client to send it.

A claim entry often looks like a `PARM{...}` reference:

```
PARM{mguid}
PARM{prop-oidc.realm.userinfo.email}
PARM{attr-0.attributes.department}
PARM{oidcclient.sub}
```

The manual’s own example scope profile:

```
birthdate: function:substring(PARM{certuserid},0,8)
given_name: PARM{givenname}
family_name: PARM{surname}
name: PARM{givenname} PARM{surname}
```

The exact parameter namespace is deployment-specific; the pattern is stable: **profile entry → parameter reference → value from user store, federation response or attribute source.**

### Scopes and claims

- A client requests scopes; the OP decides which claims those scopes release.
- The manual is explicit: **every claim must be mapped in the Attribute Profiles to return a value.** Adding a claim to a scope without mapping it returns nothing.
- Custom scopes can be enforced by the API and can also gate custom claims via **Custom Claims** (add a claim to an existing or new scope).
- Do not put a claim in a token just because it is easy. A JWT is readable by anyone who sees it.
- If a claim changes often (entitlements, department), prefer short token lifetimes or introspection over a long-lived JWT snapshot.

## 3. Remote Clients

A Remote Client is an application registered at the Local Provider. One entry per app, even if two apps share a codebase.

### Fields documented by the manual

| Field | Notes |
|---|---|
| **Description** | Descriptive name of the client. |
| **redirect_uris** | Comma-separated whitelist. The incoming `redirect_uri` is matched against it. |
| **scope** | Space-separated allowed scopes/claims. `openid` is mandatory. |
| **response_types** | Use `code`; implicit and hybrid are discouraged. |
| **grant_types** | `authorization_code` is required for the code flow. |
| **token_endpoint_auth_signing_alg** | Recommended `RS256`. |
| **client_id** | Sent in the authentication request. |
| **client_secret** | The client authenticates with `client_id` + `client_secret`. |
| **id_token_signed_response_alg** | Recommended `RS256`. |
| **userinfo_signed_response_alg** | Recommended `RS256`. |
| **Local properties for claims** | Values available as `PARM{oidcclient.NAME}` during claim evaluation. |
| **Session Properties** | Additional attributes for the session. |
| **Access Token JWT** | `Default resource (aud)`, `Allowed resources from parameter`, `Resource indicator from scope`. |

The manual does **not** document a `token_endpoint_auth_method = none` public-client option. If you need a public SPA, confirm what your version supports; the BFF exists precisely so that browser apps do not need a secret.

### Redirect URI rules

- The whitelist is a **crucial security feature**. Prefer literal, exact URIs.
- Wildcards (`*`) are possible, but the configured value must still contain a scheme and a domain. The manual’s dangerous example is `https://*/somepath` — do not do this.
- A wildcard must be scoped as tightly as possible: `https://*.domain.com/somepath`, not `https://*`.
- The **BFF** uses a different rule: its **Client Redirect URIs** are matched against the **beginning** of the requested `redirect_uri` (a prefix whitelist). Do not confuse the two screens.
- Never register a URI you do not control. An open redirect on that host becomes a token leak.

### Confidential vs public clients

| | Confidential | Public |
|---|---|---|
| Example | Web app server, BFF, service | SPA, mobile app |
| Secret | Yes, server-side | No |
| Token endpoint auth | `client_secret_basic` (recommended); `client_secret_post` where supported | Not documented as `none` in the manual |
| Refresh token | Allowed, server-side | Avoid; use a BFF or silent re-auth |

If a “public” client has a secret embedded in its bundle, it is not confidential; it is a leaked secret with extra steps. See [Client types: SPA, mobile, native, BFF, web app, service](#/learn/02-oidc-basics) for the full decision table.

### Local properties and per-client claims

**Local properties for claims** solve the “two clients, different values” problem. Add a property to the client and reference it as `PARM{oidcclient.NAME}` in an attribute profile. The manual’s examples:

- Client 1 wants `sub` to be the user’s email: add local property `sub = PARM{email}`, then map `sub = PARM{oidcclient.sub}`.
- Client 2 wants `sub` to be the username: add local property `sub = PARM{mguid}`.
- A REST attribute source needs the client name as its `audience`: add local property `name`, then set the source’s **Audience** to `PARM{oidcclient.name}`.

### Microsoft Entra External Authentication Method (EAM)

The manual includes a **Microsoft Entra** section on the Remote Client:

| Setting | What it does |
|---|---|
| **UserId Claim** | The claim in the `id_token_hint` from Entra used to identify the user |
| **UserId Local Parameter** | The local user parameter compared with that claim |
| **Pre-selected Identity Claim** | An optional claim (for example SSN) requested when using a CC Providers method |
| **acr** | The authentication context class returned after login |
| **amr** | The authentication methods reference returned after login; can be a comma-separated list |

This is special handling for Entra’s External Authentication Method, not the general RP configuration. See [Federation](#/learn/04-federation-rp-saml) for the RP flow.

### Access Token JWT audience

When **Access Token Type** is JWT, the **Access Token JWT** section controls `aud`:

| Setting | Meaning |
|---|---|
| **Default resource (`aud`)** | Comma-separated audience list; overrides the default `client_id`. |
| **Allowed resources from parameter** | Audiences a client may request with the `resource` parameter (URL-encoded). |
| **Resource indicator from scope** | Derive the audience from requested scopes. |

### A worked registration: `bff-portal`

| Setting | Value |
|---|---|
| Description | `BFF portal client` |
| Client ID | `bff-portal` |
| Client secret | generated, stored in the BFF secret store |
| redirect_uris | the RP callback, e.g. `https://login.example.com/mg-local/portal/rp/callback` (illustrative) |
| scope | `openid profile orders.read` |
| grant_types | `authorization_code` (and `refresh_token` if the BFF renews) |
| response_types | `code` |
| token_endpoint_auth_signing_alg | `RS256` |
| id_token_signed_response_alg | `RS256` |

**Access Token Type** is a **Local Provider → Provider Settings** choice, not a per-client field. If it is JWT, the client’s **Access Token JWT** section only controls the audience.

Then create the RP configuration that points back at this provider:

| RP setting | Value |
|---|---|
| Description | `bff-portal-rp` |
| Unique Name | `bff-portal-rp` |
| Remote Provider | the Local Provider above (discovery URL) |
| client_id / client_secret | `bff-portal` / the same secret |
| scope | `openid profile orders.read` |
| response_types | `code` |
| token_endpoint_auth_method | `client_secret_basic` |

The BFF then references `bff-portal-rp` in its **RP Authentication** setting. The result is OneGate-as-RP talking to OneGate-as-OP. See [BFF](#/learn/05-bff).

## 4. Remote Providers (the other direction)

A Remote Provider describes an OP that OneGate consumes as an RP. It is normally an external OP, but it can also point at OneGate’s own Local Provider — that is how the BFF performs its self-federation. It is not the object that issues tokens; it is the trust/endpoint description the RP uses to reach an issuer.

| Setting | Notes |
|---|---|
| **Description** | Name shown in the UI. |
| **Manually configured / Use Discovery URL** | Discovery is easier; manual metadata is more explicit. |
| **Connect / Read Timeout (ms)** | Fail fast rather than hang user logins. |
| **Skip SSL check** | Keep off in production. |
| **Discovery URL** | Usually `issuer + /.well-known/openid-configuration`. |
| **Manual Metadata** | `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, `subject_types_supported` (`public` or `pairwise`). |

A Remote Provider is reusable: several RP configurations can point at the same partner with different client IDs and scopes. The RP’s own fields — scope, response types, `token_endpoint_auth_method`, client ID/secret, `id_token_signed_response_alg`, `prompt`, local user handling and session properties — are covered in [Federation](#/learn/04-federation-rp-saml).

## 5. The configuration order that avoids pain

1. Decide the **issuer** (host + realm) and never change it casually.
2. Create the **Local Provider**; verify discovery returns the expected endpoints.
3. Configure **Provider Settings**, **Refresh token** and **Key Settings**.
4. Configure **Realm Settings** and the three attribute profiles.
5. Create **Remote Clients** for each application, with a tight redirect whitelist.
6. For browser apps, create the **RP Authentication** entry and point it at the provider.
7. For a BFF, create the BFF config and reference the RP.
8. For APIs, decide JWT vs opaque and configure validation accordingly.
9. **Activate Changes** — configuration is not live until you do.
10. Test with a real client, not just the admin UI: login, token exchange, API call, refresh, logout.
11. Document the issuer, client IDs, redirect URIs and scopes in your runbook.

## Common configuration mistakes

| Symptom | Likely setting |
|---|---|
| `redirect_uri mismatch` | Whitespace, trailing slash, `http` vs `https`, wrong realm, wrong host, or a wildcard that does not match |
| `invalid_client` at `/token` | Secret rotated on one side only; wrong auth method; client disabled |
| Login works, API says `invalid_token` | API expects a different issuer/audience; JWKS stale; token is an ID token |
| Claims missing | Attribute profile does not include them; scope not granted; attribute source failed silently |
| Refresh fails after a while | Refresh lifetime shorter than session policy, or reuse detection triggered |
| Change had no effect | **Activate Changes** was not pressed, or you edited the wrong virtual host |
| CORS errors from a SPA calling the token endpoint | The token endpoint is not a browser API; use a BFF or a public client flow |

## Simulate it

- [Control Center setup](#/sim/control-center-setup) — where every setting lives, then Activate Changes.
- [BFF login](#/sim/bff-login) — Local Provider + Remote Client + BFF, with OneGate as OP and RP.
- [Client credentials](#/sim/client-credentials) — a machine client with no browser (generic OAuth; the manual does not describe this grant).
- [Multi-audience](#/sim/multi-audience) — scopes, audiences and resource indicators.
- [JWT vs opaque](#/sim/token-formats) — the Access Token Type setting in motion.

Next: [Federation: RP, SAML IdP and SAML SP](#/learn/04-federation-rp-saml).
