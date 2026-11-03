import { SCENARIOS, scenarioById } from '../scenarios/index.js';
import { CATEGORIES, TOPICS } from '../content.js';
import { SimPlayer } from '../sim/player.js';
import { esc, icon } from '../ui.js';

const DOCS_FOR = {
  foundation: ['02-oidc-basics', '08-server-to-server'],
  browser: ['02-oidc-basics', '07-tokens-and-lifecycle'],
  bff: ['05-bff', '07-tokens-and-lifecycle'],
  server: ['02-oidc-basics', '07-tokens-and-lifecycle'],
  tokens: ['07-tokens-and-lifecycle', '08-server-to-server'],
  federation: ['12-openid-federation', '04-federation-rp-saml'],
  saml: ['04-federation-rp-saml'],
  attributes: ['06-attribute-providers'],
  proxy: ['01-architecture', '05-bff'],
  setup: ['11-control-center', '01-architecture'],
  'docker-build': ['docker-02-images-and-builds', 'docker-07-ghcr-and-updates'],
  'docker-run': ['docker-03-containers-lifecycle', 'docker-04-storage-networking', 'docker-06-operations-security'],
  compose: ['docker-05-compose', 'docker-07-ghcr-and-updates'],
  git: ['git-01-mental-model', 'git-02-first-repository'],
  'git-workflow': ['git-03-everyday-workflow', 'git-04-branches-merge-rebase', 'git-05-undo-recovery'],
  'git-security': ['git-07-settings-files-secrets'],
  'git-delivery': ['git-08-tags-releases-ghcr'],
  'esxtop-capture': ['esxtop-02-capture-modes', 'esxtop-01-mental-model'],
  'esxtop-cpu': ['esxtop-03-cpu-scheduling'],
  'esxtop-memory': ['esxtop-04-memory-numa'],
  'esxtop-storage': ['esxtop-05-storage-latency'],
  'esxtop-network': ['esxtop-06-network-vsan'],
  'esxtop-ops': ['esxtop-07-focused-capture', 'esxtop-08-triage-reporting', 'esxtop-09-counter-reference'],
};

const DOC_TITLES = {
  '01-architecture': 'The big picture',
  '02-oidc-basics': 'OIDC & OAuth 2.0',
  '05-bff': 'Backend for Frontend',
  '06-attribute-providers': 'Attribute sources & the User Attribute API',
  '07-tokens-and-lifecycle': 'Tokens, storage & lifetimes',
  '08-server-to-server': 'Server-to-server',
  '04-federation-rp-saml': 'Federation & SAML',
  '12-openid-federation': 'OpenID Federation',
  '11-control-center': 'The Control Center, end to end',
  'docker-01-mental-model': 'Docker mental model',
  'docker-02-images-and-builds': 'Images, layers and builds',
  'docker-03-containers-lifecycle': 'Container lifecycle',
  'docker-04-storage-networking': 'Storage, networking and ports',
  'docker-05-compose': 'Docker Compose',
  'docker-06-operations-security': 'Operations and security',
  'docker-07-ghcr-and-updates': 'GHCR and updates',
  'git-01-mental-model': 'Git mental model',
  'git-02-first-repository': 'Your first repository',
  'git-03-everyday-workflow': 'Everyday Git',
  'git-04-branches-merge-rebase': 'Branches, merge and rebase',
  'git-05-undo-recovery': 'Undo and recovery',
  'git-06-remotes-github': 'Remotes and GitHub',
  'git-07-settings-files-secrets': 'Settings, files and secrets',
  'git-08-tags-releases-ghcr': 'Tags, releases and GHCR',
  'esxtop-01-mental-model': 'ESXtop mental model',
  'esxtop-02-capture-modes': 'Capture modes',
  'esxtop-03-cpu-scheduling': 'CPU scheduling',
  'esxtop-04-memory-numa': 'Memory and NUMA',
  'esxtop-05-storage-latency': 'Storage latency',
  'esxtop-06-network-vsan': 'Network and vSAN',
  'esxtop-07-focused-capture': 'Focused captures',
  'esxtop-08-triage-reporting': 'Triage and reporting',
  'esxtop-09-counter-reference': 'Counter reference',
};

export async function renderScenarioPage(view, id) {
  const s = scenarioById(id);
  if (!s) {
    view.innerHTML = `<div class="page-head">
        <p class="eyebrow">Simulation not found</p>
        <h1>There is no scenario called “${esc(id)}”</h1>
        <p class="page-lede">It may have been renamed. Here is the full list.</p>
        <p><a class="btn btn-primary" href="#/scenarios">${icon('arrow', 15)} All simulations</a></p>
      </div>`;
    return null;
  }

  const cat = CATEGORIES[s.category] || { label: s.category };
  const topic = TOPICS[s.topic] || { title: s.topic, shortTitle: s.topic };
  const idx = SCENARIOS.findIndex((x) => x.id === s.id);
  const prev = idx > 0 ? SCENARIOS[idx - 1] : null;
  const next = idx < SCENARIOS.length - 1 ? SCENARIOS[idx + 1] : null;
  const docs = (DOCS_FOR[s.category] || []).filter((slug) => DOC_TITLES[slug]);

  document.title = `${s.title} · Learning Lab`;

  view.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="#/scenarios">Simulations</a><span aria-hidden="true">/</span>
      <a href="#/topic/${esc(s.topic)}">${esc(topic.shortTitle)}</a><span aria-hidden="true">/</span>
      <span>${esc(cat.label)}</span>
    </nav>

    <header class="sim-head">
      <div>
        <div class="pills">
          <span class="pill ${s.level === 'advanced' ? 'violet' : 'accent'}">${s.level === 'advanced' ? 'Advanced' : 'Core'}</span>
          <span class="pill">${esc(cat.label)}</span>
          <span class="pill">${s.stepLabel || `${s.stepCount} steps`}</span>
          <span class="pill">${s.minutes} min</span>
          ${s.modes ? `<span class="pill ok">${esc(s.modeLabel || 'Two modes')}</span>` : ''}
        </div>
        <h1>${esc(s.title)}</h1>
        <p>${esc(s.summary)}</p>
      </div>
      <div class="sim-head-actions">
        <a class="btn btn-ghost btn-sm" href="#/scenarios">${icon('close', 14)} All simulations</a>
        ${docs.map((slug) => `<a class="btn btn-ghost btn-sm" href="#/learn/${esc(slug)}">${icon('book', 14)} ${esc(DOC_TITLES[slug])}</a>`).join('')}
      </div>
    </header>

    <div class="sim-note">
      <span>${icon('play', 13)} Press <kbd>Space</kbd> to play, <kbd>←</kbd> <kbd>→</kbd> to step, <kbd>R</kbd> to restart.</span>
      <span class="dim">Click any credential or artifact chip in the vault to inspect it. The right-hand guide explains the goal and the first trap.</span>
    </div>

    <div id="sim-root"></div>

    <nav class="sim-pager" aria-label="Scenario navigation">
      ${prev ? `<a href="#/sim/${esc(prev.id)}"><span class="dir">← Previous</span><span class="ttl">${esc(prev.title)}</span></a>` : '<span></span>'}
      ${next ? `<a href="#/sim/${esc(next.id)}" style="text-align:right"><span class="dir">Next →</span><span class="ttl">${esc(next.title)}</span></a>` : '<span></span>'}
    </nav>
  `;

  return new SimPlayer(view.querySelector('#sim-root'), s);
}
