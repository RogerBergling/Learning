# Scenario catalog & how to read the simulator

Seventeen scenarios, one fixed topology. This chapter explains the stage, the controls and what each scenario is for — so you can pick the right one instead of watching all of them in order.

The first scenario, [Control Center setup](#/sim/control-center-setup), is new in this edition: it is a configuration walkthrough based on the **OneGate Administration Manual** rather than a protocol flow. Start there if the menu names in the other scenarios feel unmotivated.

## The stage

```
 Browser ───────────────┐
                        │        ┌────────── OneGate ──────────┐        ┌── Frontend ──┐
 Partner IdP ───────────┼───────▶│ OP · RP · BFF · proxy       │───────▶│ SPA / web app│
                        │        │ token handler · attr client │        ├── Backend API─┤
 Attribute source ──────┘        └─────────────────────────────┘        └── Partner SP ─┘
```

- **Nodes** are the systems. OneGate has six **subnodes** so you can see which internal role is active: `OP`, `RP`, `BFF`, `proxy`, `token handler`, `attribute client`.
- **Wires** connect the active pair. The colour tells you the channel: blue = front channel, green = back channel, amber = cookie, violet = attribute call, orange = SAML.
- **Packets** carry the step badge along the wire. A ripple marks arrival.
- **Idle nodes** are dimmed and labelled “not used here” so you can see what the scenario deliberately avoids.
- **Self-steps** (same node → same node) pulse in place: internal processing, not network traffic.

## The panels

| Tab | What it shows |
|---|---|
| **Explain** | The current hop in prose, the actors, the channel and tags, plus the token journey |
| **Wire** | The HTTP request/response shape for the hop — headers, body, status |
| **Tokens** | The live vault, decoded JWTs, opaque token notes, cookie flags, SAML XML |
| **Setup** | The OneGate configuration that would produce this behaviour |
| **Watch out** | Operational pitfalls, mapped to the steps above |

The **live token vault** on the right is the most important part. It is recomputed after every step from the scenario’s initial state plus all vault mutations. Click any chip to inspect that credential. The **token journey** table (inside Explain) summarises issued → stored → removed.

## Controls

| Control | Action |
|---|---|
| **Play / Pause** | Auto-advance with a dwell time |
| **← / →** | Previous / next step |
| **Restart** | Back to step 1 |
| **Speed** | 0.6× to 2.4× |
| **Steps list** | Click any step to jump |
| **Keyboard** | `Space` play/pause, `←` `→` step, `R` restart |

The simulator respects `prefers-reduced-motion`: packets jump to their destination instead of animating.

## The scenarios

### Setup walkthrough

| Scenario | Level | Steps | Minutes | What it teaches | Start here if… |
|---|---|---|---|---|---|
| [Control Center setup](#/sim/control-center-setup) | Core | 15 | 14 | Where each object lives: Virtual Host Selector, Local Provider, Realm Settings, Remote Client, RP, BFF, Web Resource + ACL, attribute source, Activate Changes | You are configuring OneGate for the first time |

### Foundations

| Scenario | Level | Steps | Minutes | What it teaches | Start here if… |
|---|---|---|---|---|---|
| [Client credentials](#/sim/client-credentials) | Core | 8 | 6 | A service authenticates with client ID + secret; no user, no refresh token; token endpoint auth. The Administration Manual does not document this grant — treat it as generic OAuth | You are connecting two backends |
| [JWT vs opaque](#/sim/token-formats) | Core | 7–8 | 8 | The API either validates locally or introspects; trade-offs in latency, revocation and disclosure. The manual mentions introspection only as claim context; no endpoint settings are documented | You are choosing a token format |

### Browser apps

| Scenario | Level | Steps | Minutes | What it teaches | Start here if… |
|---|---|---|---|---|---|
| [Public SPA — PKCE](#/sim/spa-pkce) | Core | 13 | 9 | A public client uses the code flow with PKCE; the access token still ends up in JavaScript | You are building a SPA without a backend |

### Confidential apps & tokens

| Scenario | Level | Steps | Minutes | What it teaches | Start here if… |
|---|---|---|---|---|---|
| [Confidential web app](#/sim/webapp-confidential) | Core | 17 | 11 | The web tier holds the secret and tokens; the browser only gets a session cookie | You have a server-rendered app |
| [Refresh rotation](#/sim/refresh-rotation) | Advanced | 10 | 9 | Rotate on every use; detect reuse; revoke the family | Sessions outlive access tokens |
| [Multi-audience](#/sim/multi-audience) | Advanced | 12 | 7 | A token for orders must not open billing; audience and resource indicators | You have more than one API |

### BFF & sessions

| Scenario | Level | Steps | Minutes | What it teaches | Start here if… |
|---|---|---|---|---|---|
| [BFF login](#/sim/bff-login) | Core | 19 | 13 | OneGate as OP and RP; cookie + CSRF; tokens stay server-side | You are designing a SPA + API |
| [BFF with a partner IdP](#/sim/bff-thirdparty) | Advanced | 17 | 12 | The same BFF, federated; local user mapping; reject vs JIT | Your users come from a partner |
| [BFF exchange](#/sim/bff-exchange) | Advanced | 13 | 10 | Delegation with `sub` + `act`; never trust `requested_subject` | Support staff act for customers |
| [Logout](#/sim/logout) | Core | 10 | 8 | Local session, OP session, partner session, token revocation | “Logout” is not clearing a cookie |

### Federation & SAML

| Scenario | Level | Steps | Minutes | What it teaches | Start here if… |
|---|---|---|---|---|---|
| [Federation in — RP](#/sim/fed-oidc-inbound) | Advanced | 16 | 12 | Validate a partner ID token, map the user, enrich, create a local session | You consume a partner OIDC IdP |
| [Federation out — SAML IdP](#/sim/fed-saml-idp) | Advanced | 11 | 11 | OneGate issues a signed assertion to a partner SP | A partner app only speaks SAML |
| [Federation in — SAML SP](#/sim/fed-saml-sp) | Advanced | 11 | 10 | Validate an inbound assertion, link the user, create a local session | A partner IdP initiates SSO |

### Attributes & proxy

| Scenario | Level | Steps | Minutes | What it teaches | Start here if… |
|---|---|---|---|---|---|
| [Attribute source](#/sim/attr-rest) | Core | 14 | 10 | REST attribute lookup at issuance, `realm`/`subject`/`requested_attributes`, caching, claim mapping | Entitlements live outside the user store |
| [Delegated attributes](#/sim/attr-delegation) | Advanced | 14 | 9 | The `actor` object; cache keyed by subject + actor | An agent looks up a customer |
| [Legacy proxy SSO](#/sim/legacy-proxy-sso) | Core | 14 | 9 | Web Resource + normal authentication + ACL, then a configured `X-USERID` header; change no app code | The app cannot do OIDC |

## Suggested routes

**Ten minutes:** [BFF login](#/sim/bff-login) with the Tokens tab open. Then [JWT vs opaque](#/sim/token-formats).

**Configuration first:** [Control Center setup](#/sim/control-center-setup) → [Local Provider chapter](#/learn/03-onegate-local-provider) → [BFF login](#/sim/bff-login).

**An afternoon:** architecture chapter → OIDC basics → Control Center setup → BFF login → confidential web app → JWT vs opaque → refresh rotation → logout.

**Production review:** token formats → refresh rotation → multi-audience → BFF → logout → attribute source → federation.

**Federation project:** RP inbound → SAML IdP → SAML SP → BFF with partner IdP → attribute source.

**Incident prep:** BFF exchange → delegated attributes → logout → troubleshooting chapter.

## Reading a step

Each step has:

- a **badge** (the packet label, often the HTTP call);
- **from → to** actors, including the OneGate subnode;
- a **channel** (front, back, cookie, attribute, internal, SAML);
- **detail** prose with the “why”;
- optional **HTTP** shape;
- optional **vault** changes;
- **tags** for scanning.

When a step says `OneGate · BFF → OneGate · RP`, that is not an error. It is the BFF delegating to its RP configuration, which then talks to the OP. OneGate is allowed to be on both ends of a wire.

## What the simulator does not model

- Real cryptography, key rotation or certificate validation.
- Network latency, retries, load balancers, WAFs.
- Multi-tenant routing or per-realm virtual hosts beyond labels.
- Browser cookie jars, third-party cookie blocking, ITP.
- The exact HTML of the OneGate admin UI.

Use it to build the mental model, then verify the details in your own deployment. Endpoint paths in the lab are illustrative; real paths are generated per realm.

## Self-check

If a scenario looks broken, open [Self-check](#/selftest). It validates the scenario data, the token simulation and every Markdown chapter at runtime, and lists any failing assertion with a reason.

Next: [Troubleshooting playbook](#/learn/10-troubleshooting).
