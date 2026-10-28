# OneGate Learning Lab

An interactive, offline study aid for **OpenID Connect, OAuth 2.0, SAML, federation, BFF and attribute providers** — built around how OneGate behaves as a reverse proxy, OpenID Provider, Relying Party, Backend-for-Frontend and token handler.

Sixteen animated scenarios. A live token vault. Eleven written chapters. No build step, no dependencies, no network calls.

```
Browser → OneGate (proxy · OP · RP · BFF · token handler) → frontend · API · partner IdP
```

---

## Quick start

### Linux / macOS

```bash
./start.sh
```

or:

```bash
python3 start.py
```

### Windows

Double-click **`start.bat`**, or from a terminal:

```bat
py -3 start.py
```

The launcher serves `public/` on the first free port in **8080–8099** and opens your browser. Stop it with `Ctrl+C`.

```bash
python3 start.py --no-browser     # serve without opening a browser
python3 start.py --port 8080      # try 8080 first
python3 start.py --host 0.0.0.0   # reachable from the LAN (be deliberate)
```

**Requirement:** Python 3.8+ (stdlib only). No `pip install`.

### Optional Node launcher

If you have Node 18+ but not Python:

```bash
npm start
# or
node server.mjs --port 8080 --no-browser
```

The Python launcher is the primary path; both serve exactly the same static files.

> Open the site through the server, not as a `file://` URL. ES modules and the Markdown chapters are fetched over HTTP.

---

## What is in the lab

| Page | What it does |
|---|---|
| **Overview** (`#/`) | The topology, the five roles, where tokens may live, the learning path |
| **Learn** (`#/learn`) | Eleven chapters, rendered from Markdown with a table of contents |
| **Simulations** (`#/scenarios`) | Filter/search all 16 flows by category, level or keyword |
| **Simulator** (`#/sim/{id}`) | Animated stage, live token vault, HTTP wire view, config, pitfalls |
| **Compare** (`#/compare`) | JWT vs opaque, the storage matrix, a decision helper |
| **Glossary** (`#/glossary`) | Every acronym in plain language |
| **Self-check** (`#/selftest`) | Runtime validation of scenarios, tokens and all docs |

The simulator has five tabs per scenario:

- **Explain** — the current hop, actors, channel, tags and the full token journey.
- **Wire** — the HTTP request/response shape.
- **Tokens** — decode simulated JWTs, inspect cookies/opaque tokens/SAML XML.
- **Setup** — the OneGate configuration behind the flow.
- **Watch out** — operational pitfalls mapped to the steps.

Keyboard: `Space` play/pause, `←` `→` step, `R` restart. Click any vault chip to inspect it.

---

## The scenarios

### Foundations

| # | Scenario | Level | Steps | Teaches |
|---|---|---|---|---|
| 1 | [Client credentials](public/docs/09-scenario-catalog.md) | Core | 8 | A service authenticates with client ID + secret; no user, no refresh token |
| 2 | [JWT vs opaque](public/docs/07-tokens-and-lifecycle.md) | Core | 7–8 | Local validation vs introspection; revocation, latency, disclosure |

### Browser apps

| # | Scenario | Level | Steps | Teaches |
|---|---|---|---|---|
| 3 | Public SPA — Authorization Code + PKCE | Core | 13 | A public client logs in safely; the token still reaches JavaScript |
| 4 | Confidential web app | Core | 17 | Server-side code flow; browser gets only a session cookie |
| 5 | BFF login | Core | 19 | OneGate as OP **and** RP; cookie + CSRF; tokens stay server-side |
| 6 | Legacy app behind the proxy | Core | 14 | SSO without changing the app; trusted identity headers |

### Tokens, sessions and delegation

| # | Scenario | Level | Steps | Teaches |
|---|---|---|---|---|
| 7 | Refresh token rotation | Advanced | 10 | Rotate on use; reuse detection; revoke the family |
| 8 | Multi-audience | Advanced | 12 | One login, one token per API; `aud` and resource indicators |
| 9 | Logout | Core | 10 | Local session, OP session, partner session, revocation |
| 10 | BFF with a partner IdP | Advanced | 17 | The same BFF, federated; local user mapping; reject vs JIT |
| 11 | BFF exchange | Advanced | 13 | Delegation with `sub` + `act`; never trust `requested_subject` |

