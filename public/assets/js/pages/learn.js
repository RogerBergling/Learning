import { DOCS, TOPICS, TOPIC_ORDER, docBySlug, CATEGORIES } from '../content.js';
import { scenarioById } from '../scenarios/index.js';
import { docCard } from './cards.js';
import { loadDoc } from '../app.js';
import { render } from '../markdown.js';
import { esc, icon, readingTime, debounce } from '../ui.js';
import { completedChapters, progressSummary, chapterIsComplete, toggleChapterComplete } from '../progress.js';
import { searchChapters } from '../search.js';

const RELATED = {
  '01-architecture': ['bff-login', 'legacy-proxy-sso', 'fed-oidc-inbound'],
  '02-oidc-basics': ['bff-login', 'spa-pkce', 'webapp-confidential'],
  '03-onegate-local-provider': ['bff-login', 'client-credentials', 'multi-audience'],
  '04-federation-rp-saml': ['fed-oidc-inbound', 'fed-saml-idp', 'fed-saml-sp', 'openid-federation'],
  '05-bff': ['bff-login', 'bff-thirdparty', 'bff-exchange', 'logout'],
  '06-attribute-providers': ['attr-rest', 'attr-delegation'],
  '07-tokens-and-lifecycle': ['token-formats', 'refresh-rotation', 'logout'],
  '08-server-to-server': ['client-credentials', 'bff-exchange'],
  '09-scenario-catalog': ['bff-login', 'token-formats', 'attr-rest'],
  '10-troubleshooting': ['refresh-rotation', 'logout', 'bff-exchange'],
  '11-control-center': ['control-center-setup', 'legacy-proxy-sso', 'bff-login', 'attr-rest'],
  '12-openid-federation': ['openid-federation', 'fed-oidc-inbound'],
  glossary: [],
  'docker-01-mental-model': ['docker-run', 'docker-compose'],
  'docker-02-images-and-builds': ['docker-build', 'docker-ghcr'],
  'docker-03-containers-lifecycle': ['docker-run', 'docker-ops'],
  'docker-04-storage-networking': ['docker-run', 'docker-compose'],
  'docker-05-compose': ['docker-compose', 'docker-ghcr'],
  'docker-06-operations-security': ['docker-ops', 'docker-security'],
  'docker-07-ghcr-and-updates': ['docker-ghcr', 'git-release-ghcr'],
  'docker-glossary': ['docker-run'],
  'git-01-mental-model': ['git-first-push', 'git-branch-merge'],
  'git-02-first-repository': ['git-first-push', 'git-remotes-auth'],
  'git-03-everyday-workflow': ['git-first-push', 'git-branch-merge'],
  'git-04-branches-merge-rebase': ['git-branch-merge', 'git-rebase'],
  'git-05-undo-recovery': ['git-undo', 'git-secrets'],
  'git-06-remotes-github': ['git-remotes-auth', 'git-first-push'],
  'git-07-settings-files-secrets': ['git-secrets', 'git-remotes-auth'],
  'git-08-tags-releases-ghcr': ['git-release-ghcr', 'docker-ghcr'],
  'git-glossary': ['git-first-push'],
};

