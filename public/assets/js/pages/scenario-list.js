import { SCENARIOS, categoryCounts } from '../scenarios/index.js';
import { CATEGORIES, TOPICS, TOPIC_ORDER } from '../content.js';
import { scenarioCard } from './cards.js';
import { esc, icon } from '../ui.js';

const LEVELS = [
  { id: 'all', label: 'All levels' },
  { id: 'core', label: 'Core' },
  { id: 'advanced', label: 'Advanced' },
];

export function renderScenarioList(view) {
  const counts = categoryCounts();

  view.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">Simulations</p>
      <h1>${SCENARIOS.length} flows, animated hop by hop</h1>
      <p class="page-lede">
        Every scenario runs entirely in your browser: the nodes light up, packets cross the wires, and a live
        token vault shows where each credential exists after every step. Pick a flow, press play, then open
        <strong>Tokens</strong> and <strong>Watch out</strong>.
      </p>
      <div class="legend-row">
        <span><i class="lg-dot" style="background:var(--accent)"></i>front / CLI</span>
        <span><i class="lg-dot" style="background:var(--ok)"></i>back / engine</span>
        <span><i class="lg-dot" style="background:var(--warn)"></i>cookie / deploy</span>
        <span><i class="lg-dot" style="background:var(--accent-2)"></i>attribute / registry</span>
        <span><i class="lg-dot" style="background:var(--orange)"></i>SAML / Git</span>
        <span><i class="lg-dot" style="background:var(--teal)"></i>network</span>
        <span><i class="lg-dot" style="background:var(--pink)"></i>CI</span>
      </div>
    </header>

    <div class="list-toolbar">
      <div class="filters topic-filters" data-topic-filters>
        <button class="filter active" data-topic="all" type="button" aria-pressed="true">All topics <span class="fc">${SCENARIOS.length}</span></button>
        ${TOPIC_ORDER.map((id) => {
          const n = SCENARIOS.filter((s) => s.topic === id).length;
          return `<button class="filter" data-topic="${esc(id)}" type="button" aria-pressed="false">${esc(TOPICS[id].shortTitle)} <span class="fc">${n}</span></button>`;
        }).join('')}
      </div>
      <div class="list-tools">
        <div class="seg" role="group" aria-label="Level">
          ${LEVELS.map((l) => `<button type="button" data-level="${l.id}" class="${l.id === 'all' ? 'active' : ''}" aria-pressed="${l.id === 'all' ? 'true' : 'false'}">${l.label}</button>`).join('')}
        </div>
        <label class="search">
          <span class="sr-only">Search simulations</span>
          <input type="search" placeholder="Search: Docker, Git, BFF, HAProxy, ESXtop…" data-search autocomplete="off">
        </label>
      </div>
    </div>

    <div class="filters" data-filters>
      <button class="filter active" data-cat="all" type="button" aria-pressed="true">All categories <span class="fc">${SCENARIOS.length}</span></button>
      ${Object.entries(CATEGORIES).filter(([id]) => counts[id]).map(([id, c]) =>
        `<button class="filter" data-cat="${esc(id)}" type="button" aria-pressed="false">${esc(c.label)} <span class="fc">${counts[id]}</span></button>`).join('')}
    </div>

    <p class="list-count dim" data-count aria-live="polite"></p>
    <div class="scenario-grid" data-grid></div>

    <div class="callout" style="margin-top:2rem">
      <strong>Not sure where to start?</strong> Choose a topic above, then open its track page.
      [OneGate federation](#/topic/onegate), [Docker on Linux](#/topic/docker) and [Git &amp; GHCR](#/topic/git)
      each have a guided path. The [scenario catalog](#/learn/09-scenario-catalog) explains every OneGate flow.
    </div>
  `;

  const grid = view.querySelector('[data-grid]');
  const countEl = view.querySelector('[data-count]');
  const search = view.querySelector('[data-search]');
  const catButtons = [...view.querySelectorAll('[data-cat]')];
  const topicButtons = [...view.querySelectorAll('[data-topic]')];
  const levelButtonsReal = [...view.querySelectorAll('[data-level]')];
  let cat = 'all';
  let topic = 'all';
  let level = 'all';
  let query = '';

  function paint() {
    const q = query.trim().toLowerCase();
    const list = SCENARIOS.filter((s) => {
      if (topic !== 'all' && s.topic !== topic) return false;
      if (cat !== 'all' && s.category !== cat) return false;
      if (level !== 'all' && s.level !== level) return false;
      if (!q) return true;
      const hay = [s.title, s.summary, s.flow, s.id, CATEGORIES[s.category]?.label, TOPICS[s.topic]?.title, ...(s.tags || [])]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });

    grid.innerHTML = list.length
      ? list.map(scenarioCard).join('')
      : `<div class="empty-state"><strong>No simulation matches that.</strong>
          <p class="muted">Try “Docker”, “Git”, “BFF”, “SAML” or clear the filters.</p>
          <button class="btn btn-sm" type="button" data-reset>Reset filters</button></div>`;

    countEl.textContent = `${list.length} of ${SCENARIOS.length} simulations`;
  }

  topicButtons.forEach((b) => b.addEventListener('click', () => {
    topic = b.dataset.topic;
    topicButtons.forEach((x) => {
      const active = x === b;
      x.classList.toggle('active', active);
      x.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    paint();
  }));

  catButtons.forEach((b) => b.addEventListener('click', () => {
    cat = b.dataset.cat;
    catButtons.forEach((x) => {
      const active = x === b;
      x.classList.toggle('active', active);
      x.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    paint();
  }));

  levelButtonsReal.forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level;
    levelButtonsReal.forEach((x) => {
      const active = x === b;
      x.classList.toggle('active', active);
      x.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    paint();
  }));

  search.addEventListener('input', () => { query = search.value; paint(); });

  grid.addEventListener('click', (e) => {
    if (!e.target.closest('[data-reset]')) return;
    cat = 'all';
    topic = 'all';
    level = 'all';
    query = '';
    search.value = '';
    topicButtons.forEach((x) => {
      const active = x.dataset.topic === 'all';
      x.classList.toggle('active', active);
      x.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    catButtons.forEach((x) => {
      const active = x.dataset.cat === 'all';
      x.classList.toggle('active', active);
      x.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    levelButtonsReal.forEach((x) => {
      const active = x.dataset.level === 'all';
      x.classList.toggle('active', active);
      x.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    paint();
  });

  paint();
}
