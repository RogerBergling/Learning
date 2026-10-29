import { DOCS, LEARNING_PATH, docBySlug } from '../content.js';
import { SCENARIOS, featuredScenarios, categoryCounts } from '../scenarios/index.js';
import { scenarioCard, docCard } from './cards.js';
import { icon, esc } from '../ui.js';

function heroArt() {
  return `<svg class="hero-svg" viewBox="0 0 560 380" role="img" aria-label="Browser talks to OneGate, which acts as proxy, provider, relying party, BFF and token handler in front of apps, APIs and partner identity providers.">
    <defs>
      <linearGradient id="ogGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/>
        <stop offset="1" stop-color="var(--accent-2)" stop-opacity=".10"/>
      </linearGradient>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 10 5 0 10Z" fill="var(--accent)" opacity=".8"/>
      </marker>
    </defs>

    <!-- links -->
    <g fill="none" stroke-width="1.6" opacity=".8">
      <path class="flow-line" d="M124 190 C 150 190, 155 150, 170 150" marker-end="url(#arrow)"/>
      <path class="flow-line d2" d="M170 250 C 150 250, 150 210, 124 210" marker-end="url(#arrow)"/>
      <path class="flow-line d3" d="M380 130 C 405 130, 405 100, 428 100" marker-end="url(#arrow)"/>
      <path class="flow-line d4" d="M380 210 C 405 210, 405 210, 428 210" marker-end="url(#arrow)"/>
      <path class="flow-line d2" d="M380 285 C 405 285, 405 310, 428 310" marker-end="url(#arrow)"/>
    </g>

    <!-- browser -->
    <g>
      <rect x="10" y="150" width="114" height="100" rx="14" fill="var(--bg-elev)" stroke="var(--line-strong)"/>
      <rect x="10" y="150" width="114" height="23" rx="14" fill="var(--panel-2)"/>
      <circle cx="24" cy="161" r="2.4" fill="var(--danger)" opacity=".8"/>
      <circle cx="32" cy="161" r="2.4" fill="var(--warn)" opacity=".8"/>
      <circle cx="40" cy="161" r="2.4" fill="var(--ok)" opacity=".8"/>
      <text x="67" y="199" text-anchor="middle" class="hs-title">Browser</text>
      <text x="67" y="216" text-anchor="middle" class="hs-sub">no tokens</text>
      <text x="67" y="232" text-anchor="middle" class="hs-sub">cookie only</text>
    </g>

    <!-- OneGate -->
    <rect x="170" y="52" width="210" height="276" rx="18" fill="url(#ogGrad)" stroke="var(--accent)" stroke-opacity=".55"/>
    <text x="275" y="76" text-anchor="middle" class="hs-brand">OneGate</text>
    <text x="275" y="91" text-anchor="middle" class="hs-sub">one product, five jobs</text>

    <g class="hs-rows">
      <rect x="184" y="104" width="182" height="32" rx="8" fill="var(--bg-elev)" stroke="var(--line)"/>
      <text x="196" y="124" class="hs-row">Reverse proxy</text><text x="352" y="124" text-anchor="end" class="hs-sub">/app</text>

      <rect x="184" y="142" width="182" height="32" rx="8" fill="var(--bg-elev)" stroke="var(--line)"/>
      <text x="196" y="162" class="hs-row">OpenID Provider</text><text x="352" y="162" text-anchor="end" class="hs-sub">/authorize</text>

      <rect x="184" y="180" width="182" height="32" rx="8" fill="var(--bg-elev)" stroke="var(--line)"/>
      <text x="196" y="200" class="hs-row">Relying Party</text><text x="352" y="200" text-anchor="end" class="hs-sub">federation</text>

      <rect x="184" y="218" width="182" height="32" rx="8" fill="var(--bg-elev)" stroke="var(--line)"/>
      <text x="196" y="238" class="hs-row">BFF</text><text x="352" y="238" text-anchor="end" class="hs-sub">cookie + CSRF</text>

      <rect x="184" y="256" width="182" height="32" rx="8" fill="var(--bg-elev)" stroke="var(--line)"/>
      <text x="196" y="276" class="hs-row">Token handler</text><text x="352" y="276" text-anchor="end" class="hs-sub">issue · introspect</text>
    </g>
    <text x="275" y="310" text-anchor="middle" class="hs-sub">session store · keys · attribute cache</text>

    <!-- right column -->
    <g>
      <rect x="428" y="72" width="122" height="58" rx="12" fill="var(--bg-elev)" stroke="var(--line-strong)"/>
      <text x="489" y="97" text-anchor="middle" class="hs-row">Frontend</text>
      <text x="489" y="114" text-anchor="middle" class="hs-sub">SPA host / web app</text>

      <rect x="428" y="180" width="122" height="58" rx="12" fill="var(--bg-elev)" stroke="var(--line-strong)"/>
      <text x="489" y="205" text-anchor="middle" class="hs-row">Backend API</text>
      <text x="489" y="222" text-anchor="middle" class="hs-sub">validates tokens</text>

      <rect x="428" y="282" width="122" height="58" rx="12" fill="var(--bg-elev)" stroke="var(--line-strong)"/>
      <text x="489" y="307" text-anchor="middle" class="hs-row">Partner IdP</text>
      <text x="489" y="324" text-anchor="middle" class="hs-sub">Entra · SAML · OIDC</text>
    </g>

    <g class="hs-legend">
      <rect x="10" y="316" width="114" height="52" rx="10" fill="var(--panel-2)" stroke="var(--line)"/>
      <text x="22" y="335" class="hs-sub">Everything on the left</text>
      <text x="22" y="350" class="hs-sub">of OneGate is untrusted.</text>
      <text x="22" y="363" class="hs-sub">Everything on the right is not.</text>
    </g>
  </svg>`;
}

