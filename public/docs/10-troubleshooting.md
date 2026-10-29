# Troubleshooting playbook

Debug identity flows by **bisecting the hops**, not by changing random settings. Find the first hop that produces the wrong result; everything after it is a consequence.

## The first five questions

1. **Which role is failing?** OP, RP, BFF, proxy or token handler. The error message usually names the endpoint, which names the role.
2. **Is the failure in the front channel or the back channel?** A redirect error is different from a token endpoint error.
3. **What is the exact issuer/audience?** Copy them from the token, not from the config screen.
4. **What changed since it last worked?** Secret rotation, certificate, clock, DNS, a new redirect URI, a new scope.
5. **Can you reproduce it with a minimal client?** `curl` for back-channel, a browser with a clean profile for front-channel.

## Bisect the code flow

```
authorize request → login → redirect with code → token request → token response → API call
```

| Where it stops | Look at |
|---|---|
| No redirect to `/authorize` | Client config, discovery, RP provider URL |
| Error page at `/authorize` | Client ID, redirect URI, scope, response type, PKCE |
| Login page loops | Cookies, `state`, session store, clock |
| No `code` in the redirect | User cancelled, consent denied, policy denied, error parameter |
| `invalid_grant` at `/token` | Code expired/reused, redirect URI mismatch, PKCE mismatch, wrong client |
| `invalid_client` at `/token` | Secret mismatch, auth method, client disabled, clock (private_key_jwt) |
| Tokens returned, API 401 | Signature, issuer, audience, expiry, JWKS, token type |
| API 403 | Scope, entitlement, policy — authentication succeeded |

Write down the first failing hop. That is your bug.

## Error codes, decoded

### Authorization endpoint (redirect parameters)

| Error | Usual cause | Check |
|---|---|---|
| `invalid_request` | Missing/duplicate parameter, bad PKCE, `response_type` not allowed | The exact request URL; client registration |
| `unauthorized_client` | Client may not use this grant/response type | Grant types in the remote client |
| `access_denied` | User/policy refused, consent denied | Policy, consent, user state |
| `redirect_uri_mismatch` | Whitelist failure | Scheme, host, port, path, trailing slash, realm, URL encoding, or a wildcard that does not match the full URI |
| `invalid_scope` | Scope not registered for the client | Client scopes vs requested string |
| `login_required` | No session and prompt=none | SSO cookie, session lifetime |
| `interaction_required` | Step-up/MFA/consent needed | `acr`, policy, MFA enrolment |
| `consent_required` | Consent needed but prompt=none | Consent settings |

`redirect_uri_mismatch` deserves its own rule: **compare the bytes**. A trailing slash, `http` vs `https`, a default port, `%2F` vs `/`, uppercase host, or a different realm all count. Test with the exact value from the client’s config, not from memory.

### Token endpoint (JSON)

| Error | Usual cause | Check |
|---|---|---|
| `invalid_client` | Wrong secret, wrong auth method, client disabled, clock skew for assertions | Basic header encoding, secret version, `token_endpoint_auth_method` |
| `invalid_grant` | Code expired/reused, redirect URI mismatch, PKCE mismatch, refresh expired/revoked | Code lifetime, single use, verifier, session state |
| `invalid_request` | Missing grant/code/verifier, duplicate params, wrong content type | `application/x-www-form-urlencoded` |
| `invalid_scope` | Scope narrowed/widened at refresh | Original grant, client scopes |
| `unsupported_grant_type` | Grant not enabled for the client | Registration |
| `server_error` | OP-side failure | OP logs, attribute source, key store |

### API (401/403)

| Response | Meaning | Check |
|---|---|---|
| `401 invalid_token` | Signature/issuer/audience/expiry failed | JWKS, `iss`, `aud`, clock, token type |
| `401` with no body | Gateway rejected before the app | Gateway policy, header forwarding |
| `403 insufficient_scope` | Valid token, missing scope | Scope string, endpoint policy |
| `403` from BFF | CSRF or session policy | `X-CSRFTOKEN`, cookie, origin |
| `404` on an API route | Proxy route missing, not auth | Proxy resource mapping |

## Cookies

Most “login loop” bugs are cookies.

| Symptom | Check |
|---|---|
| Cookie set in the response but absent in the next request | Domain, `Path`, `Secure` over HTTP, `SameSite`, expiry, third-party blocking |
| Cookie exists but the app says unauthenticated | Wrong cookie name/path, two deployments sharing a host, session store not shared |
| Login works, then immediately logs out | Cookie overwritten by another realm/app, or session store misses |
| `SameSite=None` cookie rejected | Missing `Secure`; browser blocks it |
| Cookie not set at all | Response is a redirect before the session is created; callback error |
| Works in one browser, not another | Tracking prevention/ITP, extensions, cookie settings |

Debug with the browser’s application panel: look at domain, path, expiry, `HttpOnly`, `Secure`, `SameSite`, and whether the request actually carries it. Then check the server-side session store.

## CORS

CORS is a browser rule, not an authentication rule.

| Symptom | Cause |
|---|---|
| `No 'Access-Control-Allow-Origin'` on `/token` | A browser is calling the token endpoint; it should not |
| Preflight fails on `/bff/...` | The BFF did not allow the origin/method/header |
| Credentials missing | `Access-Control-Allow-Credentials: true` and an explicit origin (not `*`) |
| Cookie not sent cross-site | `SameSite` and `credentials: 'include'` on the fetch |
| Works in Postman | Postman does not enforce CORS |