### Federation, SAML and attributes

| # | Scenario | Level | Steps | Teaches |
|---|---|---|---|---|
| 12 | Federation in — OneGate as RP | Advanced | 16 | Validate a partner ID token, map the user, enrich, create a local session |
| 13 | Federation in — OneGate as SAML SP | Advanced | 11 | Validate an inbound assertion; link the identity |
| 14 | Federation out — OneGate as SAML IdP | Advanced | 11 | Issue a signed assertion to a partner SP |
| 15 | Attribute provider (REST/JVAP) | Core | 14 | Lookup at issuance, caching, claims mapping |
| 16 | Delegated attributes | Advanced | 14 | The actor parameter; cache keyed by subject + actor |

Every scenario is reachable from the Simulations page and from the written chapters. The catalog with “start here if…” guidance is in [chapter 9](public/docs/09-scenario-catalog.md).

---

## The big picture

```
        untrusted                              trusted network
 ┌──────────────────┐        ┌──────────────────────────────┐        ┌─────────────────┐
 │  Browser / user  │───────▶│            OneGate           │───────▶│ Frontend server │
 │                  │◀───────│  proxy · OP · RP · BFF       │◀───────│ (SPA host / app)│
 └──────────────────┘        │  token handler · attr client │        └─────────────────┘
         │                   └───────┬──────────────┬───────┘
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

**The surprising part:** in the BFF flow OneGate talks to itself. The BFF uses an RP configuration; that RP's remote provider is OneGate's own Local Provider. Same protocol, same validation, no privileged shortcut. That is why the simulator wires `BFF → RP → OP` inside the same box.

Read [chapter 1](public/docs/01-architecture.md) for the trust boundaries and the five roles.

---

## Where tokens are allowed to live

| Credential | Browser | OneGate | Frontend / BFF | Backend API |
|---|---|---|---|---|
| Authorization code | One hop | Creates/consumes | Exchanges | Never |
| Access token (JWT) | SPA only, in memory | Yes | Yes | Validate, don't store |
| Access token (opaque) | SPA only, in memory | Yes | Yes | Introspect |
| Refresh token | **Never** | Yes | Confidential server only | Never |
| ID token | SPA briefly | Yes (RP) | Yes | **Never** |
| BFF cookie | Yes (HttpOnly) | Yes | No | No |
| Client secret | **Never** | Yes | Yes (confidential) | Only if it is the client |
| SAML assertion | One POST | Yes | No | No |
| CSRF token | Yes (readable) | Yes | Yes | No |

Two rules prevent most incidents:

1. **If JavaScript can read it, assume it will leak.**
2. **A cookie is not a token.** It points at server-side state and carries no claims.

The [Compare page](#/compare) has the full matrix and a JWT-vs-opaque decision helper. Every simulation's live vault shows the same information for the flow you are watching.

---

## Written chapters

All in [`public/docs/`](public/docs/), rendered by the site and readable on GitHub:

| # | Chapter | What it covers |
|---|---|---|
| 1 | [The big picture](public/docs/01-architecture.md) | Topology, five roles, trust boundaries, OneGate talking to itself |
| 2 | [OIDC & OAuth 2.0](public/docs/02-oidc-basics.md) | Roles, endpoints, code flow, PKCE, state/nonce, JWT anatomy, errors |
| 3 | [Configuring the OpenID Provider](public/docs/03-onegate-local-provider.md) | Local Providers, Realm Settings, Remote Clients, keys, a worked registration |
| 4 | [Federation: RP, SAML IdP, SAML SP](public/docs/04-federation-rp-saml.md) | Inbound OIDC, user mapping, assertions, NameID, validation |
| 5 | [Backend for Frontend](public/docs/05-bff.md) | Cookie/CSRF model, self-OP/RP, exchange, logout, the debug trap |
| 6 | [Attribute providers & JVAP](public/docs/06-attribute-providers.md) | Subject/actor/ext, signed requests, JsonPath, caching, delegation |
| 7 | [Tokens, storage and lifetimes](public/docs/07-tokens-and-lifecycle.md) | JWT vs opaque, storage, rotation, revocation, logging |
| 8 | [Server-to-server](public/docs/08-server-to-server.md) | Client credentials, secret rotation, audience design, exchange |
| 9 | [Scenario catalog](public/docs/09-scenario-catalog.md) | Every simulation, how to read the stage, suggested routes |
| 10 | [Troubleshooting](public/docs/10-troubleshooting.md) | Error codes, cookies, CORS, clocks, JWKS, SAML, a triage checklist |
| — | [Glossary](public/docs/glossary.md) | Every acronym in the lab |

The Markdown is the single source of truth: the site fetches and renders the same files you read on GitHub.

---

## Project structure

```
OIDC-OAUTH-BFF/
├── public/
│   ├── index.html               App shell and navigation
│   ├── assets/
│   │   ├── css/app.css           Design system, simulator, responsive, print
│   │   └── js/
│   │       ├── app.js            Hash router, theme, doc loader
│   │       ├── content.js        Chapter + category metadata
│   │       ├── markdown.js       Dependency-free Markdown renderer + TOC
│   │       ├── tokens.js         Simulated JWTs, stores, token kinds
│   │       ├── ui.js             Icons, toast, helpers
│   │       ├── pages/            Home, learn, list, simulator, compare, selftest
│   │       ├── scenarios/        Sixteen scenario definitions + helpers
│   │       └── sim/              Layout geometry + the animation player
│   └── docs/                     Eleven Markdown chapters
├── start.py                     Python stdlib server (primary launcher)
├── start.sh                     Linux/macOS launcher
├── start.bat                    Windows launcher
├── server.mjs                   Optional Node launcher
├── package.json                 `npm start` (type: module, no dependencies)
└── README.md
```

No bundler, no framework, no runtime dependency. The browser loads ES modules directly.

---

## How the simulation works

- A fixed **1000 × 600** virtual topology. Nodes are HTML positioned in percentages; wires are SVG paths in the same coordinate space.
- A scenario is plain data: `{ id, title, category, level, minutes, summary, nodes, nodeLabels, initial, variants, steps, notes, config, pitfalls }`.
- A step is `{ from, to, badge, detail, channel, http, vault, tags }`.
- The vault is recomputed from `initial` plus every step's `vault` operations (`add`, `del`, `clearStore`), so it is always consistent with the current step.
- JWT values are built with a fake signature but real base64url header/payload, so the inspector can decode them.
- The **token journey** table is generated from the same vault operations.

To add a scenario, create a file in `public/assets/js/scenarios/`, export the object, and register it in `scenarios/index.js`. Add a flow line and, if you like, a chapter link. Run [Self-check](#/selftest) to validate the data.

---

## Verification

- **Self-check** (`#/selftest`) validates scenario shape, actor IDs, channels, vault operations, token kinds, Markdown rendering and every doc fetch. It should report 100%.
- **curl** the routes: `/`, `/assets/js/app.js`, `/docs/01-architecture.md` should be 200.
- Browser check: open `#/`, `#/learn/01-architecture`, `#/sim/bff-login`, `#/compare`, `#/selftest`.

If a chapter 404s, make sure you are serving `public/` (the launcher does) rather than opening `index.html` from disk.

---

## Notes and disclaimers

- **Everything is simulated.** Tokens are structurally valid JWTs with fake signatures. No request leaves your browser.
- **Endpoint paths are illustrative.** Examples use `/mg-local/portal/...`, `/bff/login`, `/bff/callback`, `ONEGATE_BFF` and `X-CSRFTOKEN`. Real OneGate deployments generate their own paths, cookie names and menu labels; confirm them in your environment.
- Menu names follow the federation feature set (Local Providers, Realm Settings, Remote Clients, RP Authentication, Remote Providers, BFF, SAML IdP/SP, REST/JVAP attribute sources) and can differ slightly between versions.
- The lab is an unofficial study aid, not affiliated with the vendor. It is not a substitute for the product documentation or a security review.
- No analytics, no external fonts, no CDN, no cookies.

---

## License / use

Use it for training, onboarding and design reviews. If you adapt it, keep the “simulated, not real credentials” warning visible — the whole point is to learn where tokens go without putting real ones anywhere.
