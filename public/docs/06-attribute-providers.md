# Attribute providers & JVAP

Identity answers *who*. Attributes answer *what may they do, and what should the app show?* OneGate can resolve attributes at login or token issuance by calling a REST/JVAP attribute service, caching the answer in the session, and mapping it into claims.

This is how a token ends up with `department`, `costCenter`, `roles` or `entitlements` that the local user store never knew.

## Where attributes come from

```
User store  ──┐
Federation  ──┼──▶ Attribute profile ──▶ Access token / ID token / UserInfo
Attribute   ──┘
provider
```

An attribute provider does not replace authentication. It enriches an already-authenticated subject:

- **Subject** — who the attributes are about, usually a stable local ID such as `PARM{mguid}`.
- **Actor** — who is asking, for delegation-aware services.
- **Ext** — application-specific context (tenant, case ID, reason).
- **Audience / Realm** — which API or trust domain the attributes are for.

The provider can apply its own policy: “this agent may see this customer’s entitlements only while a case is open”.

## The configuration screen

| Setting | What it means | Practical advice |
|---|---|---|
| **API URL** | The REST endpoint | HTTPS only; internal DNS; no user-controlled URLs |
| **Method** | `GET` or `POST` | `POST` for complex subjects/actors; `GET` only for cacheable lookups |
| **Connect / read timeout** | How long OneGate waits | Short (1–3 s); fail fast, do not hang the login |
| **Skip SSL check** | Disables certificate validation | Never in production; use a trusted internal CA |
| **Realm** | Trust domain sent to the provider | Usually the OneGate realm |
| **Audience** | Intended consumer of the attributes | The API or app that will use them |
| **Subject** | The user identifier | `PARM{mguid}` — stable, not email |
| **Actor** | Optional “who is acting” identifier | Required for delegation |
| **Ext** | Optional extra context | Free-form, validated by the provider |
| **Include Access Token** | Signs the attribute request | Enables the provider to verify OneGate |
| **Valid time** | Cache lifetime in the local session | Seconds to minutes; not hours |
| **Attributes** | Remote names to request | Ask for the minimum |
| **JsonPath** | Extract a nested value | Avoid brittle paths tied to UI structure |
| **Failure policy** | What happens if the call fails | Fail closed for entitlements |

### Subject, actor and ext

```
POST /attributes HTTP/1.1
Authorization: Bearer <signed attribute-request token>
Content-Type: application/json

{
  "realm": "portal",
  "audience": "api.orders",
  "subject": "a1b2c3d4-7f31-4a1e-9d2c-55e0f1a2b3c4",
  "actor": "9f8e7d6c-...",
  "ext": { "caseId": "CASE-10442", "reason": "support" },
  "attributes": ["department", "costCenter", "roles"]
}
```

A typical response:

```json
{
  "subject": "a1b2c3d4-7f31-4a1e-9d2c-55e0f1a2b3c4",
  "attributes": {
    "department": "Operations",
    "costCenter": "CC-4711",
    "roles": ["orders.reader", "orders.approver"],
    "limits": { "approval": 25000 }
  }
}
```

OneGate then exposes values through `PARM{...}` references in the attribute profile:

```
department = PARM{attr-0.attributes.department}
roles      = PARM{attr-0.attributes.roles}
approval   = PARM{attr-0.attributes.limits.approval}
```

The exact prefix (`attr-0`, `attr-1`, …) is the order/name of the configured source in your realm. Names are deployment-specific; the pattern is not.

## Why sign the request?

If the attribute API is reachable from anywhere inside the network, an attacker who can call it directly can enumerate entitlements. Including an access token (or a signed request) lets the provider:

- verify the caller is OneGate;
- check the `aud`/realm;
- bind the response to a specific subject and actor;
- reject anonymous or replayed requests;
- log the real caller.

The token used for the attribute call should be **narrowly scoped** — an audience for the attribute service, not the user’s API token. Do not forward the user’s refresh token.

## Caching

`Valid time` caches attributes in the local session. It is a trade:

| Short cache | Long cache |
|---|---|
| Fresh entitlements | Fewer calls |
| More provider load | Stale permissions after a change |
| Faster revocation | A revoked user may keep access until expiry |

Rules:

- Cache **per subject**, and per actor when delegation is involved. A cache key of “subject” alone leaks a customer’s data to the next agent.
- Never cache a failed lookup as “no attributes” for long; that can silently downgrade permissions.
- Invalidate the cache on logout and on privilege changes.
- If the provider returns a `Cache-Control` or expiry, respect the shorter of the two.
- Log cache hits/misses with the subject and actor, not the attribute values.

## Failure policy

What happens when the attribute service is down?

| Policy | Behaviour | When to use |
|---|---|---|
| **Fail closed** | No token / login fails | Entitlements are required for authorization |
| **Issue reduced token** | Login succeeds with base claims only | The app can function safely without the attributes |
| **Stale cache** | Use the last known values within a bounded window | Short outages, low-risk attributes |
| **Fail open** | Issue with no restriction | Almost never; document it loudly if you must |

The dangerous middle ground is issuing a token with missing entitlements while the API treats a missing claim as “allow”. Make the API’s default deny explicit.

## Delegation: attributes about someone else

The [delegated attributes](#/sim/attr-delegation) scenario adds an **actor**. A service-desk agent opens a customer record; the attribute provider must know both:

```
subject = customer
actor   = agent
```

Then it can answer with the customer’s entitlements **as visible to that agent**, and OneGate can put both identities into the session/token. The cache key must include both. The provider should log the actor, and the UI should show that the agent is acting on someone else’s data.

A token from this flow often looks like:

```json
{
  "sub": "customer-4711",
  "act": { "sub": "agent-88", "name": "Roger Lind" },
  "aud": "api.support",
  "scope": "support.read"
}
```

Without `act`, the audit log says the customer did it. That is not delegation; it is impersonation with extra steps.

## Security checklist

- HTTPS with certificate validation; internal CA instead of “skip SSL”.
- Allow-list the attribute provider host; never let a user supply the URL (SSRF).
- Authenticate the request and scope it to the attribute service.
- Request the minimum attribute set; do not dump the whole profile into a token.
- Validate and size-limit the response; do not let a huge JSON blob become a JWT.
- Treat attribute values as data, not code; escape them in the UI.
- Cache with the full identity key (subject + actor + audience).
- Fail closed for authorization-critical attributes.
- Log the decision (subject, actor, source, cache hit, allow/deny), not the raw values.
- Test the provider-down path deliberately.

## Simulate it

- [Attribute provider — enriching a token](#/sim/attr-rest)
- [Delegated attributes — the actor parameter](#/sim/attr-delegation)

Next: [Tokens, storage and lifetimes](#/learn/07-tokens-and-lifecycle).