const ROLES = [
  {
    icon: 'proxy',
    title: 'Reverse proxy',
    text: 'Sits in front of the legacy app as a Web Resource, enforces an Access Control List and injects configured custom headers. The app keeps its old URLs and its old code.',
    link: '#/sim/legacy-proxy-sso',
    cta: 'Legacy app behind the proxy',
  },
  {
    icon: 'gate',
    title: 'OpenID Provider',
    text: 'Its Local Provider issues authorization codes, access tokens, ID tokens and refresh tokens — for its own apps and for federated ones.',
    link: '#/sim/bff-login',
    cta: 'Watch it issue tokens',
  },
  {
    icon: 'cloud',
    title: 'Relying Party',
    text: 'It can also consume someone else\'s identity: a partner Entra tenant, a SAML IdP, or its own Local Provider. OneGate talks to itself through the same protocol.',
    link: '#/sim/fed-oidc-inbound',
    cta: 'Inbound federation',
  },
  {
    icon: 'lock',
    title: 'BFF & token handler',
    text: 'Keeps tokens server-side, gives the browser an HttpOnly cookie, refreshes silently, exchanges tokens and validates them for APIs.',
    link: '#/sim/bff-login',
    cta: 'The flagship BFF flow',
  },
];

const STORE_NOTES = [
  {
    icon: 'browser',
    title: 'Browser',
    good: 'The BFF session cookie, an SSO session cookie, a one-time authorization code for one hop.',
    bad: 'Access tokens, refresh tokens, client secrets, SAML assertions you did not ask for.',
    tone: 'warn',
  },
  {
    icon: 'gate',
    title: 'OneGate',
    good: 'Codes, tokens, login transactions, PKCE verifiers, attribute cache, signing keys.',
    bad: 'Long-lived secrets in logs. Debug endpoints that return the access token.',
    tone: 'ok',
  },
  {
    icon: 'server',
    title: 'Frontend / BFF tier',
    good: 'A server-side session, a CSRF token, a cache keyed by session.',
    bad: 'A refresh token in localStorage “because the SPA needs it”.',
    tone: 'warn',
  },
  {
    icon: 'database',
    title: 'Backend API',
    good: 'Validated claims: subject, scope, audience, tenant. Maybe a JWKS cache.',
    bad: 'The raw access token, copied into every log line.',
    tone: 'ok',
  },
];

const STEPS = [
  ['Read the map', 'Start with the big picture, then the OIDC primitives. Twenty minutes, no simulator yet.'],
  ['Watch the flagship', 'Run the BFF login simulation. Pause on every hop and watch the token vault.'],
  ['Choose your app type', 'SPA, confidential web app, service, legacy proxy or federation. One of them is your Monday.'],
  ['Break it on purpose', 'Read the “Watch out” tab, then compare JWT and opaque validation in the Compare page.'],
];