export function renderLearnIndex(view) {
  const completed = completedChapters();
  const summary = progressSummary(DOCS.length);
  const quiz = summary.quiz;

  view.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">Written track</p>
      <h1>Learn the whole machine</h1>
      <p class="page-lede">
        ${DOCS.length} chapters across ${TOPIC_ORDER.length} tracks. Start with OneGate federation, Docker on Linux
        or Git &amp; GHCR — each track has its own path, but search and progress work across all of them.
      </p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/learn/01-architecture">${icon('book', 15)} Start with the big picture</a>
        <a class="btn" href="#/scenarios">${icon('play', 15)} Skip to the simulations</a>
      </div>
    </header>

    <section class="learn-search" aria-label="Chapter search">
      <label class="search search-wide">
        <span class="sr-only">Search all chapters</span>
        <input type="search" placeholder="Search all ${DOCS.length} chapters…" data-chapter-search autocomplete="off">
      </label>
      <p class="list-count dim" data-search-count aria-live="polite"></p>
    </section>

    <section class="learn-progress">
      <div class="learn-progress-copy">
        <p class="eyebrow">Your progress</p>
        <strong>${summary.completed} of ${summary.total} chapters complete</strong>
        <span class="dim">${quiz.attempts ? `Quiz best: ${quiz.bestPercent}% across ${quiz.attempts} attempt${quiz.attempts === 1 ? '' : 's'}.` : 'No quiz attempts yet.'}</span>
      </div>
      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.percent}" aria-label="Chapter completion">
        <span style="width:${summary.percent}%"></span>
      </div>
      <a class="btn btn-sm" href="#/quiz">${icon('check', 14)} Take the quiz</a>
    </section>

    <section class="search-results" data-search-results hidden></section>

    <section class="doc-index" data-doc-index>
      ${TOPIC_ORDER.map((topicId) => {
        const topic = TOPICS[topicId];
        const docs = DOCS.filter((d) => d.topic === topicId);
        const chapters = [...new Set(docs.map((d) => d.chapter))];
        return `<section class="topic-learn-block">
          <div class="topic-learn-head">
            <div class="chapter-head">
              <h2><span class="topic-mini-icon ${topic.accent}">${icon(topic.icon, 17)}</span>${esc(topic.title)}</h2>
              <span class="pill">${docs.length} chapters</span>
            </div>
            <p>${esc(topic.summary)}</p>
            <a class="btn btn-sm btn-ghost" href="#/topic/${esc(topicId)}">Open the ${esc(topic.shortTitle)} track ${icon('arrow', 13)}</a>
          </div>
          ${chapters.map((chapter) => {
            const items = docs.filter((d) => d.chapter === chapter);
            return `<div class="chapter-block">
              <div class="chapter-head"><h3>${esc(chapter)}</h3><span class="pill">${items.length}</span></div>
              <div class="cards">${items.map((d) => docCard(d, completed.has(d.slug))).join('')}</div>
            </div>`;
          }).join('')}
        </section>`;
      }).join('')}
    </section>

    <div class="callout">
      <strong>How to read this site.</strong> The chapters are the reference; the simulations are where the
      details become obvious. If you only have ten minutes, read chapter 1 and run
      <a href="#/sim/bff-login">BFF login</a> with the Tokens tab open.
    </div>
  `;

  const input = view.querySelector('[data-chapter-search]');
  const results = view.querySelector('[data-search-results]');
  const index = view.querySelector('[data-doc-index]');
  const count = view.querySelector('[data-search-count]');
  let sequence = 0;

  const renderResults = (query, items) => {
    results.hidden = false;
    index.hidden = true;
    if (!items.length) {
      count.textContent = `No chapters match “${query}”.`;
      results.innerHTML = `<div class="empty-state"><strong>No chapter matches that.</strong>
        <p class="muted">Try a protocol name, a claim such as <code>aud</code>, or a term such as “PKCE”.</p>
        <button class="btn btn-sm" type="button" data-clear-search>Clear search</button></div>`;
      return;
    }
    count.textContent = `${items.length} matching section${items.length === 1 ? '' : 's'}${items.length >= 30 ? ' (first 30)' : ''} — showing the best matches first.`;
    results.innerHTML = `<div class="cards">${items.map((item) => {
      const doc = docBySlug(item.slug);
      const topic = doc ? TOPICS[doc.topic] : null;
      return `<a class="card search-result" href="#/learn/${esc(item.slug)}">
        <div class="card-meta"><span class="pill">${esc(item.docTitle)}</span>${topic ? `<span class="pill">${esc(topic.shortTitle)}</span>` : ''}${item.chapter ? '' : `<span class="pill">${esc(item.heading)}</span>`}</div>
        <h3>${esc(item.chapter ? item.docTitle : item.heading)}</h3>
        <p>${item.snippetHtml}</p>
      </a>`;
    }).join('')}</div>`;
  };

  const runSearch = debounce(async () => {
    const query = input.value.trim();
    const seq = sequence;
    if (!query) {
      results.hidden = true;
      index.hidden = false;
      count.textContent = '';
      return;
    }
    if (query.length < 2) {
      results.hidden = true;
      index.hidden = false;
      count.textContent = 'Type at least two characters.';
      return;
    }

    results.hidden = false;
    index.hidden = true;
    count.textContent = 'Searching every chapter…';
    results.innerHTML = '<div class="loading" role="status"><span class="spinner"></span> Searching…</div>';
    const items = await searchChapters(query);
    if (seq !== sequence || !document.body.contains(results)) return;
    renderResults(query, items);
  }, 180);

  input.addEventListener('input', () => {
    sequence += 1;
    runSearch();
  });
  results.addEventListener('click', (event) => {
    if (!event.target.closest('[data-clear-search]')) return;
    input.value = '';
    input.focus();
    sequence += 1;
    runSearch();
  });
}

export async function renderLearnDoc(view, slug, isCurrent = () => true) {
  const meta = docBySlug(slug);
  if (!meta) {
    view.innerHTML = notFound(slug);
    return;
  }

  let source;
  try {
    source = await loadDoc(slug);
  } catch (err) {
    if (!isCurrent()) return;
    view.innerHTML = `<div class="page-head"><p class="eyebrow">Chapter</p><h1>${esc(meta.title)}</h1></div>
      <div class="card" style="border-color:var(--danger)">
        <h2 style="margin-top:0">The chapter file could not be loaded</h2>
        <p class="muted">${esc(String(err.message || err))}</p>
        <p>Make sure the site is served by <code>start.py</code> (or another static server) from the <code>public/</code> directory, not opened as a <code>file://</code> URL.</p>
        <p><a href="#/learn">Back to all chapters</a></p>
      </div>`;
    return;
  }
  if (!isCurrent()) return;

  const { html, toc } = render(source);
  const pos = DOCS.findIndex((d) => d.slug === slug);
  const prev = pos > 0 ? DOCS[pos - 1] : null;
  const next = pos < DOCS.length - 1 ? DOCS[pos + 1] : null;
  const related = (RELATED[slug] || []).map(scenarioById).filter(Boolean);
  const minutes = readingTime(source);
  const complete = chapterIsComplete(slug);
  const topic = TOPICS[meta.topic];

  document.title = `${meta.title} · Learning Lab`;

  view.innerHTML = `
    <div class="doc-wrap">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/learn">Learn</a><span aria-hidden="true">/</span>
        <a href="#/topic/${esc(meta.topic)}">${esc(topic?.shortTitle || meta.topic)}</a><span aria-hidden="true">/</span>
        <span>${esc(meta.chapter)}</span>
      </nav>

      <header class="doc-head">
        <p class="eyebrow">${esc(meta.chapter)}</p>
        <h1>${esc(meta.title)}</h1>
        <p class="page-lede">${esc(meta.blurb)}</p>
        <div class="doc-meta">
          <span class="pill">${minutes} min read</span>
          <span class="pill">Chapter ${pos + 1} of ${DOCS.length}</span>
          <button class="btn btn-sm ${complete ? 'btn-primary' : 'btn-ghost'}" type="button" data-progress-toggle aria-pressed="${complete}">
            ${icon(complete ? 'check' : 'book', 13)} <span data-progress-label>${complete ? 'Completed' : 'Mark complete'}</span>
          </button>
          <button class="btn btn-sm btn-ghost" type="button" data-copy-link>${icon('link', 13)} Copy link</button>
        </div>
      </header>

      ${slug === 'glossary' ? `<div class="glossary-tools">
        <label class="search search-wide">
          <span class="sr-only">Filter glossary terms</span>
          <input type="search" placeholder="Filter glossary terms…" data-glossary-filter aria-controls="doc-body" autocomplete="off">
        </label>
        <span class="dim" data-glossary-count aria-live="polite"></span>
      </div>` : ''}

      <div class="doc-layout">
        <aside class="doc-toc" aria-label="On this page">
          <h4>On this page</h4>
          ${toc.length
            ? toc.map((h) => `<a class="lvl${h.level}" href="#/learn/${esc(slug)}" data-toc="${esc(h.id)}">${esc(h.text)}</a>`).join('')
            : '<p class="dim" style="font-size:.78rem">This chapter has no sections.</p>'}
          ${related.length ? `<h4 style="margin-top:1.2rem">Simulate it</h4>
            ${related.map((s) => `<a href="#/sim/${esc(s.id)}">${esc(s.title)}</a>`).join('')}` : ''}
        </aside>

        <article class="prose" id="doc-body" data-doc-body>${html}</article>
      </div>

      ${slug === 'glossary' ? '<p class="glossary-empty dim" data-glossary-empty hidden>No glossary terms match that filter.</p>' : ''}

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

  const progressToggle = view.querySelector('[data-progress-toggle]');
  if (progressToggle) {
    progressToggle.addEventListener('click', () => {
      const next = toggleChapterComplete(slug);
      progressToggle.classList.toggle('btn-primary', next);
      progressToggle.classList.toggle('btn-ghost', !next);
      progressToggle.setAttribute('aria-pressed', String(next));
      progressToggle.innerHTML = `${icon(next ? 'check' : 'book', 13)} <span data-progress-label>${next ? 'Completed' : 'Mark complete'}</span>`;
    });
  }

  let glossaryHandler = null;
  const glossaryFilter = view.querySelector('[data-glossary-filter]');
  if (glossaryFilter) {
    const body = view.querySelector('[data-doc-body]');
    const terms = [...body.querySelectorAll('p')].filter((p) => p.querySelector('strong'));
    const termSet = new Set(terms);
    const headings = [...body.querySelectorAll('h2')];
    const countEl = view.querySelector('[data-glossary-count]');
    const emptyEl = view.querySelector('[data-glossary-empty]');

    const applyGlossaryFilter = () => {
      const query = glossaryFilter.value.trim().toLowerCase();
      let visible = 0;
      for (const p of body.querySelectorAll('p')) {
        const match = termSet.has(p) && p.textContent.toLowerCase().includes(query);
        p.hidden = Boolean(query) && !match;
        if (match) visible += 1;
      }
      for (const heading of headings) {
        if (!query) { heading.hidden = false; continue; }
        let sibling = heading.nextElementSibling;
        let group = 0;
        while (sibling && sibling.tagName !== 'H2') {
          if (sibling.tagName === 'P' && !sibling.hidden && termSet.has(sibling)) group += 1;
          sibling = sibling.nextElementSibling;
        }
        heading.hidden = group === 0;
      }
      countEl.textContent = query
        ? `${visible} matching term${visible === 1 ? '' : 's'}`
        : `${terms.length} terms`;
      emptyEl.hidden = !query || visible > 0;
    };

    glossaryHandler = debounce(applyGlossaryFilter, 100);
    glossaryFilter.addEventListener('input', glossaryHandler);
    applyGlossaryFilter();
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
  let observer = null;
  if (links.length && 'IntersectionObserver' in window) {
    const byId = new Map(links.map((a) => [a.dataset.toc, a]));
    observer = new IntersectionObserver((entries) => {
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

  return () => {
    observer?.disconnect();
    if (glossaryHandler) glossaryFilter?.removeEventListener('input', glossaryHandler);
  };
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
