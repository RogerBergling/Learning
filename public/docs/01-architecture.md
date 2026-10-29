# The big picture

Most confusion about OneGate comes from treating it as one thing. It is a **product with several protocol roles**, and the role that matters changes from hop to hop. Once you can name the role for a given request, the settings stop looking arbitrary.

This chapter builds the map. The rest of the lab fills it in.

## One request, five possible jobs

Imagine a user opening `https://app.example.com/orders`. Depending on how the deployment is configured, OneGate might, in that single request:

1. **Terminate the TLS connection and act as a reverse proxy** for the SPA or the legacy app.
2. **Check a BFF session cookie** and decide whether the user is logged in.
3. **Redirect to an OpenID Provider** — possibly its own Local Provider — using an ordinary Authorization Code flow.
4. **Act as a Relying Party** that validates the resulting ID token and maps the subject to a local user.
5. **Attach an access token** to the API call, or **exchange** it for a token with a different audience.

Those are five different roles. The same binary performs all of them, but each role has its own configuration section and its own trust boundary. You debug faster when you ask “which role is failing?” rather than “why is OneGate broken?”.

## The topology

```
        untrusted                              trusted network
 ┌──────────────────┐        ┌──────────────────────────────┐        ┌─────────────────┐
 │                  │        │            OneGate           │        │                 │
 │  Browser / user  │───────▶│  proxy · OP · RP · BFF       │───────▶│ Frontend server │
 │                  │◀───────│  token handler · attr client │◀───────│ (SPA host / app)│
 └──────────────────┘        └───────┬──────────────┬───────┘        └─────────────────┘
         │                           │              │
         │                    ┌──────▼──────┐  ┌────▼─────────┐
         │                    │ Local OP    │  │ Backend API  │
         │                    │ (issues)    │  │ (validates)  │
         │                    └─────────────┘  └──────────────┘
         │                           │
         │                    ┌──────▼──────────────┐
         └───────────────────▶│ Partner IdP / SP    │
              federation      │ Entra · SAML · OIDC │
                              └─────────────────────┘
```

Read it left to right:

- **Left of OneGate** is the browser. Treat everything there as hostile: JavaScript, extensions, the user, the network. A value that reaches the browser is public.
- **OneGate in the middle** is the policy and protocol boundary. It holds sessions, codes, tokens, keys and attribute caches.
- **Right of OneGate** are the systems that trust it: the frontend tier, the APIs, and — in federation — partner identity providers and service providers.

The diagram is also the answer to “where does the token live?”. Tokens are created and consumed in the middle, presented to APIs on the right, and should almost never be stored on the left.

## The five roles in detail

| Role | What it means | Where you configure it | Typical symptom when it is wrong |
|---|---|---|---|
| **Reverse proxy** | OneGate owns the public hostname and forwards requests to an internal app. As a **Web Resource** it can inject configured custom headers, and an **Access Control List (ACL)** decides who gets through. | Web Resource, Advanced → Send Custom Headers, Access Control List | 502/504, redirect loops, app sees no user, spoofable headers |
| **OpenID Provider (OP)** | OneGate authenticates the user and issues codes, access tokens, ID tokens and refresh tokens. | Local Providers, Realm Settings, Remote Clients | `invalid_client`, `redirect_uri mismatch`, wrong claims, `invalid_token` at the API |
| **Relying Party (RP)** | OneGate consumes someone else’s identity — a partner OP, a SAML IdP, or its own Local Provider. | RP Authentication, Remote Providers, local user handling | `invalid ID token`, unknown user, duplicate accounts, clock skew |
| **Backend for Frontend (BFF)** | OneGate keeps the browser token-free: HttpOnly cookie in, server-side tokens out. | BFF realm settings, RP Authentication, Local Provider, Remote Client | Cookie not sent, CSRF 403, callback mismatch, login loop |
| **Token handler** | Issues, validates and exchanges tokens for clients and APIs. Introspection and revocation exist only where the deployment provides them: the Administration Manual documents issuing, refresh, exchange and key settings, but not an introspection or revocation endpoint. | Local Provider token settings, scopes, audiences, signing keys | API accepts the wrong audience, revocation is delayed, JWKS fetch fails |

