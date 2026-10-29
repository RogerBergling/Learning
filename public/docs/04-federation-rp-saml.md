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
- create an **RP Authentication** entry that uses that provider;
- decide how partner users map to local users;
- attach the RP to the BFF, or enable the corresponding authentication method for the proxied resource’s ACL.

### Remote Provider fields

A Remote Provider is either **Manually configured** or uses a **Discovery URL**. The manual documents:

| Setting | Notes |
|---|---|
| **Description** | Name shown in the UI |
| **Manually configured / Use Discovery URL** | Discovery is easier; manual metadata is explicit |
| **Connect Timeout (ms)** | How long a connection to the OP may take |
| **Read Timeout (ms)** | How long reading from the OP may take |
| **Skip SSL check** | Keep off in production |
| **Discovery URL** | Usually `issuer + /.well-known/openid-configuration` |
| **Manual Metadata** | `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, `subject_types_supported` |

`subject_types_supported` is `public` (the same `sub` to every client) or `pairwise` (a different `sub` per client).

### RP settings that matter

| Setting | What it controls | Advice |
|---|---|---|
| **Description** | Name shown in the UI | Make it obvious which partner/client it is |
| **Unique Name** | Also forms the callback endpoint | Stable, lowercase |
| **Virtual Host Domain** | The host this RP is configured for | Must match the virtual host |
| **Remote Provider** | Where the RP sends the authorization request | Prefer discovery; verify the issuer |
| **scope** | What identity data you ask for | Must contain `openid`; `profile`, `email`, `address`, `phone` are pre-defined |
| **response_types** | `code` | Never implicit |
| **token_endpoint_auth_method** | Basic or POST, depending on the partner | Match the partner exactly |
| **client_id / client_secret** | How OneGate authenticates at the partner | Store the secret in a secret manager |
| **id_token_signed_response_alg** | What ID token signature you expect | Pin to what the partner actually uses |
| **prompt** | Whether to force reauthentication/consent | Usually empty; `none`/`login`/`consent`/`select_account` are available |
| **Local user handling** | How `sub`/email maps to a local user | Decide before go-live |
| **Handle unknown users** | Reject / Allow / No user db check | Reject is the safe default |
| **Session Properties** | Copy values into the local session | Use `PARM{...}` references |

The manual does not document PKCE, clock leeway or a per-RP signing-algorithm list as RP settings. Treat those as generic OIDC hygiene and verify what your version exposes.

### Local user mapping

The partner’s `sub` is stable **for that partner**, not for you. You need a local key.

Four patterns (the manual’s **Local user handling** options):

| Pattern | How | Risk |
|---|---|---|
| Map on email / custom attribute | **Custom User Id attribute** = `email` or `upn` | Email changes create a new person or lock someone out |
| Use the partner `sub` | **Use it as the username** | Only if the partner `sub` is stable and human-usable |
| Map to a local attribute | **Map it to a custom attribute** (`partnerObjectId`) | Requires a provisioning step |
| Just-in-time provisioning | **Handle unknown users = Allow** / **No user db check** | Anyone the partner authenticates gets an account; needs policy |

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
8. OneGate optionally enriches attributes from a REST attribute source.
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

### OneGate remote SP configuration

| Setting | Notes |
|---|---|
| **EntityID** | Matched against the `EntityID` in the `AuthnRequest`; by default also used as the audience restriction. May be a regular expression for dynamic SPs |
| **Assertion Consumer URL** | Matched against `AssertionConsumerServiceURL`; may be a regular expression for dynamic SPs |
| **Login page URL** | Optional address where a user starts a session |
| **Logout Request / Response URL** | Where SLO messages are sent |
| **Unique Name / Description** | Human labels in the list |
| **NameID format** | Common formats include `persistent`, `transient`, `emailAddress` and `unspecified`; other formats are configurable. Agree with the SP |
| **Attributes** | Map local claims to the SP’s expected names |
| **Signing** | Sign the assertion and/or response; publish the certificate |
| **Assertion lifetime** | Short, e.g. 5 minutes; the SP creates its own session |
| **Audience restriction** | Choose whether the audience is the SP EntityID or the ACS URL, matching what the SP validates |
| **Destination** | The ACS URL; must match the actual endpoint |

Specific SPs should sort above wildcard SPs in the list. **Remote SP groups** let one policy cover many SPs, and **Trusted Metadata Providers** can import and refresh remote SPs automatically.

#### Response and strictness

| Setting | Effect |
|---|---|
| **Allow different Authn Context Class** | Accept an assertion whose AuthnContext differs from what was requested |
| **Allow Unsolicited** | Permit IdP-initiated authentication |
| **Require signed logout request / response** | Reject unsigned SLO messages |
| **Strict Check** | Require `InResponseTo`, `NotOnOrAfter` and `Recipient` in SubjectConfirmationData; require `NotOnOrAfter` and `AudienceRestriction` in Conditions |
| **Force Authentication** | Require the user to log in actively even with an existing IdP session |

**Metadata Providers** can import remote SPs from metadata XML. **Min refresh delay** and **Max refresh delay** bound how often metadata is fetched; the manual recommends not setting the minimum below 600 seconds because the refresh task itself runs every ten minutes.

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
- Create a **Local Service Provider**: description, unique name, optional custom EntityID, signing/encryption keys, and the ACS/metadata endpoints OneGate generates.
- Configure **Remote IDPs** and enable them under **Active remote IDPs** for the virtual host.
- Add at least one **Method mapping** whose **Map Pattern** matches the remote IDP’s authentication method, or users cannot log in.
- Map the partner’s NameID (or an attribute) to a local user.
- Decide whether the partner IdP initiates (IdP-initiated) or OneGate initiates (SP-initiated) — **Allow Unsolicited** controls the former.
- Configure attribute enrichment after validation if needed.

### SP-side settings that matter

| Setting | Notes |
|---|---|
| **Allow Unsolicited** | Permit IdP-initiated SAML responses |
| **Strict Check** | Require `InResponseTo`, `NotOnOrAfter` and `Recipient` in SubjectConfirmationData, plus `NotOnOrAfter` and `AudienceRestriction` in Conditions |
| **Require signed logout request / response** | Reject unsigned SLO messages |
| **Allow different Authn Context Class** | Accept an AuthnContext different from the one requested |
| **Holder-of-Key WebSSO profile** | `Always`, `Use if available`, or `Never`; **Holder-of-Key CCP** selects the client-certificate provider |
| **Default Attribute Profile / Requested attributes** | Populate `AttributeConsumingService` in the SP metadata |
| **Method mapping** | `Map Pattern` (literal AuthnContext URI or regex) → **Local Method** (e.g. WebToken or **Custom**); **Limit mapping** restricts it to selected remote IDPs |

The **Remote IDP** config can also name a custom attribute that carries the authentication method, for IdPs that do not use AuthnContext. This is separate from the outgoing **IDP AuthnContexts → Method mapping**.

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

Both inbound directions can call a REST attribute source before issuing local tokens. This is how a partner identity gets your entitlements:

```
partner identity → local user → attribute source (sub=mguid, actor optional) → claims → local token
```

Cache keyed by both identities if delegation is involved. If the attribute source is down, decide explicitly: fail closed (no token) or issue with a reduced claim set. Never silently issue a token with missing entitlements that the API might interpret as “allow”.

See [attribute sources](#/learn/06-attribute-providers).

## Logout across federation

Logout has three independent layers:

1. **Your local session** — delete it server-side; clear the cookie.
2. **The partner session** — redirect to the partner’s end-session endpoint if supported.
3. **Downstream apps** — SAML SLO, or simply short sessions. OIDC back-channel logout is a generic pattern; the Administration Manual does not describe an endpoint for it, so verify support before relying on it.

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
