import { esc, icon } from '../ui.js';

const OK = '<span class="mx ok">✓</span>';
const CARE = '<span class="mx care">~</span>';
const NO = '<span class="mx no">✗</span>';

const MATRIX = [
  ['Authorization code', CARE, OK, CARE, NO, 'One hop in the browser; consumed by whoever holds the client credentials.'],
  ['Access token (JWT)', CARE, OK, OK, OK, 'A SPA can hold it in memory; a server should keep it out of logs.'],
  ['Access token (opaque)', CARE, OK, OK, OK, 'Unreadable by design; the API needs an introspection call or a gateway.'],
  ['Refresh token', NO, OK, OK, NO, 'Only in a confidential server-side store with rotation and reuse detection.'],
  ['ID token', CARE, OK, OK, NO, 'Proof of authentication for the client — never an API credential.'],
  ['BFF session cookie', OK, OK, NO, NO, 'HttpOnly, Secure, SameSite; useless to any other tier by design.'],
  ['Client secret', NO, OK, OK, CARE, 'Only where the client itself runs. Never in a browser, never in git.'],
  ['SAML assertion', CARE, OK, NO, NO, 'Signed XML for the SP; POST binding carries it through the browser once.'],
  ['CSRF token', OK, OK, OK, NO, 'Readable by the page on purpose. It is not an authentication secret.'],
];

const APP_TYPES = [
  { id: 'spa', label: 'Single-page app' },
  { id: 'web', label: 'Server-rendered web app' },
  { id: 'service', label: 'Service / daemon' },
  { id: 'bff', label: 'BFF you control' },
  { id: 'legacy', label: 'Legacy app behind proxy' },
];

const API_MODES = [
  { id: 'jwt', label: 'Validate JWTs locally' },
  { id: 'introspect', label: 'Introspect opaque tokens' },
  { id: 'audience', label: 'One token per API' },
];

const VERDICTS = {
  'spa:jwt': {
    title: 'Authorization Code + PKCE, JWT access token in memory',
    body: 'The SPA is a public client: no secret, no refresh token in storage. Keep the access token in a variable (not localStorage), keep it short-lived (5–15 min), and let a silent re-login get a new one. Add a strict CSP because any XSS now steals a live credential.',
    sims: ['spa-pkce', 'token-formats'],
  },
  'spa:introspect': {
    title: 'Prefer a BFF — or accept the introspection round trip',
    body: 'A public client cannot keep an introspection secret, so either the API calls the OP itself with its own credentials, or you put a BFF in front. Introspection per request is correct but adds a network hop and a hard dependency on the OP. If you control the frontend tier, the BFF removes the browser token entirely.',
    sims: ['bff-login', 'token-formats'],
  },
  'spa:audience': {
    title: 'Move the exchange server-side',
    body: 'A browser cannot safely perform a token exchange or hold a second audience’s credentials. Use a BFF: the browser keeps one cookie, the BFF obtains or exchanges the token for the specific API.',
    sims: ['bff-login', 'bff-exchange', 'multi-audience'],
  },
  'web:jwt': {
    title: 'Confidential code flow + server-side session',
    body: 'The web tier holds the client secret and exchanges the code on the back channel. The browser only gets a session cookie. The access token stays in the server session and is attached to API calls by the server, not the page. Validate the JWT signature against JWKS and enforce `aud`, `iss`, `exp` and scope.',
    sims: ['webapp-confidential', 'bff-login'],
  },
  'web:introspect': {
    title: 'Confidential code flow + opaque tokens + rotation',
    body: 'Use opaque access tokens when instant revocation matters more than local validation. Keep the refresh token server-side, rotate it on every use and treat a reused refresh token as a breach signal. Cache introspection results for no longer than the token’s remaining lifetime.',
    sims: ['token-formats', 'refresh-rotation', 'webapp-confidential'],
  },
  'web:audience': {
    title: 'One login, one token per downstream API',
    body: 'Request the audience you need for each call, or exchange a base token for an audience-scoped one. Never forward a token to an API that is not in its `aud` — that is how confused-deputy bugs start.',
    sims: ['multi-audience', 'bff-exchange'],
  },
  'service:jwt': {
    title: 'Client credentials, short-lived JWT',
    body: 'No user, no browser, no refresh token. The service authenticates with `client_id` + secret (or, better, mTLS / private_key_jwt) and requests only the scope it needs. Cache the token until shortly before `exp`; do not request one per call.',
    sims: ['client-credentials', 'token-formats'],
  },
  'service:introspect': {
    title: 'Client credentials + introspection',
    body: 'The calling service authenticates itself, gets an opaque token, and the receiving API introspects it. That gives instant revocation at the cost of a round trip. Cache the introspection response briefly and pin the OP connection.',
    sims: ['client-credentials', 'token-formats'],
  },
  'service:audience': {
    title: 'One token per audience, cached separately',
    body: 'A service that calls three APIs should hold three tokens (or exchange one), keyed by audience. Reusing a token across audiences defeats the audience check and widens the blast radius of a leak.',
    sims: ['client-credentials', 'multi-audience'],
  },
  'bff:jwt': {
    title: 'BFF with a local OP and server-side JWT',
    body: 'This is the reference design: the SPA has no tokens, the BFF runs the code flow against its RP configuration, keeps access + refresh tokens server-side, and proxies API calls with the bearer token. The browser only holds an HttpOnly cookie plus a CSRF token.',
    sims: ['bff-login', 'logout'],
  },
  'bff:introspect': {
    title: 'BFF + opaque tokens',
    body: 'Same cookie model, but the proxy or the API introspects. Good when the OP must be able to kill sessions instantly. Watch the latency budget: cache introspection results per token for a few seconds at most.',
    sims: ['bff-login', 'token-formats', 'logout'],
  },
  'bff:audience': {
    title: 'BFF + exchange for delegated calls',
    body: 'Keep the user’s base token in the BFF session, then exchange it for an audience-scoped or actor-scoped token when an agent or a downstream API needs to know both who the user is and who is calling. Never let the browser ask for an arbitrary audience.',
    sims: ['bff-exchange', 'multi-audience', 'attr-delegation'],
  },
  'legacy:jwt': {
    title: 'Proxy SSO with a bearer token towards the app',
    body: 'OneGate terminates authentication, validates its cookie, and injects identity headers or an `Authorization` header towards the legacy app. Strip any inbound identity headers at the edge so clients cannot spoof them, and keep the legacy app on a network path that only the proxy can reach.',
    sims: ['legacy-proxy-sso'],
  },
  'legacy:introspect': {
    title: 'Proxy SSO + opaque token for the app',
    body: 'If the legacy app can call an introspection endpoint, give it an opaque token and let it validate. If it cannot, let the proxy validate and inject trusted headers instead — do not hand the app a token it will ignore.',
    sims: ['legacy-proxy-sso', 'token-formats'],
  },
  'legacy:audience': {
    title: 'Proxy SSO + audience-scoped token',
    body: 'Issue or exchange a token whose `aud` is the legacy app’s API. That keeps the legacy app from accepting a token minted for a different service, which is the usual failure when one broad token is reused everywhere.',
    sims: ['legacy-proxy-sso', 'multi-audience'],
  },
};

