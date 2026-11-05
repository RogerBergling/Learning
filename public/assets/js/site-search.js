/* Header search dialog. The shared search module is loaded on demand so the
   Markdown index and structured site index are only built when a visitor
   actually searches. */

import { docBySlug, TOPICS } from './content.js';
import { icon, esc, debounce } from './ui.js';

const GROUP_ICONS = {
  chapters: 'book',
  simulations: 'play',
  topics: 'layers',
  quiz: 'check',
  pages: 'arrow',
};

const SUGGESTIONS = ['BFF', 'Docker', 'Git', 'HAProxy', 'ESXtop', 'DNSSEC'];

let searchModulePromise = null;
const getSearchModule = () => {
  searchModulePromise ||= import('./search.js');
  return searchModulePromise;
};

export function initSiteSearch() {
  const trigger = document.querySelector('[data-site-search-open]');
  const dialog = document.querySelector('[data-site-search-dialog]');
  const input = document.querySelector('[data-site-search-input]');
  const results = document.querySelector('[data-site-search-results]');
  const status = document.querySelector('[data-site-search-status]');
  const closeButton = document.querySelector('[data-site-search-close]');
  if (!trigger || !dialog || !input || !results || !status) return;
  if (trigger.dataset.searchReady === 'true') return;
  trigger.dataset.searchReady = 'true';

  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  const shortcut = isMac ? '⌘K' : 'Ctrl K';
  const shortcutHint = document.querySelector('[data-search-shortcut]');
  if (shortcutHint) shortcutHint.textContent = shortcut;
  trigger.title = `Search the whole site (${shortcut})`;

  let sequence = 0;
  let activeIndex = -1;
  let warmed = false;

  const dialogIsOpen = () => Boolean(dialog.open);
  const setExpanded = (expanded) => input.setAttribute('aria-expanded', expanded ? 'true' : 'false');

  function clearActive() {
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');
    for (const link of results.querySelectorAll('[data-search-result]')) {
      link.classList.remove('active');
      link.setAttribute('aria-selected', 'false');
    }
  }

  function suggestionButtons() {
    return SUGGESTIONS.map((term) => `<button class="site-search-suggestion" type="button" data-search-suggestion="${esc(term)}">${esc(term)}</button>`).join('');
  }

  function paintIdle(message) {
    clearActive();
    setExpanded(false);
    results.removeAttribute('role');
    results.innerHTML = `<div class="site-search-idle">
      <p class="site-search-idle-title">Search the whole lab</p>
      <p class="dim">Chapters, simulations, learning tracks, quiz questions and site pages.</p>
      <div class="site-search-suggestions" aria-label="Suggested searches">${suggestionButtons()}</div>
    </div>`;
    status.textContent = message || 'Type at least two characters to search.';
  }

  function paintEmpty(query) {
    clearActive();
    setExpanded(false);
    results.removeAttribute('role');
    results.innerHTML = `<div class="site-search-empty">
      <strong>No results for “${esc(query)}”.</strong>
      <p class="dim">Try a protocol, a command, a product name or a chapter title.</p>
      <div class="site-search-suggestions" aria-label="Suggested searches">${suggestionButtons()}</div>
    </div>`;
  }

  function paintUnavailable() {
    clearActive();
    setExpanded(false);
    results.removeAttribute('role');
    results.innerHTML = `<div class="site-search-empty">
      <strong>Search is unavailable.</strong>
      <p class="dim">Reload the page and try again.</p>
    </div>`;
    status.textContent = 'The search module could not be loaded.';
  }

  function renderGroup(group, counter) {
    const groupIcon = GROUP_ICONS[group.id] || 'sparkle';
    const count = group.total && group.total > group.items.length
      ? `${group.items.length} of ${group.total}`
      : String(group.items.length);
    const items = group.items.map((item) => {
      const optionId = `site-search-option-${counter.index++}`;
      return `<a class="site-search-result" id="${optionId}" href="${esc(item.href)}" data-search-result role="option" aria-selected="false">
        <span class="site-search-result-icon ${esc(group.id)}">${icon(groupIcon, 15)}</span>
        <span class="site-search-copy">
          <span class="site-search-title">${esc(item.title)}</span>
          ${item.meta ? `<span class="site-search-meta">${esc(item.meta)}</span>` : ''}
          ${item.snippetHtml ? `<span class="site-search-snippet">${item.snippetHtml}</span>` : ''}
        </span>
      </a>`;
    }).join('');
    return `<div class="site-search-group" role="group" aria-label="${esc(group.label)}">
      <div class="site-search-group-head" aria-hidden="true"><span>${esc(group.label)}</span><span>${count}</span></div>
      ${items}
    </div>`;
  }

  function paintResults(query, groups, { chaptersPending }) {
    clearActive();
    setExpanded(true);
    results.setAttribute('role', 'listbox');

    const total = groups.reduce((sum, group) => sum + (group.total ?? group.items.length), 0);
    const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
    status.textContent = chaptersPending
      ? `Searching chapters for “${query}”…`
      : `${total} result${total === 1 ? '' : 's'} for “${query}”${total > shown ? ` · showing the top ${shown}` : ''}.`;

    if (!groups.length && !chaptersPending) {
      paintEmpty(query);
      return;
    }

    const counter = { index: 0 };
    results.innerHTML = `${groups.map((group) => renderGroup(group, counter)).join('')}${chaptersPending
      ? '<div class="site-search-loading" role="status"><span class="spinner"></span> Searching chapters…</div>'
      : ''}`;
  }

  function chapterGroup(items, total) {
    return {
      id: 'chapters',
      label: 'Chapters',
      total,
      items: items.map((item) => {
        const doc = docBySlug(item.slug);
        const topic = doc ? TOPICS[doc.topic] : null;
        return {
          kind: 'chapter',
          id: `chapter-${item.slug}-${item.chapter ? 'doc' : item.heading}`,
          href: `#/learn/${item.slug}`,
          title: item.chapter ? item.docTitle : (item.heading || item.docTitle),
          meta: item.chapter
            ? [topic?.shortTitle, doc?.chapter].filter(Boolean).join(' · ')
            : [item.docTitle, topic?.shortTitle].filter(Boolean).join(' · '),
          snippetHtml: item.snippetHtml,
        };
      }),
    };
  }

  const runSearch = debounce(async () => {
    const query = input.value.trim();
    const current = ++sequence;

    if (query.length < 2) {
      paintIdle(query.length === 1 ? 'Type one more character to search the whole lab.' : undefined);
      return;
    }

    status.textContent = `Searching for “${query}”…`;

    let search;
    try {
      search = await getSearchModule();
    } catch {
      if (current === sequence) paintUnavailable();
      return;
    }
    if (current !== sequence) return;

    if (!warmed) {
      warmed = true;
      search.buildSearchIndex().catch(() => {});
    }

    const staticGroups = search.searchStaticSite(query);
    paintResults(query, staticGroups, { chaptersPending: true });

    let chapterResults = { items: [], total: 0 };
    try {
      chapterResults = await search.searchChapterResults(query, { limit: 8 });
    } catch {
      /* Keep the structured results if one chapter cannot be loaded. */
    }
    if (current !== sequence) return;

    const group = chapterResults.items.length ? chapterGroup(chapterResults.items, chapterResults.total) : null;
    paintResults(query, group ? [group, ...staticGroups] : staticGroups, { chaptersPending: false });
  }, 140);

  function setActive(index) {
    const links = [...results.querySelectorAll('[data-search-result]')];
    if (!links.length) return;
    activeIndex = index < 0 ? links.length - 1 : index >= links.length ? 0 : index;
    links.forEach((link, linkIndex) => {
      const active = linkIndex === activeIndex;
      link.classList.toggle('active', active);
      link.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    input.setAttribute('aria-activedescendant', links[activeIndex].id);
    links[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function moveActive(delta) {
    const links = [...results.querySelectorAll('[data-search-result]')];
    if (!links.length) return;
    if (activeIndex < 0) {
      setActive(delta > 0 ? 0 : links.length - 1);
      return;
    }
    setActive((activeIndex + delta + links.length) % links.length);
  }

  function openSearch() {
    if (dialogIsOpen()) {
      input.focus();
      return;
    }
    input.value = '';
    paintIdle();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.documentElement.classList.add('search-open');
    input.focus();
    input.select();
    getSearchModule().catch(() => {});
  }

  function closeSearch() {
    if (typeof dialog.close === 'function' && dialogIsOpen()) dialog.close();
    else {
      dialog.removeAttribute('open');
      document.documentElement.classList.remove('search-open');
      resetSearch();
    }
  }

  function resetSearch() {
    sequence += 1;
    input.value = '';
    setExpanded(false);
    clearActive();
    results.removeAttribute('role');
    results.innerHTML = '';
    status.textContent = 'Type at least two characters to search.';
    document.documentElement.classList.remove('search-open');
  }

  trigger.addEventListener('click', openSearch);
  closeButton?.addEventListener('click', closeSearch);

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    } else if (event.key === 'Escape' && dialogIsOpen()) {
      event.preventDefault();
      closeSearch();
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeSearch();
  });
  dialog.addEventListener('cancel', () => {
    document.documentElement.classList.remove('search-open');
  });
  dialog.addEventListener('close', resetSearch);

  input.addEventListener('input', () => {
    sequence += 1;
    runSearch();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter') {
      const links = [...results.querySelectorAll('[data-search-result]')];
      if (!links.length) return;
      event.preventDefault();
      (links[activeIndex] || links[0]).click();
    }
  });

  results.addEventListener('click', (event) => {
    const suggestion = event.target.closest('[data-search-suggestion]');
    if (suggestion) {
      input.value = suggestion.dataset.searchSuggestion || '';
      input.focus();
      sequence += 1;
      runSearch();
      return;
    }
    if (event.target.closest('[data-search-result]')) closeSearch();
  });

  window.addEventListener('hashchange', () => {
    if (dialogIsOpen()) closeSearch();
  });
}
