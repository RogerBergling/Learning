import { esc } from './markdown.js';
import { toast } from './ui.js';
import { loadBuildInfo, applyBuildInfo } from './version.js';
import { initSiteSearch } from './site-search.js';
import { docBySlug, TOPICS } from './content.js';

let activePlayer = null;
let cleanupDocListeners = null;
let renderSequence = 0;
let navSequence = 0;

const view = document.getElementById('view');

/* ------------------------------------------------------------------ router */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (!raw) return { page: 'home' };
  const [page, ...rest] = raw.split('/');
  return { page, param: rest.join('/') };
}

const TITLES = {
  home: 'Learning Lab',
  learn: 'Learn · Learning Lab',
  topic: 'Topic · Learning Lab',
  scenarios: 'Simulations · Learning Lab',
  sim: 'Simulation · Learning Lab',
  compare: 'Compare · Learning Lab',
  glossary: 'Glossary · Learning Lab',
  quiz: 'Quiz · Learning Lab',
  selftest: 'Self-check · Learning Lab',
};

const hasTopic = (id) => Boolean(id) && Object.prototype.hasOwnProperty.call(TOPICS, id);

/** Resolve the active topic from the route. Scenarios are only loaded for sim routes. */
function resolveTopic(page, param) {
  if (page === 'topic') return Promise.resolve(hasTopic(param) ? param : null);
  if (page === 'learn') {
    const doc = param ? docBySlug(param) : null;
    return Promise.resolve(doc ? doc.topic : null);
  }
  if (page === 'quiz') return Promise.resolve(hasTopic(param) ? param : null);
  if (page === 'compare' || page === 'glossary') return Promise.resolve('onegate');
  if (page === 'sim') {
    return import('./scenarios/index.js')
      .then(({ scenarioById }) => scenarioById(param)?.topic || null)
      .catch(() => null);
  }
  return Promise.resolve(null);
}

function glossaryLink(topic) {
  return topic === 'onegate'
    ? { slug: 'glossary', href: '#/glossary' }
    : { slug: `${topic}-glossary`, href: `#/learn/${topic}-glossary` };
}

function navItems(page, param, topic) {
  const glossary = topic ? glossaryLink(topic) : null;
  const glossaryActive = Boolean(glossary) && (
    page === 'glossary' || (page === 'learn' && param === glossary.slug)
  );
  const items = [
    { key: 'home', label: 'Topics', href: '#/', active: page === 'home' || page === 'topic' },
    { key: 'learn', label: 'Learn', href: '#/learn', active: page === 'learn' && !glossaryActive },
    { key: 'scenarios', label: 'Simulations', href: '#/scenarios', active: page === 'scenarios' || page === 'sim' },
  ];

  if (topic === 'onegate') {
    items.push({ key: 'compare', label: 'Compare', href: '#/compare', active: page === 'compare' });
  }
  if (glossary) {
    items.push({ key: 'glossary', label: 'Glossary', href: glossary.href, active: glossaryActive });
  }
  items.push({
    key: 'quiz',
    label: 'Quiz',
    href: topic ? `#/quiz/${topic}` : '#/quiz',
    active: page === 'quiz',
  });
  return items;
}

function renderNav(page, param, topic) {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  nav.innerHTML = navItems(page, param, topic).map((item) => {
    const active = item.active ? ' class="active" aria-current="page"' : '';
    return `<a href="${esc(item.href)}" data-nav="${esc(item.key)}"${active}>${esc(item.label)}</a>`;
  }).join('');
}

function setNav(page, param) {
  const sequence = ++navSequence;
  renderNav(page, param, null);
  resolveTopic(page, param).then((topic) => {
    if (sequence === navSequence) renderNav(page, param, topic);
  });
}

function teardown() {
  if (activePlayer) { activePlayer.destroy(); activePlayer = null; }
  if (cleanupDocListeners) { cleanupDocListeners(); cleanupDocListeners = null; }
}

function showLoading() {
  view.innerHTML = '<div class="loading" role="status"><span class="spinner"></span> Loading…</div>';
}

function hydrateBuildInfo() {
  loadBuildInfo().then((info) => applyBuildInfo(document, info));
}

