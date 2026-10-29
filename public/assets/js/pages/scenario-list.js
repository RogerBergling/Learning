import { SCENARIOS, categoryCounts } from '../scenarios/index.js';
import { CATEGORIES } from '../content.js';
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
        <span><i class="lg-dot" style="background:var(--accent)"></i>front channel</span>
        <span><i class="lg-dot" style="background:var(--ok)"></i>back channel</span>
        <span><i class="lg-dot" style="background:var(--warn)"></i>cookie</span>
        <span><i class="lg-dot" style="background:var(--accent-2)"></i>attribute call</span>
        <span><i class="lg-dot" style="background:var(--orange)"></i>SAML</span>
      </div>
    </header>

    <div class="list-toolbar">
      <div class="filters" data-filters>
        <button class="filter active" data-cat="all" type="button">All <span class="fc">${SCENARIOS.length}</span></button>
        ${Object.entries(CATEGORIES).filter(([id]) => counts[id]).map(([id, c]) =>
          `<button class="filter" data-cat="${esc(id)}" type="button">${esc(c.label)} <span class="fc">${counts[id]}</span></button>`).join('')}
      </div>
      <div class="list-tools">
        <div class="seg" role="group" aria-label="Level">
          ${LEVELS.map((l) => `<button type="button" data-level="${l.id}" class="${l.id === 'all' ? 'active' : ''}">${l.label}</button>`).join('')}
        </div>
        <label class="search">
          <span class="sr-only">Search simulations</span>
          <input type="search" placeholder="Search: BFF, SAML, federation…" data-search autocomplete="off">
        </label>
      </div>
    </div>

    <p class="list-count dim" data-count></p>
    <div class="scenario-grid" data-grid></div>

    <div class="callout" style="margin-top:2rem">
      <strong>Not sure where to start?</strong> <a href="#/sim/control-center-setup">Control Center setup</a> maps
      every menu item before any protocol starts. <a href="#/sim/bff-login">BFF login</a> is the flagship:
      OneGate acts as both OP and RP in the same flow. <a href="#/sim/token-formats">JWT vs opaque</a> is the
      shortest way to understand why the API sometimes has to call home. <a href="#/learn/09-scenario-catalog">Chapter 9</a>
      describes every scenario in one table.
    </div>
  `;

  const grid = view.querySelector('[data-grid]');
  const countEl = view.querySelector('[data-count]');
  const search = view.querySelector('[data-search]');
  const catButtons = [...view.querySelectorAll('[data-cat]')];
  const levelButtonsReal = [...view.querySelectorAll('[data-level]')];
  let cat = 'all';
  let level = 'all';
  let query = '';

  function paint() {
    const q = query.trim().toLowerCase();
    const list = SCENARIOS.filter((s) => {
      if (cat !== 'all' && s.category !== cat) return false;
      if (level !== 'all' && s.level !== level) return false;
      if (!q) return true;
      const hay = [s.title, s.summary, s.flow, s.id, CATEGORIES[s.category]?.label, ...(s.tags || [])]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });

    grid.innerHTML = list.length
      ? list.map(scenarioCard).join('')
      : `<div class="empty-state"><strong>No simulation matches that.</strong>
          <p class="muted">Try “BFF”, “SAML”, “refresh” or clear the filters.</p>
          <button class="btn btn-sm" type="button" data-reset>Reset filters</button></div>`;

    countEl.textContent = `${list.length} of ${SCENARIOS.length} simulations`;
  }

  catButtons.forEach((b) => b.addEventListener('click', () => {
    cat = b.dataset.cat;
    catButtons.forEach((x) => x.classList.toggle('active', x === b));
    paint();
  }));

  levelButtonsReal.forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level;
    levelButtonsReal.forEach((x) => x.classList.toggle('active', x === b));
    paint();
  }));

  search.addEventListener('input', () => { query = search.value; paint(); });

  grid.addEventListener('click', (e) => {
    if (!e.target.closest('[data-reset]')) return;
    cat = 'all';
    level = 'all';
    query = '';
    search.value = '';
    catButtons.forEach((x) => x.classList.toggle('active', x.dataset.cat === 'all'));
    levelButtonsReal.forEach((x) => x.classList.toggle('active', x.dataset.level === 'all'));
    paint();
  });

  paint();
}