A single scenario can use all five. The flagship [BFF login](#/sim/bff-login) does: proxy for the SPA, BFF for the session, OP to issue, RP to consume, token handler for the API.

## The most surprising part: OneGate talks to itself

In the BFF flow, the BFF needs tokens. It does not mint them through a private shortcut. It delegates to an **RP Authentication** configuration, and that RP has a **Remote Provider** whose endpoints are OneGate’s own Local Provider.

```
BFF ──uses──▶ RP configuration ──remote provider──▶ OneGate Local Provider
        ▲                                                    │
        └──────────────── code + tokens ─────────────────────┘
```

Why do it this way?

- **One implementation.** The same code path is exercised whether the RP points at OneGate, Entra, Okta or a partner. A bug in federation is a bug in local login, and tests catch it.
- **No special cases.** The token endpoint still requires `client_id` + `client_secret`, a whitelisted redirect URI and a single-use code — plus PKCE where the deployment enables it.
- **Swappable identity.** Changing “log in locally” to “log in through the partner” is a configuration change on the RP, not a rewrite of the BFF.

This is why the simulator draws wires between `OneGate · BFF`, `OneGate · RP` and `OneGate · OP` that loop back into the same box. It looks odd because we usually draw identity providers as separate companies. Architecturally, it is just an RP talking to an OP that happens to share a process boundary.

## Trust boundaries, in one table

| Boundary | What may cross | What must not cross |
|---|---|---|
| Browser → OneGate | Cookies, authorization codes, `state`, `nonce`, PKCE verifier/challenge, form posts | Access tokens (except SPA patterns), refresh tokens, client secrets, SAML assertions outside the defined binding |
| OneGate → frontend | Identity headers, a proxied request, a bearer token if the frontend is the resource | Raw partner tokens with a foreign issuer, debug dumps |
| OneGate → backend API | A bearer token with the right `aud`, or validated claims if it is a trusted proxy | A token minted for a different audience, a user-controlled `Authorization` header |
| OneGate ↔ partner IdP | Authorization requests/responses, assertions, metadata, JWKS | Local session cookies, local refresh tokens |
| OneGate ↔ attribute source | For a REST source: a request with `realm`, `subject`, `actor`, `requested_attributes`, `ext`; with **Include Access Token**, a JWT with the configured `iss`/`aud`/`sub`. LDAP/Graph sources use their own protocols. | The user’s refresh token, the client secret of an unrelated app |

Write these down for your own deployment. Most “mysterious” 401s are a credential that crossed a boundary it was never supposed to cross.

## Which shape are you deploying?

The roles combine into a few common architectures:

1. **Proxy in front of a legacy app.** OneGate owns the hostname, handles normal authentication, enforces an ACL, injects configured custom headers. The app keeps its old code. See [legacy proxy SSO](#/sim/legacy-proxy-sso).
2. **BFF in front of a SPA.** Browser gets a cookie, OneGate gets the tokens, APIs get bearer tokens. See [BFF login](#/sim/bff-login).
3. **Confidential web app.** The app server itself is the client; OneGate is the OP. See [confidential web app](#/sim/webapp-confidential).
4. **Federation hub.** OneGate is RP towards partners and OP towards your apps. See [inbound federation](#/sim/fed-oidc-inbound).
5. **SAML bridge.** OIDC on one side, signed XML on the other. See [SAML IdP](#/sim/fed-saml-idp) and [SAML SP](#/sim/fed-saml-sp).
6. **Attribute enrichment layer.** Tokens carry entitlements resolved at issuance from a REST, LDAP or Graph attribute source. See [attribute sources](#/sim/attr-rest).

Real deployments mix these. A single OneGate installation can proxy three legacy apps, serve BFF login for two SPAs, federate with a partner, and act as a SAML IdP for a SaaS product — with separate realms and clients for each.

## What the simulator is, and is not

The stage is a fixed topology: browser on the left, OneGate in the middle, frontend/API/partner on the right. Each step is one hop. The **live token vault** shows which credentials exist in which store *after that hop*. The **Tokens** tab lets you inspect the simulated values; the **Wire** tab shows the HTTP shape; the **Setup** tab lists the OneGate settings that would produce this behaviour.

It is not a real protocol implementation. Tokens are structurally valid JWTs with fake signatures, so you can decode the header and payload, but no cryptography happens. Endpoint paths are illustrative; your OneGate deployment generates its own under `/mg-local/{realm}/...` or a configured virtual host.

> **The one rule to remember:** the browser is not a confidential client. Every design that respects that rule is easier to secure; every design that fights it eventually loses.

## Where to go next

- [Control Center setup](#/sim/control-center-setup) — the manual’s map of where every object is configured, and Activate Changes.
- [OIDC & OAuth 2.0, the parts you need](#/learn/02-oidc-basics) — the protocol vocabulary.
- [Configuring the OneGate OpenID Provider](#/learn/03-onegate-local-provider) — the settings behind the roles.
- [Federation: RP, SAML IdP and SAML SP](#/learn/04-federation-rp-saml) — OIDC/SAML federation.
- [OpenID Federation](#/learn/12-openid-federation) — the JWT trust framework, distinct from OIDC federation.
- [Scenario catalog](#/learn/09-scenario-catalog) — every simulation in one table.