async function render() {
  const { page, param } = parseRoute();
  const sequence = ++renderSequence;
  const isCurrent = () => sequence === renderSequence;

  teardown();
  setNav(page, param);
  document.title = TITLES[page] || TITLES.home;
  window.scrollTo({ top: 0, behavior: 'instant' });

  try {
    switch (page) {
      case 'home': {
        const { renderHome } = await import('./pages/home.js');
        if (!isCurrent()) return;
        renderHome(view);
        break;
      }
      case 'topic': {
        const { renderTopic } = await import('./pages/topic.js');
        if (!isCurrent()) return;
        renderTopic(view, param);
        break;
      }
      case 'learn': {
        const { renderLearnIndex, renderLearnDoc } = await import('./pages/learn.js');
        if (!isCurrent()) return;
        if (param) {
          showLoading();
          const cleanup = await renderLearnDoc(view, param, isCurrent);
          if (isCurrent()) cleanupDocListeners = cleanup || null;
        } else {
          renderLearnIndex(view);
        }
        break;
      }
      case 'scenarios': {
        const { renderScenarioList } = await import('./pages/scenario-list.js');
        if (!isCurrent()) return;
        renderScenarioList(view);
        break;
      }
      case 'sim': {
        const { renderScenarioPage } = await import('./pages/scenario.js');
        if (!isCurrent()) return;
        if (!param) { location.hash = '#/scenarios'; return; }
        showLoading();
        const player = await renderScenarioPage(view, param);
        if (!isCurrent()) {
          player?.destroy();
          return;
        }
        activePlayer = player;
        break;
      }
      case 'compare': {
        const { renderCompare } = await import('./pages/compare.js');
        if (!isCurrent()) return;
        renderCompare(view);
        break;
      }
      case 'glossary': {
        const { renderLearnDoc } = await import('./pages/learn.js');
        if (!isCurrent()) return;
        showLoading();
        const cleanup = await renderLearnDoc(view, 'glossary', isCurrent);
        if (isCurrent()) cleanupDocListeners = cleanup || null;
        break;
      }
      case 'quiz': {
        const { renderQuiz } = await import('./pages/quiz.js');
        if (!isCurrent()) return;
        renderQuiz(view, param || 'all');
        break;
      }
      case 'selftest': {
        const { renderSelftest } = await import('./pages/selftest.js');
        if (!isCurrent()) return;
        await renderSelftest(view, isCurrent);
        break;
      }
      default:
        location.hash = '#/';
        return;
    }
    if (!isCurrent()) return;
    view.focus({ preventScroll: true });
    hydrateBuildInfo();
  } catch (err) {
    if (!isCurrent()) return;
    console.error(err);
    view.innerHTML = `<div class="card" style="border-color:var(--danger)">
      <h2 style="margin:0 0 .4rem">Something went wrong</h2>
      <p class="muted">${esc(String(err.message || err))}</p>
      <p><a href="#/">Back to the overview</a></p></div>`;
  }
}

/* ------------------------------------------------------------------- theme */

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem('og-theme');
  } catch {
    /* storage can be unavailable in private/restricted contexts */
  }
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  const theme = saved || (prefersLight ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;

  const toggle = document.getElementById('theme-toggle');
  const syncToggleLabel = () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    toggle.setAttribute('aria-label', `Switch to ${current === 'dark' ? 'light' : 'dark'} theme`);
  };
  syncToggleLabel();

  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    syncToggleLabel();
    try {
      localStorage.setItem('og-theme', next);
    } catch {
      /* the theme still applies for this page view */
    }
    toast(next === 'dark' ? 'Dark theme' : 'Light theme');
  });
}

/* -------------------------------------------------------------------- docs */

/** Shared loader so the learn page and the glossary use the same cache. */
const docCache = new Map();
export async function loadDoc(slug, { fresh = false } = {}) {
  if (!fresh && docCache.has(slug)) return docCache.get(slug);
  const res = await fetch(`/docs/${slug}.md`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load /docs/${slug}.md (${res.status})`);
  const text = await res.text();
  docCache.set(slug, text);
  return text;
}

/* -------------------------------------------------------------------- boot */

initTheme();
initSiteSearch();
hydrateBuildInfo();
window.addEventListener('hashchange', render);
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', render, { once: true });
} else {
  render();
}

// The skip link must move focus without changing the hash: the app uses hash
// routing, so "#view" would otherwise be treated as a page and redirected home.
document.querySelector('.skip-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  view.focus({ preventScroll: false });
  view.scrollIntoView({ block: 'start' });
});
