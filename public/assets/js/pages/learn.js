import { DOCS, CHAPTERS, docBySlug, CATEGORIES } from '../content.js';
import { scenarioById } from '../scenarios/index.js';
import { docCard } from './cards.js';
import { loadDoc } from '../app.js';
import { render } from '../markdown.js';
import { esc, icon, readingTime } from '../ui.js';

const RELATED = {
  '01-architecture': ['bff-login', 'legacy-proxy-sso', 'fed-oidc-inbound'],
  '02-oidc-basics': ['bff-login', 'spa-pkce', 'webapp-confidential'],
  '03-onegate-local-provider': ['bff-login', 'client-credentials', 'multi-audience'],
  '04-federation-rp-saml': ['fed-oidc-inbound', 'fed-saml-idp', 'fed-saml-sp'],
  '05-bff': ['bff-login', 'bff-thirdparty', 'bff-exchange', 'logout'],
  '06-attribute-providers': ['attr-rest', 'attr-delegation'],
  '07-tokens-and-lifecycle': ['token-formats', 'refresh-rotation', 'logout'],
  '08-server-to-server': ['client-credentials', 'bff-exchange'],
  '09-scenario-catalog': ['bff-login', 'token-formats', 'attr-rest'],
  '10-troubleshooting': ['refresh-rotation', 'logout', 'bff-exchange'],
  glossary: [],
};

