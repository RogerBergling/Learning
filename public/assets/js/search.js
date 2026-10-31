/* Full-text chapter search. The index is built by fetching the same Markdown
   files the Learn page renders, so there is no second source of truth. */

import { DOCS } from './content.js';
import { esc } from './markdown.js';
import { loadDoc } from './app.js';

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function plain(markdown) {
  return String(markdown)
    .replace(/```[^\n]*\n([\s\S]*?)```/g, ' $1 ')
    .replace(/```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sections(src) {
  const out = [];
  let heading = '';
  let body = [];
  const push = () => {
    const text = plain(body.join('\n'));
    if (text) out.push({ heading, text });
    body = [];
  };

  for (const line of String(src).replace(/\r\n?/g, '\n').split('\n')) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      push();
      heading = match[2].replace(/[*`_]/g, '').trim();
      continue;
    }
    body.push(line);
  }
  push();
  return out;
}

function entriesFor(doc, src) {
  const entries = [{
    slug: doc.slug,
    docTitle: doc.title,
    heading: doc.title,
    snippet: doc.blurb,
    haystack: `${doc.title} ${doc.blurb}`.toLowerCase(),
    text: `${doc.title}. ${doc.blurb}`,
    chapter: true,
  }];
  for (const section of sections(src)) {
    entries.push({
      slug: doc.slug,
      docTitle: doc.title,
      heading: section.heading || doc.title,
      snippet: section.text,
      haystack: `${doc.title} ${section.heading} ${section.text}`.toLowerCase(),
      text: section.text,
      chapter: false,
    });
  }
  return entries;
}

let indexPromise = null;

/** Build (or reuse) the Markdown search index. */
export function buildSearchIndex({ fresh = false } = {}) {
  if (!indexPromise || fresh) {
    indexPromise = Promise.all(DOCS.map(async (doc) => {
      try {
        return entriesFor(doc, await loadDoc(doc.slug, { fresh }));
      } catch {
        return [];
      }
    })).then((groups) => groups.flat());
  }
  return indexPromise;
}

function snippetFor(text, tokens) {
  const lower = text.toLowerCase();
  const positions = tokens.map((token) => lower.indexOf(token)).filter((i) => i >= 0);
  const index = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + 120);
  return `${start ? '… ' : ''}${text.slice(start, end).trim()}${end < text.length ? ' …' : ''}`;
}

function highlight(text, tokens) {
  if (!tokens.length) return esc(text);
  const re = new RegExp(tokens.map(escapeRegExp).join('|'), 'gi');
  let out = '';
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    out += esc(text.slice(last, match.index));
    out += `<mark>${esc(match[0])}</mark>`;
    last = match.index + match[0].length;
    if (match.index === re.lastIndex) re.lastIndex++;
  }
  return out + esc(text.slice(last));
}

/** Search every chapter section. Multiple words must all be present. */
export async function searchChapters(query, { limit = 30, fresh = false } = {}) {
  const tokens = String(query).toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  const index = await buildSearchIndex({ fresh });
  const results = [];
  for (const entry of index) {
    let score = 0;
    let matched = true;
    for (const token of tokens) {
      let from = 0;
      let hits = 0;
      let at = entry.haystack.indexOf(token, from);
      while (at >= 0) {
        hits += 1;
        from = at + token.length;
        at = entry.haystack.indexOf(token, from);
      }
      if (!hits) { matched = false; break; }
      score += hits;
      if (entry.docTitle.toLowerCase().includes(token)) score += 20;
      if (entry.heading.toLowerCase().includes(token)) score += 10;
    }
    if (!matched) continue;
    results.push({
      ...entry,
      score,
      snippet: snippetFor(entry.text, tokens),
    });
  }

  results.sort((a, b) => b.score - a.score || a.docTitle.localeCompare(b.docTitle));
  return results.slice(0, limit).map((result) => ({
    ...result,
    snippetHtml: highlight(result.snippet, tokens),
  }));
}