export function renderHome(view) {
  const featured = featuredScenarios();
  const featuredIds = new Set(featured.map((s) => s.id));
  const extra = SCENARIOS.filter((s) => !featuredIds.has(s.id)).slice(0, 3);
  const counts = categoryCounts();
  const categories = Object.keys(counts).length;
  const chapters = DOCS.length;

  view.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">Interactive · zero dependencies · runs offline</p>
        <h1>See exactly where the <em>tokens</em> go.</h1>
        <p class="hero-lede">
          OneGate can be a reverse proxy, an OpenID Provider, a Relying Party, a Backend-for-Frontend
          and a token handler — sometimes all in the same request. This lab animates each role, hop by
          hop, and shows which credential lives where at every moment.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/sim/bff-login">${icon('play', 16)} Start the BFF flow</a>
          <a class="btn" href="#/learn/01-architecture">${icon('book', 16)} Read the architecture</a>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><strong>${SCENARIOS.length}</strong><span>scenarios</span></div>
          <div class="hero-stat"><strong>${chapters}</strong><span>chapters</span></div>
          <div class="hero-stat"><strong>${categories}</strong><span>topic areas</span></div>
          <div class="hero-stat"><strong>7</strong><span>trust stores</span></div>
        </div>
      </div>
      <div class="hero-art">${heroArt()}</div>
    </section>

    <section class="section-head">
      <div>
        <h2>Five jobs, one product</h2>
        <p>The same box plays every role. The trick is knowing which role is active at each hop — and which credential it is allowed to see.</p>
      </div>
      <a class="btn btn-ghost btn-sm" href="#/learn/01-architecture">${icon('arrow', 14)} The big picture</a>
    </section>

    <div class="cards">
      ${ROLES.map((r) => `<a class="card role-card" href="${r.link}">
        <div class="card-icon">${icon(r.icon, 18)}</div>
        <h3>${esc(r.title)}</h3>
        <p>${esc(r.text)}</p>
        <div class="card-meta"><span class="pill accent">${esc(r.cta)}</span></div>
      </a>`).join('')}
    </div>

    <section class="section-head">
      <div>
        <h2>Where tokens are allowed to live</h2>
        <p>This is the question behind most real-world incidents. The simulator's live vault tracks it for every scenario.</p>
      </div>
      <a class="btn btn-ghost btn-sm" href="#/compare">${icon('layers', 14)} Storage matrix</a>
    </section>

    <div class="store-grid">
      ${STORE_NOTES.map((s) => `<div class="store-card ${s.tone}">
        <div class="store-head">${icon(s.icon, 17)}<strong>${esc(s.title)}</strong></div>
        <p class="store-good"><b>Fine here</b>${esc(s.good)}</p>
        <p class="store-bad"><b>Never here</b>${esc(s.bad)}</p>
      </div>`).join('')}
    </div>

    <section class="section-head">
      <div>
        <h2>The learning path</h2>
        <p>Read the map, then watch it move. Every chapter links to the simulations that demonstrate it.</p>
      </div>
      <a class="btn btn-ghost btn-sm" href="#/learn">${icon('book', 14)} All chapters</a>
    </section>

    <div class="path-grid">
      ${STEPS.map(([title, text], i) => `<div class="path-step">
        <span class="path-num">${String(i + 1).padStart(2, '0')}</span>
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
      </div>`).join('')}
    </div>

    <div class="path-list">
      ${LEARNING_PATH.map((slug, i) => {
        const d = docBySlug(slug);
        return d ? `<a href="#/learn/${d.slug}"><span class="pl-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="pl-title">${esc(d.title)}</span><span class="pl-meta">${d.minutes} min</span></a>` : '';
      }).join('')}
    </div>

    <section class="section-head">
      <div>
        <h2>Start with one of these</h2>
        <p>Flagship flows, chosen because they teach the most in the fewest hops.</p>
      </div>
      <a class="btn btn-ghost btn-sm" href="#/scenarios">${icon('arrow', 14)} All ${SCENARIOS.length} simulations</a>
    </section>

    <div class="scenario-grid">
      ${featured.map(scenarioCard).join('')}
      ${extra.map(scenarioCard).join('')}
    </div>

    <section class="section-head">
      <div>
        <h2>Or read the manual-first version</h2>
        <p>The written chapters are the source of truth; the simulator is the illustration.</p>
      </div>
    </section>
    <div class="cards">
      ${DOCS.slice(0, 3).map(docCard).join('')}
    </div>

    <div class="home-foot">
      <div class="callout ok">
        <strong>Everything here is simulated.</strong> Tokens are structurally valid JWTs with fake signatures.
        No request leaves your browser. Endpoint paths such as <code>/mg-local/portal/...</code> are illustrative —
        your OneGate deployment generates its own.
      </div>
      <p class="dim">Not affiliated with the vendor. Built as a study aid for the OneGate federation feature set.
        <a href="#/selftest">Run the self-check</a> if something looks broken.</p>
    </div>
  `;
}