export function renderLearnIndex(view) {
  view.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">Written track</p>
      <h1>Learn the whole machine</h1>
      <p class="page-lede">
        ${DOCS.length} chapters, in the order that makes the simulations legible. Start with the topology,
        then the protocol primitives, then the OneGate configuration that maps onto them. Every chapter ends
        with links to the scenarios that put it in motion.
      </p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/learn/01-architecture">${icon('book', 15)} Start with the big picture</a>
        <a class="btn" href="#/scenarios">${icon('play', 15)} Skip to the simulations</a>
      </div>
    </header>

    <section class="doc-index">
      ${CHAPTERS.map((chapter) => {
        const docs = DOCS.filter((d) => d.chapter === chapter);
        return `<section class="chapter-block">
          <div class="chapter-head">
            <h2>${esc(chapter)}</h2>
            <span class="pill">${docs.length} chapter${docs.length === 1 ? '' : 's'}</span>
          </div>
          <div class="cards">${docs.map(docCard).join('')}</div>
        </section>`;
      }).join('')}
    </section>

    <div class="callout">
      <strong>How to read this site.</strong> The chapters are the reference; the simulations are where the
      details become obvious. If you only have ten minutes, read chapter 1 and run
      <a href="#/sim/bff-login">BFF login</a> with the Tokens tab open.
    </div>
  `;
}

export async function renderLearnDoc(view, slug) {
  const meta = docBySlug(slug);
  if (!meta) {
    view.innerHTML = notFound(slug);
    return;
  }

  let source;
  try {
    source = await loadDoc(slug);
  } catch (err) {
    view.innerHTML = `<div class="page-head"><p class="eyebrow">Chapter</p><h1>${esc(meta.title)}</h1></div>
      <div class="card" style="border-color:var(--danger)">
        <h2 style="margin-top:0">The chapter file could not be loaded</h2>
        <p class="muted">${esc(String(err.message || err))}</p>
        <p>Make sure the site is served by <code>start.py</code> (or another static server) from the <code>public/</code> directory, not opened as a <code>file://</code> URL.</p>
        <p><a href="#/learn">Back to all chapters</a></p>
      </div>`;
    return;
  }

  const { html, toc } = render(source);
  const pos = DOCS.findIndex((d) => d.slug === slug);
  const prev = pos > 0 ? DOCS[pos - 1] : null;
  const next = pos < DOCS.length - 1 ? DOCS[pos + 1] : null;
  const related = (RELATED[slug] || []).map(scenarioById).filter(Boolean);
  const minutes = readingTime(source);

  document.title = `${meta.title} · OneGate Learning Lab`;

  view.innerHTML = `
    <div class="doc-wrap">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/learn">Learn</a><span aria-hidden="true">/</span><span>${esc(meta.chapter)}</span>
      </nav>

      <header class="doc-head">
        <p class="eyebrow">${esc(meta.chapter)}</p>
        <h1>${esc(meta.title)}</h1>
        <p class="page-lede">${esc(meta.blurb)}</p>
        <div class="doc-meta">
          <span class="pill">${minutes} min read</span>
          <span class="pill">Chapter ${pos + 1} of ${DOCS.length}</span>
          <button class="btn btn-sm btn-ghost" type="button" data-copy-link>${icon('link', 13)} Copy link</button>
        </div>
      </header>

      <div class="doc-layout">
        <aside class="doc-toc" aria-label="On this page">
          <h4>On this page</h4>
          ${toc.length
            ? toc.map((h) => `<a class="lvl${h.level}" href="#/learn/${esc(slug)}" data-toc="${esc(h.id)}">${esc(h.text)}</a>`).join('')
            : '<p class="dim" style="font-size:.78rem">This chapter has no sections.</p>'}
          ${related.length ? `<h4 style="margin-top:1.2rem">Simulate it</h4>
            ${related.map((s) => `<a href="#/sim/${esc(s.id)}">${esc(s.title)}</a>`).join('')}` : ''}
        </aside>

        <article class="prose" data-doc-body>${html}</article>
      </div>

      ${related.length ? `<section class="doc-try">
        <div class="section-head"><div><h2>Put it in motion</h2><p>The same ideas, animated with a live token vault.</p></div></div>
        <div class="cards">${related.map((s) => `<a class="card" href="#/sim/${esc(s.id)}">
          <div class="card-meta"><span class="pill accent">${esc(CATEGORIES[s.category]?.label || s.category)}</span><span class="pill">${s.stepLabel || `${s.stepCount} steps`}</span></div>
          <h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p>
        </a>`).join('')}</div>
      </section>` : ''}

      <nav class="doc-nav" aria-label="Chapter navigation">
        ${prev ? `<a href="#/learn/${esc(prev.slug)}"><span class="dir">← Previous</span><span class="ttl">${esc(prev.title)}</span></a>` : '<span></span>'}
        ${next ? `<a href="#/learn/${esc(next.slug)}" style="text-align:right"><span class="dir">Next →</span><span class="ttl">${esc(next.title)}</span></a>` : '<span></span>'}
      </nav>
    </div>
  `;

  const copy = view.querySelector('[data-copy-link]');
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        copy.innerHTML = `${icon('check', 13)} Copied`;
        setTimeout(() => { copy.innerHTML = `${icon('link', 13)} Copy link`; }, 1800);
      } catch {
        copy.textContent = 'Copy failed — use the address bar';
      }
    });
  }

  // TOC links must not change the hash route, so scroll manually.
  const links = [...view.querySelectorAll('[data-toc]')];
  for (const a of links) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.toc);
      if (target) {
        const top = target.getBoundingClientRect().top + window.scrollY - 88;
        window.scrollTo({ top, behavior: 'smooth' });
        links.forEach((l) => l.classList.remove('current'));
        a.classList.add('current');
      }
    });
  }

  // Highlight the TOC entry for the section currently on screen.
  if (links.length && 'IntersectionObserver' in window) {
    const byId = new Map(links.map((a) => [a.dataset.toc, a]));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((a) => a.classList.remove('current'));
        byId.get(entry.target.id)?.classList.add('current');
      }
    }, { rootMargin: '-15% 0px -75% 0px' });
    for (const id of byId.keys()) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
  }
}

function notFound(slug) {
  return `<div class="page-head">
      <p class="eyebrow">Chapter not found</p>
      <h1>No chapter called “${esc(slug)}”</h1>
      <p class="page-lede">The address may be from an older version of the site. Here is the full table of contents.</p>
    </div>
    <div class="cards">${DOCS.map(docCard).join('')}</div>
    <p style="margin-top:1.4rem"><a href="#/learn">← All chapters</a></p>`;
}
