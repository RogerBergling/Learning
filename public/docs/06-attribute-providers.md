# Attribute sources & the User Attribute API

Identity answers *who*. Attributes answer *what may they do, and what should the app show?* OneGate can resolve attributes at login or token issuance by calling an **Attribute Source** — LDAP, REST or Graph API — caching the answer in the session, and mapping it into claims.

This is how a token ends up with `department`, `costCenter`, `roles` or `entitlements` that the local user store never knew.

> **Terminology.** The Administration Manual calls this feature **Attribute Sources** (Authentication → Attribute Sources). Older material — including earlier versions of this lab — used the name “JVAP” and “User Attribute API”. “User Attribute API” is the REST contract that a REST attribute source calls; it is not a separate OneGate product. This chapter uses the manual’s terms.

## Where attributes come from

```
User store  ──┐
Federation  ──┼──▶ Attribute profile ──▶ Access token / ID token / UserInfo
Attribute   ──┘
source
```

An attribute source does not replace authentication. It enriches an already-authenticated subject. The manual lists three types: **LDAP**, **REST** and **Graph API**.

## The configuration screen

| Setting | What it means | Practical advice |
|---|---|---|
| **Description** | Label for the source | Name it after the system, not the team |
| **Log out user on fail** | Logs the user out if not found in the source | Enable for authoritative sources; think before enabling for optional ones |
| **Type** | LDAP, REST or Graph API | The REST section below is the one used in the simulation |
| **API URL** | The REST endpoint | HTTPS only; internal DNS; no user-controlled URLs |
| **Request method** | `GET` or `POST` | `POST` for complex subject/actor/ext; `GET` only for simple, cacheable lookups |
| **Connect / read timeout** | How long OneGate waits | Short; fail fast rather than hang the login |
| **Skip SSL Check** | Disables certificate validation | Only for internal self-signed services; never as a habit |
| **Post payload** | Custom claim names some REST systems expect | Leave empty unless the service documents a need |
| **Realm** | Named space the provider should search | Use it when one API fronts several user populations |
| **Audience** | Intended audience of the access token | The REST API/service that consumes the token, not a request-body field |
| **Subject** | The authenticated user’s unique ID | Usually `PARM{mguid}`; stable, not email |
| **Actor** | Who is asking for the subject’s attributes | Delegation; sent as `{ "subject": "..." }` |
| **Ext** | Extra custom metadata | Tenant, case ID, reason; validated by the provider |
| **Include Access Token** | Sends a JWT to the attribute service | Lets the service verify that OneGate is the caller |
| **Valid time** | How long attributes are cached in the session | Seconds to minutes; not hours |
| **Attributes** | Attribute Name, JsonPath, Friendly Name | Ask for the minimum; JsonPath only for nested JSON |

### Subject, actor and ext

The REST body uses these field names. `actor` is an object, not a bare string:

```json
{
  "realm": "portal",
  "subject": "a1b2c3d4-7f31-4a1e-9d2c-55e0f1a2b3c4",
  "actor": { "subject": "9f8e7d6c-..." },
  "requested_attributes": ["department", "costCenter", "roles"],
  "ext": { "caseId": "CASE-10442", "reason": "support" }
}
```

A typical response:

```json
{
  "attributes": {
    "department": "Operations",
    "costCenter": "CC-4711",
    "roles": ["orders.reader", "orders.approver"],
    "limits": { "approval": 25000 }
  }
}
```

OneGate flattens the JSON keys into parameters. In an attribute profile:

```
department = PARM{attr-0.attributes.department}
roles      = PARM{attr-0.attributes.roles}
approval   = PARM{attr-0.attributes.limits.approval}
```

The manual’s shorter form `PARM{attr-ATTRPROVIDER_ID.ATTRIBUTE_NAME}` (example: `PARM{attr-0.company}`) is used for a flat attribute name. A JsonPath attribute is referenced as `PARM{attr-X.ATTRNAME}`, where `ATTRNAME` is the **Attribute Name** you configured (not the Friendly Name). Know which form you chose — mixing them is the usual “empty claim” bug.

**Friendly Name** is currently not used by the product; the manual describes it only as a GUI label to help the administrator distinguish attributes, especially OID-format ones. Do not build parameter references from it.

## Include Access Token

If the attribute service is reachable from anywhere inside the network, an attacker who can call it directly can enumerate entitlements. **Include Access Token** makes OneGate send a JWT access token so the provider can:

- verify the caller is OneGate;
- check the `iss`, `aud` and `sub` you configured;
- bind the response to a specific subject and actor;
- reject anonymous or replayed requests;
- log the real caller.

The manual’s fields are **Claim `iss`**, **Claim `aud`**, **Claim `sub`** and the **Key** used to sign or encrypt the attribute request. The token should be narrowly scoped to the attribute service — do not forward the user’s API token or refresh token.

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

The manual’s **Log out user on fail** is a related, stronger control: if the user is not found in the source, the session itself is ended.

## Delegation: attributes about someone else

The [delegated attributes](#/sim/attr-delegation) scenario adds an **actor**. A service-desk agent opens a customer record; the attribute source must know both:

```
subject = customer
actor   = agent
```

The manual describes the actor syntax as borrowed from OAuth Token Exchange (RFC 8693), but in the request body it is a simple object with a `subject`:

```json
"actor": { "subject": "agent-88" }
```

Then the source can answer with the customer’s entitlements **as visible to that agent**, and OneGate can put both identities into the session/token. The cache key must include both. The provider should log the actor, and the UI should show that the agent is acting on someone else’s data.

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
- Allow-list the attribute source host; never let a user supply the URL (SSRF).
- Authenticate the request and scope it to the attribute service.
- Request the minimum attribute set; do not dump the whole profile into a token.
- Validate and size-limit the response; do not let a huge JSON blob become a JWT.
- Treat attribute values as data, not code; escape them in the UI.
- Cache with the full identity key (subject + actor + realm).
- Fail closed for authorization-critical attributes.
- Log the decision (subject, actor, source, cache hit, allow/deny), not the raw values.
- Test the provider-down path deliberately.

## Simulate it

- [Attribute source — enriching a token with REST data](#/sim/attr-rest)
- [Delegated attributes — the actor parameter](#/sim/attr-delegation)

Next: [Tokens, storage and lifetimes](#/learn/07-tokens-and-lifecycle).
