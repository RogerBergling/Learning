import { DOCS } from './content.js';
import { toast } from './ui.js';

let activePlayer = null;
let cleanupDocListeners = null;

const view = document.getElementById('view');

/* ------------------------------------------------------------------ router */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (!raw) return { page: 'home' };
  const [page, ...rest] = raw.split('/');
  return { page, param: rest.join('/') };
}

const TITLES = {
  home: 'OneGate Learning Lab',
  learn: 'Learn · OneGate Learning Lab',
  scenarios: 'Simulations · OneGate Learning Lab',
  sim: 'Simulation · OneGate Learning Lab',
  compare: 'Compare · OneGate Learning Lab',
  glossary: 'Glossary · OneGate Learning Lab',
  selftest: 'Self-check · OneGate Learning Lab',
};

function setNav(page) {
  const map = { sim: 'scenarios', learn: 'learn', home: 'home', scenarios: 'scenarios', compare: 'compare', glossary: 'glossary' };
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === map[page]);
  });
}

function teardown() {
  if (activePlayer) { activePlayer.destroy(); activePlayer = null; }
  if (cleanupDocListeners) { cleanupDocListeners(); cleanupDocListeners = null; }
}

function showLoading() {
  view.innerHTML = '<div class="loading"><span class="spinner"></span> Loading…</div>';
}

async function render() {
  const { page, param } = parseRoute();
  teardown();
  setNav(page);
  document.title = TITLES[page] || TITLES.home;
  window.scrollTo({ top: 0, behavior: 'instant' });

  try {
    switch (page) {
      case 'home': {
        const { renderHome } = await import('./pages/home.js');
        renderHome(view);
        break;
      }
      case 'learn': {
        const { renderLearnIndex, renderLearnDoc } = await import('./pages/learn.js');
        if (param) {
          showLoading();
          await renderLearnDoc(view, param);
        } else {
          renderLearnIndex(view);
        }
        break;
      }
      case 'scenarios': {
        const { renderScenarioList } = await import('./pages/scenario-list.js');
        renderScenarioList(view);
        break;
      }
      case 'sim': {
        const { renderScenarioPage } = await import('./pages/scenario.js');
        if (!param) { location.hash = '#/scenarios'; return; }
        showLoading();
        activePlayer = await renderScenarioPage(view, param);
        break;
      }
      case 'compare': {
        const { renderCompare } = await import('./pages/compare.js');
        renderCompare(view);
        break;
      }
      case 'glossary': {
        const { renderLearnDoc } = await import('./pages/learn.js');
        showLoading();
        await renderLearnDoc(view, 'glossary');
        break;
      }
      case 'selftest': {
        const { renderSelftest } = await import('./pages/selftest.js');
        await renderSelftest(view);
        break;
      }
      default:
        location.hash = '#/';
    }
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card" style="border-color:var(--danger)">
      <h2 style="margin:0 0 .4rem">Something went wrong</h2>
      <p class="muted">${escapeHtml(String(err.message || err))}</p>
      <p><a href="#/">Back to the overview</a></p></div>`;
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------- theme */

function initTheme() {
  const saved = localStorage.getItem('og-theme');
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  const theme = saved || (prefersLight ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('og-theme', next);
    toast(next === 'dark' ? 'Dark theme' : 'Light theme');
  });
}

/* -------------------------------------------------------------------- docs */

/** Shared loader so the learn page and the glossary use the same cache. */
const docCache = new Map();
export async function loadDoc(slug) {
  if (docCache.has(slug)) return docCache.get(slug);
  const res = await fetch(`/docs/${slug}.md`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load /docs/${slug}.md (${res.status})`);
  const text = await res.text();
  docCache.set(slug, text);
  return text;
}

/* -------------------------------------------------------------------- boot */

initTheme();
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
if (document.readyState !== 'loading') render();

// make "copy" of deep links easy, and keep the toast useful
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-copy]');
  if (!a) return;
  e.preventDefault();
  navigator.clipboard?.writeText(a.href).then(() => toast('Link copied'), () => {});
});
