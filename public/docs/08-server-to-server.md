# Server-to-server & client credentials

No user, no browser, no cookie. A service authenticates **itself** and receives a token that represents the service. This is the simplest OAuth flow and the easiest one to get subtly wrong.

> **Manual caveat.** The Administration Manual’s Local Provider and Remote Client sections document the authorization-code flow and refresh tokens. They do **not** describe `client_credentials` or a machine-to-machine grant. Treat this chapter as generic OAuth 2.0 background; confirm that your OneGate version and licence expose the grant before designing around it.

## The flow

```
Service A ──client_id + secret──▶ /token ──access token──▶ API B
    ▲                                                          │
    └────────────────── 200 with data ─────────────────────────┘
```

1. Service A authenticates to the token endpoint with its client credentials.
2. The OP validates the client, the grant type and the requested scope.
3. The OP returns an access token whose `sub` is the service (or a client ID), with an audience for the target API.
4. Service A calls the API with `Authorization: Bearer ...`.
5. API B validates the token and enforces scope/audience.

There is no refresh token. When the access token expires, request a new one. There is no ID token either: no user authenticated.

## The token request

```http
POST /mg-local/portal/token HTTP/1.1
Host: login.example.com
Authorization: Basic Y2xpZW50LTEyMzphYmM0NTY3ODkw...
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=orders.read&audience=api.orders
```

The `Authorization` value is `base64(client_id + ":" + client_secret)`.

Response:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "orders.read"
}
```

Some providers also return an `audience` or a `resource` echo; OneGate may derive the audience from the scope mapping instead. Read your discovery/metadata rather than guessing.

### Basic or POST?

| Method | Where credentials go | When |
|---|---|---|
| `client_secret_basic` | `Authorization: Basic ...` | Default; avoids the secret in the body/logs |
| `client_secret_post` | `client_id` + `client_secret` form fields | When the client library cannot do Basic |
| `private_key_jwt` | Signed `client_assertion` | No shared secret; strong |
| mTLS | Client certificate | High assurance; certificate lifecycle needed |
| `none` | Nothing | Never for a service |

Pick one and configure both ends identically. “Invalid client” is usually a mismatch between what the client sends and what the registration expects.

## Audience and scope design

A service token should be **narrow**:

- one audience per API (`aud=api.orders`);
- one or two scopes, not `*`;
- a short lifetime;
- no user claims unless the service genuinely acts for a user.

If one token can call every API, a compromise of that service compromises everything. If the API accepts any token from the issuer without checking `aud`, the audience boundary does not exist.

### Resource indicators

Instead of inventing scopes for every API, use `resource` (RFC 8707) if your deployment supports it:

```http
grant_type=client_credentials
&scope=orders.read
&resource=https%3A%2F%2Fapi.example.com%2Forders
```

The OP returns a token whose audience is that resource. Do not let a client request a resource it is not entitled to; the OP must enforce the mapping.

### Scope-to-audience mapping

Many deployments map a scope to an audience internally:

| Scope | Audience | Meaning |
|---|---|---|
| `orders.read` | `api.orders` | Read orders |
| `orders.write` | `api.orders` | Write orders |
| `billing.read` | `api.billing` | Read invoices |
| `support.act` | `api.support` | Delegated support actions |

Document the mapping. If the API checks only the scope and ignores `aud`, the mapping is decorative.

## Caching the token

Do **not** request a token per API call.

- Cache per `(client_id, scope, audience, token endpoint)`.
- Renew when ~60 seconds remain, not after a 401.
- Use a single-flight lock so concurrent requests trigger one refresh.
- Invalidate on `invalid_token`, credential rotation or a deployment restart.
- Bound the cache size; do not grow one entry per user (there is no user).

A small in-memory cache plus a mutex is enough for most services. In a multi-instance deployment, each instance can hold its own token; that is usually fine. If the OP rate-limits token requests, consider a shared cache with short TTL, not a long-lived token.

## Secret management

- Store secrets in a secret manager, not in environment variables committed to a repo, not in a Docker image, not in a config map in plain text.
- Restrict who can read them; audit access.
- Rotate with overlap: add the new secret, deploy, remove the old one after all instances use the new one.
- Never log the secret, the Basic header, or the token request body.
- Prefer `private_key_jwt` or mTLS where the OP supports it; a shared secret is a bearer credential for the client.
- If a secret leaks, rotate immediately and review token issuance for that client.

### Rotation without downtime

1. Create a second secret on the client registration.
2. Deploy the new secret to the service (old one still valid).
3. Verify new tokens are issued.
4. Remove the old secret after the rollout window.
5. Check for instances still using it before removal.

## Token exchange instead of broad tokens

If service A must call service B **on behalf of a user**, client credentials are the wrong tool. Use a delegated flow:

- the user authenticates at A;
- A exchanges the user token (or its own token plus a subject) for a token with the target audience and an `act` claim;
- B sees both the subject and the actor.

This keeps the audit trail and narrows the audience. See [BFF exchange](#/sim/bff-exchange).

Do not “impersonate” by minting a token with someone else’s `sub` and no record of the caller. That is how support tools become unauditable.

## API-side validation

The receiving API must:

1. Verify the signature (JWKS) or introspect.
2. Check `iss` exactly.
3. Check `aud` contains this API.
4. Check `exp`/`nbf` with leeway.
5. Check `scope` for the operation.
6. Distinguish service tokens from user tokens if the operation requires a human (`sub` type, `client_id`, or a custom claim).
7. Reject tokens minted for another environment (prod token to test API is still a leak).

A service token often has a `sub` that looks like a client ID, not a person. If the API writes “created by” audit entries, record both `client_id` and `sub`, and do not pretend a human did it.

## Network and operations

- Allow-list the token endpoint and the API hosts; use a forward proxy if egress is restricted.
- Pin or trust the internal CA; do not disable TLS verification to “make it work”.
- Set connect and read timeouts; retry idempotent token requests with jitter, not in a tight loop.
- Respect `Retry-After` on 429.
- Monitor token request rate, failure rate, latency and 401 rate at the API.
- Alert on a spike in `invalid_client` — it often means a bad rotation.
- Keep clocks in sync (NTP). A few minutes of skew breaks `exp` checks.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Secret in the repo or an image layer | Permanent leak; rotation is the only fix |
| One global token for all APIs | No audience boundary; broad blast radius |
| Token requested per call | Latency and OP load; rate limits |
| No cache invalidation on rotation | Outage after a secret change |
| `aud` not checked | Any token from the issuer opens the API |
| Service token treated as a user | Audit trail lies; authorization bypass |
| Logging the Basic header | Secret in logs |
| Retrying `invalid_client` forever | Account lockout / alert storm |
| Using ROPC to “avoid” a service account | Password stored in code; no MFA; deprecated |

## Simulate it

- [Client credentials](#/sim/client-credentials) — the whole flow, including the token endpoint auth.
- [Multi-audience](#/sim/multi-audience) — why each API gets its own audience.
- [BFF exchange](#/sim/bff-exchange) — when the service acts for a user.

Next: [Scenario catalog & how to read the simulator](#/learn/09-scenario-catalog).
