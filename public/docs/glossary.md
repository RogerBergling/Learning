# Glossary

Every acronym in this lab, in plain language. Terms that have a simulation link to one.

## A–C

**Access token** — the credential an API accepts. Carries (or points to) the subject, scope and audience. Short-lived. [JWT vs opaque](#/sim/token-formats).

**Access Control List (ACL)** — the allow/deny rules on a OneGate **Web Resource**. They can match group, IP address, date/time and authentication method, and are evaluated before the request reaches the protected app.

**ACS (Assertion Consumer Service)** — the SAML SP endpoint that receives the assertion by POST. Must match the `Destination` and be registered at the IdP.

**Activate Changes** — the maintenance action that makes saved configuration live. **Reload configuration** applies it without logging users out; **Reindex files** is needed after changing files under `server/`; **Restart service** is the heavy option. Nothing you configure is live until you activate it.

**`acr` (Authentication Context Class Reference)** — a claim/request value describing *how* the user authenticated (password, MFA, hardware key). Used for step-up.

**Actor (`act` claim)** — in delegation, who is acting on behalf of the subject. `sub = customer, act = agent` preserves accountability. [BFF exchange](#/sim/bff-exchange). In a REST attribute request the actor is an object: `{ "subject": "..." }`.

**`amr` (Authentication Methods References)** — the methods actually used, e.g. `pwd`, `mfa`, `otp`.

**Assertion** — a signed SAML statement about a subject, containing authentication and attribute statements. The SAML analogue of an ID token.

**Automatic registration** — an OpenID Federation mode where the RP’s `client_id` is its Entity Identifier and the OP resolves the RP’s trust chain and metadata itself. No manual client registration or client secret; the RP authenticates with `private_key_jwt` or another asymmetric method. [OpenID Federation](#/learn/12-openid-federation).

**Attribute profile** — the mapping that turns `PARM{...}` values into claims for the access token, ID token or UserInfo. A claim that is not mapped returns nothing. See [Realm Settings](#/learn/03-onegate-local-provider).

**Attribute source** — the manual’s name for an LDAP, REST or Graph API service that OneGate calls to enrich an authenticated subject. Configured under **Authentication → Attribute Sources**; a REST source receives `realm`, `subject`, `actor`, `requested_attributes` and optional `ext`. [Attribute sources](#/learn/06-attribute-providers).

**Audience (`aud`)** — the intended recipient of a token. An API must reject a token whose `aud` does not include it. [Multi-audience](#/sim/multi-audience).

**Authorization code** — a short-lived, single-use credential returned to the client, exchanged on the back channel for tokens.

**Authorization server / OP** — the component that authenticates the user and issues tokens. In this lab: OneGate Local Provider or a partner IdP.

**BFF (Backend for Frontend)** — a server-side tier that holds tokens and gives the browser only an HttpOnly cookie. [BFF login](#/sim/bff-login).

**BFF cookie** — the opaque session pointer set by OneGate’s BFF (`SameSite` + `HttpOnly`). The browser sends it on each request; OneGate validates it and attaches a bearer access token server-side. It contains no claims, so it is not a token.

**Bearer token** — any token where possession is enough. Access tokens are bearer credentials; protect them in transit and at rest.

**Claim** — a fact in a token or assertion, e.g. `sub`, `email`, `department`, `scope`.

**Client** — the application requesting tokens. Confidential clients can keep a secret; public clients cannot.

**Client credentials** — an OAuth grant where a service authenticates as itself, with no user. [Client credentials](#/sim/client-credentials).

**Client secret** — a shared credential for a confidential client. Never in a browser, never in git. Rotate with overlap.

**Code challenge / verifier** — the PKCE pair. The challenge (hash) goes in the authorization request; the verifier goes in the token request.

**Consent** — the user’s permission for a client to receive scopes/claims. Can be none, first-use or every time.

**CORS** — a browser rule controlling cross-origin reads. It is not authentication, and it does not protect APIs from non-browser clients.

**CSRF (Cross-Site Request Forgery)** — an attack that makes the user’s browser send an authenticated request. Defended with `SameSite`, CSRF tokens and origin checks.

## D–J

**Discovery** — the `.well-known/openid-configuration` document listing endpoints, algorithms, scopes and claims. Prefer it over hard-coded URLs.

**Entity Configuration (EC)** — a self-issued OpenID Federation Entity Statement at `/.well-known/openid-federation`, with `iss = sub`, federation keys, `authority_hints` and typed metadata.

**Entity Identifier** — the globally unique `https` URL that identifies an OpenID Federation entity. It has no query or fragment and becomes the `client_id` in automatic registration.

**Entity Statement** — a signed JWT used by OpenID Federation: either an Entity Configuration (about itself) or a Subordinate Statement (about a subordinate).

**EntityID** — the unique identifier of a SAML IdP or SP. Usually a URI; it does not have to resolve.

**Explicit registration** — an OpenID Federation fallback: the RP POSTs its Entity Configuration or trust chain to the OP’s `federation_registration_endpoint` and receives a normal client registration. [OpenID Federation](#/learn/12-openid-federation).

**Federation** — trusting an external identity provider or service provider. OneGate can be RP, SAML IdP or SAML SP. [Federation chapter](#/learn/04-federation-rp-saml). **OpenID Federation** is a separate JWT-based trust framework: see [chapter 12](#/learn/12-openid-federation).

**Federation Entity Key** — the key that signs OpenID Federation Entity Statements and trust marks. It is deliberately separate from the protocol keys that sign OIDC messages.

**Grant type** — the OAuth flow used at the token endpoint: `authorization_code`, `refresh_token`, `client_credentials`, or token exchange. The manual documents the code flow and refresh; the others are generic OAuth patterns to confirm in your deployment.

**ID token** — an OIDC JWT proving authentication to the **client**. Audience is the client ID. Never an API credential.

**IdP (Identity Provider)** — the system that authenticates users. In SAML, the party issuing assertions.

**Introspection** — a back-channel call that asks the OP whether an opaque token is active and what it means.

**Issuer (`iss`)** — the OP’s identifier. Must be compared exactly; a prefix match is a vulnerability.

**JWT (JSON Web Token)** — three base64url parts: header, payload, signature. Readable, signed, not encrypted by default.

**JWKS (JSON Web Key Set)** — the public keys used to verify JWT signatures. Cache it; refresh on an unknown `kid`.

**`jti` (JWT ID)** — a unique token identifier, useful for correlation and replay caches.

## K–P

**`kid` (Key ID)** — identifies which key signed a JWT. Used to select from JWKS.

**Metadata** — SAML’s XML description of an IdP/SP: endpoints, certificates, bindings, NameID formats. In OpenID Federation, metadata is typed JSON inside an Entity Statement.

**Metadata policy** — OpenID Federation rules (`value`, `add`, `default`, `one_of`, `subset_of`, `superset_of`, `essential`) applied to metadata along the trust chain.

**mTLS (mutual TLS)** — client certificate authentication. Strong client authentication without a shared secret.

**NameID** — the SAML subject identifier. Common formats are `persistent`, `transient`, `emailAddress` and `unspecified`; the format is configurable. Agree with the SP.

**Nonce** — a random value sent in the authorization request and embedded in the ID token; the client checks it to prevent replay.

**OAuth 2.0** — the delegation framework. Answers “may this client call this API for this user?”.

**OIDC (OpenID Connect)** — identity layer on OAuth 2.0. Adds the ID token, `openid` scope, UserInfo and discovery.

**OpenID Federation 1.0** — a JWT-based trust framework for entity statements, trust anchors and trust chains. It is not the same as OIDC/SAML federation. [Chapter 12](#/learn/12-openid-federation).

**Opaque token** — a random string with no readable claims. The API introspects it. Revocation is immediate; validation costs a round trip.

**OP (OpenID Provider)** — the OIDC authorization server. OneGate Local Provider is an OP.

**PARM** — OneGate’s parameter reference syntax used in attribute profiles and session properties, e.g. `PARM{mguid}` or `PARM{attr-0.attributes.department}`.

**PKCE (Proof Key for Code Exchange)** — binds an authorization code to a verifier held by the client. Required for public clients. [SPA PKCE](#/sim/spa-pkce).

**Private key JWT** — client authentication where the client signs an assertion instead of sending a secret.

**Public client** — a client that cannot keep a secret (SPA, mobile app). Uses PKCE and no client secret. The manual does not document a `token_endpoint_auth_method = none` option, so verify public-client support; the BFF exists so browser apps do not need one.

## R–S

**Realm** — a trust/configuration domain. Appears in paths (`/mg-local/{realm}/...`) and in `iss`.

**Redirect URI** — where the OP sends the browser after authorization. On a **Remote Client** it must match the comma-separated `redirect_uris` whitelist; on a **BFF** the **Client Redirect URIs** are matched against the **beginning** of the requested URI.

**Refresh token** — a long-lived credential for obtaining new access tokens. Server-side only; rotate on every use; detect reuse. [Refresh rotation](#/sim/refresh-rotation).

**RP (Relying Party)** — the OIDC client that consumes an ID token. OneGate can be an RP towards a partner or towards itself.

**SAML 2.0** — XML-based federation for authentication and attributes. Uses assertions, metadata, bindings and XMLDSig.

**Subordinate Statement (SS)** — an OpenID Federation statement issued by a Trust Anchor or Intermediate about an immediate subordinate: `iss`, `sub`, subject federation keys, optional metadata/policy/constraints. [OpenID Federation](#/learn/12-openid-federation).

**Scope** — a permission string requested by the client and enforced by the API, e.g. `orders.read`.

**SLO (Single Logout)** — SAML logout that ends the session at the IdP and SPs. Often partial in practice.

**SP (Service Provider)** — the SAML application consuming assertions.

**SSO (Single Sign-On)** — reusing one authenticated session across apps. Depends on cookies and a shared session store.

**State** — a client-generated value echoed in the authorization response; defends against login CSRF and mix-ups.

**Subject (`sub`)** — the identifier of the entity a token is about. Stable per issuer; not necessarily an email.

## T–Z

**Token exchange** — trading a token for another with a different audience, subject or actor. Used for delegation and audience narrowing.

**Trust Anchor (TA)** — the root of an OpenID Federation trust chain. Its federation key is pinned out-of-band; it issues Subordinate Statements and publishes a fetch endpoint. [OpenID Federation](#/learn/12-openid-federation).

**Trust Chain** — the sequence of OpenID Federation statements from a leaf Entity Configuration through Subordinate Statements to a Trust Anchor’s Entity Configuration. It expires at the earliest `exp`.

**Trust Mark** — a signed JWT issued by a Trust Mark Issuer to assert an accreditation or conformance; separate from the trust chain.

**UserInfo** — the OIDC endpoint returning claims about the authenticated user, called with an access token.

**Virtual host** — the public hostname OneGate serves for a provider/BFF. Affects issuer, cookies and redirect URIs.

**Virtual Host Selector** — the Control Center control at the top left that chooses which virtual host you are editing. Almost every setting is scoped to it, and configuring the wrong host is a classic “my change did nothing” cause.

**Web Resource** — OneGate’s reverse-proxy object for publishing an internal application. Its **Authentication type** (normally **Normal**), **Access Control List** and **Advanced → Send Custom Headers** replace any idea of a special resource-SSO mode. [Legacy proxy SSO](#/sim/legacy-proxy-sso).

**XMLDSig** — the XML signature standard used by SAML. Validation includes canonicalisation, which is why “the XML looks the same” is not enough.

**Zero-trust** — the assumption that no network location is inherently trusted; every request is authenticated and authorised. A useful lens for proxy and BFF designs.

---

Missing a term? The [OIDC basics](#/learn/02-oidc-basics) and [tokens](#/learn/07-tokens-and-lifecycle) chapters explain most of these in context.
