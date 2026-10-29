# OpenID Federation — trust chains & automatic registration

> **Read this first: “OpenID Federation” is not “OIDC federation”.**
>
> [Chapter 4](#/learn/04-federation-rp-saml) covers the familiar thing: OneGate as an OpenID Connect Relying Party to a partner OP, or as a SAML IdP/SP. That is **protocol federation** — one login protocol consuming another.
>
> **OpenID Federation 1.0** is a different layer: a JWT-based **trust framework**. It answers “does this RP and this OP belong to the same federation, and what metadata is each allowed to use?” before any login happens. It can automate client registration, but it does not replace OpenID Connect.
>
> **Version note.** OpenID Federation 1.0 was approved as an OpenID Foundation Final Specification in **February 2026**. In 2026 the same functionality was also refactored into OpenID Federation 1.1 (trust infrastructure) and OpenID Federation for OpenID Connect 1.1 (the OIDC/OAuth binding). The concepts below apply to both forms.
>
> **OneGate manual caveat.** The Administration Manual does **not** document OpenID Federation entity statements, trust anchors, trust chains or automatic registration. Its only mention of “OpenID federation” is an ACL note that it does not support configuring **Max inactive time**. This chapter is a standards-based explanation and the [simulation](#/sim/openid-federation) is a teaching model — not a claim that your OneGate version exposes these settings. Verify support before designing around it.

## The problem it solves

In ordinary OIDC, an RP cannot send a user to an OP until an administrator has registered the RP as a client at that OP: a `client_id`, redirect URIs, a client secret or public key, scopes. With one OP that is fine. With a federation of hundreds of OPs and thousands of RPs, manual registration does not scale.

OpenID Federation replaces the manual introduction with a signed trust graph:

```
                 ┌──────────────────────┐
                 │     Trust Anchor     │  pinned key
                 │  federation operator │
                 └───────┬──────┬───────┘
                         │      │
             subordinate │      │ subordinate
             statement   │      │ statement
                         ▼      ▼
                  ┌────────┐  ┌────────┐
                  │   OP   │  │   RP   │
                  └────────┘  └────────┘
```

The OP and RP do not need a direct agreement. Each needs a valid **trust chain** to a Trust Anchor they both trust. The chain also carries their metadata and the policies that constrain it.

## The objects

### Entity and Entity Identifier

An **Entity** is a participant: OP, RP, OAuth authorization server, protected resource, trust mark issuer, or the Trust Anchor itself. Its **Entity Identifier** is an `https` URL with a host and optional port/path. It must not contain a query string or fragment.

The Entity Identifier is not just a label. In automatic registration it becomes the OAuth `client_id`.

### Entity Configuration (EC)

Every entity publishes a self-issued statement at:

```
https://<entity>/.well-known/openid-federation
```

The response is a JWT with:

```json
{
  "iss": "https://op.example.com",
  "sub": "https://op.example.com",
  "iat": 1770000000,
  "exp": 1770003600,
  "jwks": { "keys": [ … ] },
  "authority_hints": ["https://ta.example.com"],
  "metadata": {
    "openid_provider": {
      "issuer": "https://op.example.com",
      "authorization_endpoint": "https://op.example.com/authorize",
      "token_endpoint": "https://op.example.com/token",
      "jwks_uri": "https://op.example.com/jwks",
      "client_registration_types_supported": ["automatic"]
    }
  }
}
```

The JWT header must have `typ: entity-statement+jwt` and a non-empty `kid`. `iss = sub` is what makes it an Entity Configuration. The `jwks` here is the entity’s **federation key set**, not its OIDC signing keys.

### Subordinate Statement (SS)

A Trust Anchor or Intermediate issues a statement about an immediate subordinate:

```json
{
  "iss": "https://ta.example.com",
  "sub": "https://op.example.com",
  "iat": 1770000000,
  "exp": 1770003600,
  "jwks": { "keys": [ … ] },
  "metadata_policy": {
    "openid_provider": {
      "response_types_supported": { "one_of": ["code"] },
      "token_endpoint_auth_methods_supported": { "one_of": ["private_key_jwt"] }
    }
  },
  "source_endpoint": "https://ta.example.com/federation_fetch_endpoint"
}
```

The `jwks` in the SS is the **subject’s** federation key set, bound by the superior’s signature. The optional `metadata_policy`, `metadata` and `constraints` shape what the subject may claim.

### Trust Anchor and Intermediate

A **Trust Anchor** is the root of trust. Its federation key is configured **out-of-band** (or obtained through a secured key-distribution mechanism) by participants. It publishes a `federation_fetch_endpoint` in its `federation_entity` metadata.

An **Intermediate** is an authority below the Trust Anchor. It can issue subordinate statements for its own members. The chain then has more than one SS:

```
leaf EC → intermediate SS about leaf → TA SS about intermediate → TA EC
```

The Trust Anchor remains the root; intermediates cannot exceed the constraints or policies imposed above them.

## Resolving a trust chain

### Pull

1. Fetch the leaf’s EC from `/.well-known/openid-federation`.
2. Read `authority_hints`.
3. Fetch each authority’s EC.
4. Ask the authority’s `federation_fetch_endpoint` for the subordinate statement:

```http
GET /federation_fetch_endpoint?sub=https%3A%2F%2Fop.example.com HTTP/1.1
Host: ta.example.com
```

5. Continue until the Trust Anchor. The TA’s own EC ends the chain.

### Push and hybrid

The whole chain can be sent in a `trust_chain` parameter (authorization request) or JWS header. The RP may also send its EC and let the OP fetch the remaining subordinate statements — the **hybrid** method used by explicit registration.

Push reduces outbound calls; pull makes revocation/refresh more immediate. The spec allows both, and a deployment may choose.

## Validating a trust chain

Do not stop at “the JWT signature is valid”. Validate the **whole path**:

1. **Header** — `typ=entity-statement+jwt`, an acceptable `alg` (never `none`), non-empty `kid`.
2. **Signature** — using the issuer’s federation key.
3. **Linkage** — the `iss` of each statement matches the `sub` of the statement above it; the SS `sub` matches the entity identifier; `authority_hints` are consistent.
4. **Key binding** — the subject’s federation key used in its EC/SS is present in the SS `jwks` issued by its superior.
5. **Time** — `iat` is not in the future, `exp` is not in the past (small leeway only), and the chain’s lifetime is the **earliest `exp`** in the chain.
6. **Policy** — apply the `metadata_policy` from every SS, in order, to the metadata. Then check the **resolved metadata** you will actually use: `redirect_uris`, endpoints, algorithms, authentication methods.
7. **Constraints** — `max_path_length`, entity-type constraints and naming constraints.
8. **Trust marks** — if present, validate the trust mark JWT with its issuer and confirm that the issuer/type is trusted by the federation.

If any step fails, the entity is not trusted. A valid signature by a key inside a self-signed statement is not enough.

## Metadata policy in one minute

A policy is applied to the leaf metadata as the chain is traversed. Common operators:

| Operator | Effect |
|---|---|
| `value` | Replace the value with a fixed value |
| `add` | Add or replace a value |
| `default` | Supply a value only if absent |
| `one_of` | Value must be one of the listed values |
| `subset_of` | Value must be a subset of the listed values |
| `superset_of` | Value must contain at least the listed values |
| `essential` | The parameter must be present |

Example: a Trust Anchor can require `response_types_supported` to be exactly `code`, and `token_endpoint_auth_methods_supported` to allow only `private_key_jwt`. The RP’s own metadata cannot override that.

## Trust marks

A **Trust Mark** is a signed JWT issued by a Trust Mark Issuer, asserting conformance to a scoped requirement — for example an assurance level or a sector accreditation. Trust marks are separate from the trust chain: the chain establishes federation membership and metadata; a trust mark adds an accreditation claim. A Trust Anchor can declare which Trust Mark types/issuers it recognises.

## Automatic registration

This is the feature people usually mean by “OpenID Federation login”.

1. The RP resolves the OP’s trust chain and metadata.
2. The RP sends an authorization request with `client_id` equal to its **Entity Identifier**.
3. The request is authenticated with a signed request object or a PAR request using `private_key_jwt` (or another asymmetric method supported by the OP).
4. The OP resolves the RP’s trust chain, applies the federation policy to the RP metadata, checks `redirect_uris`, and creates an **internal client registration**.
5. The OP proceeds with ordinary OIDC. At the token endpoint the RP authenticates with `private_key_jwt` — **no client secret is issued**.
6. The registration is tied to the resolved metadata. Policy changes or key rollover can change or invalidate it; the OP should re-evaluate before expiry.

Automatic registration is not “open registration”. The Trust Anchor and its policy still decide which entities are members and what metadata they may use.

## Explicit registration

For RPs that cannot use signed requests or PAR, OpenID Federation defines **explicit registration**:

- The RP POSTs its Entity Configuration or a trust chain to the OP’s `federation_registration_endpoint`.
- The OP resolves and validates the chain, applies policy, and returns a normal client registration (including a `client_id` and, if used, a `client_secret`).
- The registration has a lifetime and must be re-evaluated when the underlying trust chain or metadata changes.

Explicit registration is a fallback, not a lower-trust mode. It still depends on a valid trust chain.

## Keys, caching and rollover

- **Federation Entity Keys** sign entity statements and trust marks. **Protocol keys** in metadata sign OIDC messages (ID tokens, request objects, client assertions). Keep them separate.
- Publish all keys that may still verify a live statement; rotate with overlap.
- Cache a trust chain only until its earliest `exp`.
- Re-resolve after federation key rollover or a metadata/policy change.
- The spec defines key rollover and revocation mechanisms; follow your federation profile and the Trust Anchor’s operational rules.
- Never let a cached chain become a permanent “trusted forever” entry.

## Security and operations checklist

- Pin Trust Anchor keys out-of-band; allow-list Trust Anchors.
- Enforce HTTPS, exact Entity Identifiers, `typ`, `alg` (never `none`), `kid`, signatures, `iat`/`exp` and `iss`/`sub` linkage.
- Apply metadata policy, then check the actual `redirect_uris` and client authentication methods.
- Protect the resolver: timeouts, response-size limits, caching, no arbitrary `authority_hints` or entity URLs supplied by a client.
- Validate trust marks against their issuer; do not treat a self-asserted mark as accreditation.
- Log the chain decision (entity IDs, Trust Anchor, policy result), not the raw statements with sensitive metadata.
- Test: expired statement, wrong-key SS, mismatched `sub`, policy violation, bad redirect URI, revoked/rotated key, unknown Trust Anchor.

## What this means for OneGate

The OneGate manual documents **OIDC Local Providers/Remote Clients**, **OIDC RP Authentication/Remote Providers** and **SAML IdP/SP**. It does **not** document OpenID Federation trust anchors, entity configurations or automatic registration. Its only mention of “OpenID federation” is the ACL note about **Max inactive time**.

So treat this chapter as the standard’s mental model, not as a OneGate configuration guide. If your deployment adds OpenID Federation support, it would be an additional trust layer around the existing Local Provider, Remote Client and RP objects — not a replacement for them.

## Simulate it

- [OpenID Federation — trust chains & automatic registration](#/sim/openid-federation) — switch between **Trust chain** and **Automatic registration**.
- [Federation in — OneGate as RP](#/sim/fed-oidc-inbound) — the ordinary OIDC RP flow.
- [Federation out — SAML IdP](#/sim/fed-saml-idp) and [SAML SP](#/sim/fed-saml-sp) — the SAML directions.

Next: [Glossary](#/glossary).
