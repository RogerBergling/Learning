# Federation: RP, SAML IdP and SAML SP

OneGate is most useful in the middle of other people’s protocols. This chapter covers the three federation directions:

1. **Inbound OIDC** — OneGate is the Relying Party for a partner OP.
2. **Outbound SAML** — OneGate is the SAML Identity Provider for a partner SP.
3. **Inbound SAML** — OneGate is the SAML Service Provider for a partner IdP.

They share one idea: **normalise the external identity into a local identity**, then keep using OneGate’s own sessions and tokens internally.

```
Inbound OIDC:    Partner OP ──ID token──▶ OneGate RP ──local session──▶ proxied app
Inbound SAML:    Partner IdP ──assertion─▶ OneGate SP ──local session──▶ proxied app
Outbound SAML:   OneGate IdP ──assertion─▶ Partner SP
```

## 1. OneGate as Relying Party (inbound OIDC)

This is the configuration used by [BFF with a partner IdP](#/sim/bff-thirdparty) and [federation in](#/sim/fed-oidc-inbound).

### The trust setup

At the partner:

- register OneGate as a client;
- whitelist OneGate’s redirect URI exactly;
- grant the scopes you need;
- agree on the client authentication method.

At OneGate:

- create a **Remote Provider** pointing at the partner’s discovery document (or manual metadata);
- create an **RP → Authentication** entry that uses that provider;
- decide how partner users map to local users;
- attach the RP to the BFF or the proxied resource that should use it.

### RP settings that matter

| Setting | What it controls | Advice |
|---|---|---|
| **Remote Provider** | Where the RP sends the authorization request | Prefer discovery; verify the issuer |
| **Client ID / secret** | How OneGate authenticates at the partner token endpoint | Store the secret in a secret manager |
| **Scopes** | What identity data you ask for | Minimum: `openid profile email` only if you use email |
| **Response type** | `code` | Never implicit |
| **Token endpoint auth** | Basic, POST, private_key_jwt, mTLS | Match the partner exactly |
| **PKCE** | Whether OneGate sends a verifier | Use it if the partner supports it |
| **Signing algs** | What ID token signatures you accept | Pin to what the partner actually uses |
| **Clock leeway** | Tolerance for `exp`/`nbf` | 60–120 s; more hides real problems |
| **Local user handling** | How `sub`/email maps to a local user | Decide before go-live |
| **Handle unknown users** | Reject / Allow / No user db check | Reject is the safe default |
| **Session Properties** | Copy values into the local session | Use `PARM{...}` references |
| **Logout / post-logout URL** | Where to go after RP logout | Coordinate with the partner |

### Local user mapping

The partner’s `sub` is stable **for that partner**, not for you. You need a local key.

Three patterns:

| Pattern | How | Risk |
|---|---|---|
| Map on email | `Custom User Id attribute = email` | Email changes create a new person or lock someone out |
| Map on a custom attribute | Store `partnerObjectId` on the local user and match on it | Requires a provisioning step |
| Just-in-time provisioning | Create a local user on first login | Anyone the partner authenticates gets an account; needs policy |

Recommended: map on a stable partner identifier (object ID, employee number), store it as a custom attribute, and reject unknown users unless you have an explicit JIT policy. If you must use email, treat a change as an identity event with an approval flow.

Session Properties let you carry values into the local session without putting them in a token:

```
profile = PARM{prop-oidc.realm.userinfo.profile}
department = PARM{attr-0.attributes.department}
```

The exact parameter names depend on your realm and attribute sources; the pattern is what matters.

### Extra knobs for Entra-style flows

Some partners need a user hint or specific authentication context:

- **UserId Claim**: read a claim from the incoming `id_token_hint` (for example `oid` or `email`).
- **Local parameter**: the local attribute to compare it with.
- **`acr` / `amr` values**: request a specific authentication strength (MFA, compliant device). If the partner cannot satisfy it, the login should fail — do not silently downgrade.

### Inbound OIDC sequence

1. User hits the app; OneGate has no local session.
2. The RP builds an authorization request to the partner, with `state`, `nonce` and PKCE.
3. The partner authenticates the user (its own MFA, conditional access, etc.).
4. The partner redirects back to OneGate with a code.
5. OneGate exchanges the code at the partner token endpoint using its client credentials.
6. OneGate validates the ID token: signature via partner JWKS, `iss`, `aud`, `exp`, `nonce`, `azp` if present.
7. OneGate maps the subject to a local user (or rejects/JIT).
8. OneGate optionally enriches attributes from a REST/JVAP source.
9. OneGate creates a **local** session and issues **local** tokens if an app needs them.
10. The proxied app or BFF continues with the local identity; the partner token is not forwarded.

Step 10 is the important one. Your APIs should not need to know anything about the partner.

## 2. OneGate as SAML Identity Provider (outbound)

Used by [SAML IdP](#/sim/fed-saml-idp). A partner application speaks SAML and will not be rewritten.

### What the partner needs from you

- **IdP EntityID** (a URI, not necessarily a URL).
- **SingleSignOnService URL** (HTTP-Redirect and/or HTTP-POST binding).
- **Signing certificate** (public).
- **SingleLogoutService URL** if you support SLO.
- **NameID format** you will send.

### What you need from the partner

- **SP EntityID**.
- **Assertion Consumer Service (ACS) URL** — exact, including path.
- **NameID format** the SP expects.
- **Attributes** the SP requires and their names.
- **Whether the SP wants the response signed, the assertion signed, or both.**
- **Whether the SP validates `InResponseTo` and `Destination`.**

### OneGate SP configuration

| Setting | Notes |
|---|---|
| **SP name / EntityID** | Must match what the SP sends in its `AuthnRequest` |
| **ACS URL** | Where the assertion is posted; exact match |
| **NameID format** | `persistent`, `transient`, `emailAddress`, `unspecified` — agree with the SP |
| **NameID value** | Usually the local stable user ID, not the email |
| **Attributes** | Map local claims to the SP’s expected names |
| **Signing** | Sign the assertion and/or response; publish the certificate |
| **Assertion lifetime** | Short, e.g. 5 minutes; the SP creates its own session |
| **Audience** | The SP EntityID; the SP must reject anything else |
| **Destination** | The ACS URL; must match the actual endpoint |

### The SAML flow

1. User opens the partner app.
2. The SP creates a SAML `AuthnRequest` and redirects the browser to OneGate.
3. OneGate authenticates the user — locally, via OIDC federation, or via another SAML IdP.
4. OneGate builds a `Response` containing an `Assertion` with `Subject`, `Conditions`, `AuthnStatement` and `AttributeStatement`.
5. OneGate signs what was agreed and returns an HTML form that auto-posts to the ACS URL.
6. The SP validates the signature, `Audience`, `Destination`, `NotBefore`/`NotOnOrAfter`, `InResponseTo` and replay.
7. The SP creates its own session. SAML ends there; no further protocol traffic is needed.

A simplified assertion:

```xml
<saml:Assertion ID="_a1b2" IssueInstant="2026-10-28T12:00:00Z" Version="2.0">
  <saml:Issuer>https://login.example.com/mg-local/portal</saml:Issuer>
  <saml:Subject>
    <saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">u-4711</saml:NameID>
    <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
      <saml:SubjectConfirmationData NotOnOrAfter="2026-10-28T12:05:00Z"
        Recipient="https://partner.example.com/saml/acs"
        InResponseTo="_req-88f2"/>
    </saml:SubjectConfirmation>
  </saml:Subject>
  <saml:Conditions NotBefore="2026-10-28T11:59:30Z" NotOnOrAfter="2026-10-28T12:05:00Z">
    <saml:AudienceRestriction>
      <saml:Audience>https://partner.example.com/saml/metadata</saml:Audience>
    </saml:AudienceRestriction>
  </saml:Conditions>
  <saml:AuthnStatement AuthnInstant="2026-10-28T11:59:55Z">
    <saml:AuthnContext>
      <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
    </saml:AuthnContext>
  </saml:AuthnStatement>
  <saml:AttributeStatement>
    <saml:Attribute Name="mail"><saml:AttributeValue>roger.lind@example.com</saml:AttributeValue></saml:Attribute>
    <saml:Attribute Name="department"><saml:AttributeValue>Operations</saml:AttributeValue></saml:Attribute>
  </saml:AttributeStatement>
</saml:Assertion>
```

### NameID and AuthnContext

- **NameID** is the SP’s primary key for the user. `persistent` is stable and opaque; `emailAddress` is readable but changes; `transient` is per-session and rarely what a business app wants.
- **AuthnContext** tells the SP how the user authenticated. Requesting `PasswordProtectedTransport` when you need MFA is a policy bug. Some SPs enforce specific class refs.
- If you federate through a partner IdP, map their assurance level to the local one rather than hard-coding “MFA succeeded”.

## 3. OneGate as SAML Service Provider (inbound)

Used by [SAML SP](#/sim/fed-saml-sp). A partner IdP initiates SSO and posts an assertion to OneGate.

### Configuration

- Import the partner IdP metadata (or enter EntityID, SSO URL and signing certificate manually).
- Register OneGate as an SP at the partner, with the ACS URL OneGate generates.
- Map the partner’s NameID (or an attribute) to a local user.
- Decide whether the partner IdP initiates (IdP-initiated) or OneGate initiates (SP-initiated).
- Configure attribute enrichment after validation if needed.

### Validation checklist

The SP must check all of these; skipping one is a real vulnerability:

1. **Signature** over the assertion or response, using the IdP certificate, with a pinned algorithm.
2. **Issuer** is the expected IdP EntityID.
3. **Audience** is OneGate’s SP EntityID.
4. **Destination** is the actual ACS URL.
5. **NotBefore / NotOnOrAfter** with a small clock leeway.
6. **InResponseTo** matches a request OneGate issued (for SP-initiated flows).
7. **Recipient** matches the ACS URL.
8. **Replay**: the assertion ID has not been seen before.
9. **NameID / attribute mapping** resolves to exactly one local user.

IdP-initiated SSO has no `InResponseTo`; that is allowed, but it weakens the binding and should be enabled only when the partner requires it.

### From assertion to local session

After validation, OneGate creates a normal local session. From that point on, the flow is identical to a local login: proxy rules, BFF cookies, local tokens, attribute enrichment and logout all work the same way.

## Attribute enrichment during federation

Both inbound directions can call a REST/JVAP attribute provider before issuing local tokens. This is how a partner identity gets your entitlements:

```
partner identity → local user → attribute provider (sub=mguid, actor optional) → claims → local token
```

Cache keyed by both identities if delegation is involved. If the attribute source is down, decide explicitly: fail closed (no token) or issue with a reduced claim set. Never silently issue a token with missing entitlements that the API might interpret as “allow”.

See [attribute providers](#/learn/06-attribute-providers).

## Logout across federation

Logout has three independent layers:

1. **Your local session** — delete it server-side; clear the cookie.
2. **The partner session** — redirect to the partner’s end-session endpoint if supported.
3. **Downstream apps** — SAML SLO, back-channel logout, or simply short sessions.

Do not claim “logout” when you only cleared a cookie. A partner SSO session that stays alive will silently log the user back in. See [logout](#/sim/logout).

## Failure modes worth memorising

| Symptom | Likely cause |
|---|---|
| `invalid ID token` right after a partner login | Clock skew, wrong `aud`, stale JWKS, `nonce` mismatch |
| Partner says `redirect_uri mismatch` | The URI registered at the partner differs from the one OneGate sends |
| Unknown user every time | Mapping attribute missing, or the partner changed the subject identifier |
| Duplicate local accounts | Mapping on email while the partner recycles or changes emails |
| SAML `Invalid signature` | Wrong certificate, response signed but assertion expected, XML canonicalisation issue |
| SAML `Audience restriction failed` | SP EntityID mismatch |
| SAML `Response expired` | Assertion lifetime too short or clocks out of sync |
| SAML replay detected | Assertion reused; check for a proxy caching the POST or a retry loop |
| Loop between OneGate and partner | The RP is not creating a local session, or cookies are blocked |
| Attributes missing only for federated users | Attribute profile expects local claims that the partner does not provide |

## Simulate it

- [Federation in — OneGate as RP](#/sim/fed-oidc-inbound)
- [Federation out — OneGate as SAML IdP](#/sim/fed-saml-idp)
- [Federation in — OneGate as SAML SP](#/sim/fed-saml-sp)
- [BFF with a partner IdP](#/sim/bff-thirdparty)

Next: [Backend for Frontend, end to end](#/learn/05-bff).