If you see a CORS error on a token request, the architecture is wrong: the token endpoint is a back-channel API. Use a BFF or a public-client flow.

## Clocks

A few minutes of skew breaks `exp`, `nbf`, `iat` and SAML `NotBefore`.

- Sync with NTP on OneGate, the client and the API.
- Allow 60–120 seconds of leeway, not hours.
- Check the container/host clock, not just the app.
- A sudden wave of `invalid_token` after a deploy often means a clock or timezone change.

## JWKS and keys

| Symptom | Cause |
|---|---|
| `invalid signature` only after rotation | API cached old JWKS and does not refresh on unknown `kid` |
| All tokens invalid after a deploy | Signing key changed without publishing the old key during overlap |
| `kid` not found | Token signed by another issuer/environment, or JWKS URL points at the wrong realm |
| Works intermittently | Multiple instances with different key sets, or a stale cache |

Rules: cache JWKS, refresh on unknown `kid`, publish overlapping keys, and never validate with a key fetched from the token itself.

## Introspection

| Symptom | Cause |
|---|---|
| Every opaque token is inactive | Wrong introspection credentials, wrong endpoint, token sent in the wrong parameter |
| Revocation is slow | Positive introspection cached too long |
| API down when OP is down | No cache/failover; fail closed by design |
| `active: true` for a deleted user | Session/token not revoked at the OP; introspect claims only reflect token state |

## BFF-specific

| Symptom | Check |
|---|---|
| Redirect loop after login | Callback URI, `state` storage, cookie path/domain, session store |
| 403 on POST | `X-CSRFTOKEN` missing/stale, origin check |
| SPA gets 401 but user is logged in | BFF refresh failed; check refresh token and OP |
| Two tabs fight | Refresh rotation without single-flight per session |
| Logout does not stick | Only the cookie was cleared; server session/SSO still alive |
| Token visible in DevTools | Debug endpoint enabled or SPA calls it directly |
| API calls fail only through the BFF | Header stripping, audience, proxy rewrite |

## SAML-specific

| Error | Check |
|---|---|
| `Invalid signature` | Certificate, signed assertion vs response, canonicalisation |
| `Audience restriction failed` | SP EntityID / ACS URL mismatch |
| `Destination mismatch` | ACS URL, proxy rewriting, `Host` header |
| `Response expired` | Assertion lifetime, clock skew |
| `InResponseTo` mismatch | Lost request ID, load balancer without sticky sessions, replay |
| `Unknown principal` | NameID format/value, user mapping |
| Works IdP-initiated, not SP-initiated | `InResponseTo` handling, request storage |
| Works in test, not production | Different certificates/metadata per environment |

## Proxy-specific

| Symptom | Check |
|---|---|
| 502/504 | Upstream unreachable, TLS, DNS, timeout |
| Redirect loop | Proxy adds auth after the app redirects; Web Resource auth type/ACL wrong |
| App sees no user | Custom header not configured, wrong header name, or `X-` entered in Control Center |
| User can spoof identity | The app is reachable without the proxy, or the hop to the app is untrusted |
| Header sent as `X-X-USERID` | You entered `X-USERID` in **Send Custom Headers**; enter `USERID` |
| Static assets 401 | Proxy protects assets or the cookie path is too narrow |
| Wrong redirect host | `X-Forwarded-Host`/`Proto`, external URL config |

The manual’s model is **Authentication type = Normal** plus an **Access Control List**, with optional **Send Custom Headers**. There is no “resource SSO = BFF” mode; the BFF is a separate feature.

## Configuration did not apply

| Symptom | Check |
|---|---|
| Saved setting has no effect | **Maintenance → Activate Changes → Reload configuration** |
| Changed a file under `server/` but nothing changed | **Reindex files** is required |
| Edited the wrong host | **Virtual Host Selector** at the top left |
| Endpoints changed unexpectedly | Wrong realm or virtual host domain |
| Claims empty after adding a scope | The claim is not mapped in the attribute profile |

## Logs worth having

At OneGate:

- authorization request: client, redirect URI, scope, response type, PKCE present;
- login result: success/failure, user, provider, MFA;
- token request: client, grant, scope, result (never the secret or token);
- token validation: issuer, audience, result, reason;
- attribute lookup: subject, actor, cache hit/miss, latency, result;
- federation: partner, issuer, mapping result, clock skew.

At the API:

- `jti`, `sub` hash, `client_id`, `aud`, scope, result, reason;
- JWKS fetch/refresh;
- introspection latency and result.

Correlate with a request ID, not with a token.

## A five-minute triage

1. Reproduce in a private window; capture the exact URL and the first error.
2. Decode the token (or introspect it) and compare `iss`, `aud`, `exp`, `scope` with expectations.
3. Check the clock and the JWKS `kid`.
4. Check the cookie in the request, not just the response.
5. Check the one setting that changed most recently.

If none of that explains it, open [Self-check](#/selftest) to rule out a broken lab file, then read the matching scenario’s **Watch out** tab.

Next: [The Control Center, end to end](#/learn/11-control-center).