export function renderCompare(view) {
  view.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">Compare</p>
      <h1>Choose the shape before the settings</h1>
      <p class="page-lede">
        The same OneGate features can produce very different architectures. These tables are the short version:
        what a token format buys you, where each credential is allowed to live, and which flow fits your client.
      </p>
    </header>

    <section class="section-head"><div><h2>JWT or opaque?</h2>
      <p>Not a religious question. It is a trade between local validation and instant control.</p></div></section>

    <div class="table-wrap">
      <table class="compare-table">
        <thead><tr><th>&nbsp;</th><th>JWT access token</th><th>Opaque access token</th></tr></thead>
        <tbody>
          <tr><td>What the API sees</td><td>Signed claims it can read: <code>sub</code>, <code>scope</code>, <code>aud</code>, <code>exp</code>.</td><td>A meaningless string, e.g. <code>at_9f2…</code>. Claims only via introspection.</td></tr>
          <tr><td>Validation</td><td>Local: signature via JWKS, then <code>iss</code>, <code>aud</code>, <code>exp</code>, <code>nbf</code>, scope.</td><td>Remote: POST the token to <code>/introspect</code> with client credentials; check <code>active</code>.</td></tr>
          <tr><td>Revocation</td><td>Delayed: valid until <code>exp</code> unless you keep a deny-list.</td><td>Immediate: the OP says <code>active: false</code>.</td></tr>
          <tr><td>Latency</td><td>One cached JWKS fetch, then CPU only.</td><td>One OP round trip per check, or a short cache.</td></tr>
          <tr><td>Failure mode</td><td>Revoked token still works until expiry. Key rotation must be handled.</td><td>OP down → API down, unless you cache.</td></tr>
          <tr><td>Size</td><td>Hundreds of bytes to a few KB. Travels on every request.</td><td>Tens of bytes. Small and log-friendly.</td></tr>
          <tr><td>Best fit</td><td>Many APIs, low latency, short lifetimes, gateway validation.</td><td>High-assurance revocation, central policy, low token volume.</td></tr>
          <tr><td>Typical trap</td><td>Putting a PII-heavy token in a URL or a log; forgetting <code>aud</code>.</td><td>Introspecting on every request without caching; leaking the introspect secret.</td></tr>
        </tbody>
      </table>
    </div>

    <div class="callout">
      <strong>Try both.</strong> The <a href="#/sim/token-formats">JWT vs opaque</a> simulation has a segmented
      switch at the top. Same flow, different validation path — watch the API’s hop and the token inspector.
    </div>

    <section class="section-head"><div><h2>Where each credential may live</h2>
      <p>✓ allowed · ~ only with care and a specific reason · ✗ do not do this.</p></div></section>

    <div class="table-wrap">
      <table class="compare-table matrix-table">
        <thead><tr><th>Credential</th><th>Browser</th><th>OneGate</th><th>Frontend / BFF</th><th>Backend API</th><th>Why</th></tr></thead>
        <tbody>
          ${MATRIX.map(([name, b, o, f, api, why]) => `<tr>
            <td><strong>${esc(name)}</strong></td><td>${b}</td><td>${o}</td><td>${f}</td><td>${api}</td>
            <td class="why">${esc(why)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="grid-2 mt-2">
      <div class="callout danger"><strong>The browser is not confidential.</strong> Any value JavaScript can read can be exfiltrated by an XSS bug, a malicious dependency, a browser extension or the user themselves. A secret in a SPA is not a secret.</div>
      <div class="callout ok"><strong>A cookie is not a token.</strong> The BFF cookie is a pointer to server-side state. It carries no identity, no claims and no API permission. That is precisely why it is safe to keep there.</div>
    </div>

    <section class="section-head"><div><h2>Decision helper</h2>
      <p>Two answers, one recommended shape. This is a teaching heuristic, not a compliance ruling.</p></div></section>

    <div class="decision" data-decision>
      <div class="q">1. What kind of client are you building?</div>
      <div class="choice-row" data-apps>
        ${APP_TYPES.map((a) => `<button class="choice${a.id === 'spa' ? ' sel' : ''}" type="button" data-app="${a.id}">${esc(a.label)}</button>`).join('')}
      </div>
      <div class="q" style="margin-top:1rem">2. How should the API validate the access token?</div>
      <div class="choice-row" data-modes>
        ${API_MODES.map((m) => `<button class="choice${m.id === 'jwt' ? ' sel' : ''}" type="button" data-mode="${m.id}">${esc(m.label)}</button>`).join('')}
      </div>
      <div class="verdict" data-verdict aria-live="polite"></div>
    </div>

    <section class="section-head"><div><h2>Lifetime starting points</h2>
      <p>Short enough to limit damage, long enough to avoid a request storm. Adjust to your risk model.</p></div></section>

    <div class="table-wrap">
      <table class="compare-table">
        <thead><tr><th>Credential</th><th>Typical lifetime</th><th>Renewal</th><th>Note</th></tr></thead>
        <tbody>
          <tr><td>Authorization code</td><td>30–60 s</td><td>Never — single use</td><td>Bind it to PKCE and the exact <code>redirect_uri</code>.</td></tr>
          <tr><td>Access token</td><td>5–15 min</td><td>Refresh or re-authorize</td><td>Shorter if it grants write access or high-value data.</td></tr>
          <tr><td>ID token</td><td>5–60 min</td><td>New authentication</td><td>It proves a login happened; it is not a session.</td></tr>
          <tr><td>Refresh token</td><td>Hours to days</td><td>Rotate on every use</td><td>Absolute session lifetime should still cap it.</td></tr>
          <tr><td>BFF session</td><td>30 min idle, 8–12 h absolute</td><td>Sliding or step-up</td><td>Server-side; the cookie only points at it.</td></tr>
          <tr><td>JWKS cache</td><td>Minutes to hours</td><td>Respect <code>Cache-Control</code>, refresh on <code>kid</code> miss</td><td>Never fetch JWKS per request.</td></tr>
        </tbody>
      </table>
    </div>

    <p class="dim" style="margin-top:1.4rem">Still unsure? Run <a href="#/sim/bff-login">BFF login</a> and
      <a href="#/sim/webapp-confidential">the confidential web app</a> back to back, then read
      <a href="#/learn/07-tokens-and-lifecycle">chapter 7</a>.</p>
  `;

  const box = view.querySelector('[data-decision]');
  const verdict = view.querySelector('[data-verdict]');
  let app = 'spa';
  let mode = 'jwt';

  function paint() {
    const v = VERDICTS[`${app}:${mode}`];
    verdict.innerHTML = `<strong>${esc(v.title)}</strong><p style="margin:.5rem 0 .6rem">${esc(v.body)}</p>
      <div class="tag-row">${v.sims.map((id) => `<a class="pill accent" href="#/sim/${esc(id)}">${icon('play', 12)} ${esc(id)}</a>`).join('')}</div>`;
  }

  box.addEventListener('click', (e) => {
    const appBtn = e.target.closest('[data-app]');
    const modeBtn = e.target.closest('[data-mode]');
    if (appBtn) {
      app = appBtn.dataset.app;
      box.querySelectorAll('[data-app]').forEach((b) => b.classList.toggle('sel', b === appBtn));
    }
    if (modeBtn) {
      mode = modeBtn.dataset.mode;
      box.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('sel', b === modeBtn));
    }
    if (appBtn || modeBtn) paint();
  });

  paint();
}
