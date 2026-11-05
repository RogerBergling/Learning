/* Site-wide search. Chapter full text is built from the same Markdown files
   the Learn page renders; simulations, learning tracks, quiz questions and
   static pages are indexed from their existing registries. There is no second
   chapter index. */

import { DOCS, TOPICS, CATEGORIES } from './content.js';
import { SCENARIOS } from './scenarios/index.js';
import { QUIZ } from './quiz-data.js';
import { esc } from './markdown.js';
import { loadDoc } from './app.js';

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const lower = (value) => String(value ?? '').toLowerCase();

const tokenize = (query) => String(query).toLowerCase().trim().split(/\s+/).filter(Boolean);

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

function textOf(value) {
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(textOf).join(' ');
  return value == null ? '' : String(value);
}

function scenarioText(scenario) {
  const parts = [scenario.title, scenario.summary, scenario.flow, ...(scenario.tags || [])];
  const steps = scenario.variants
    ? Object.values(scenario.variants).flatMap((variant) => variant.steps || [])
    : scenario.steps || [];
  for (const step of steps) {
    parts.push(step.badge, step.detail, step.channel, ...(step.tags || []));
    if (step.http) parts.push(step.http.req, step.http.res);
  }
  parts.push(
    textOf(scenario.nodeLabels),
    textOf(scenario.notes),
    textOf(scenario.config),
    textOf(scenario.pitfalls),
    textOf(scenario.productionChecks),
  );
  return parts.filter(Boolean).join(' \n ');
}

const STATIC_PAGES = [
  {
    kind: 'page',
    id: 'page-home',
    href: '#/',
    title: 'Home — choose your track',
    meta: 'Page · overview',
    tags: 'home topics tracks start choose learning lab',
    body: 'The Learning Lab overview: choose OneGate federation, Docker on Linux, Git and GHCR, HAProxy, ESXtop or BIND and DNS. Six tracks with chapters, simulations, progress and companion projects.',
  },
  {
    kind: 'page',
    id: 'page-learn',
    href: '#/learn',
    title: 'Learn — every chapter',
    meta: 'Page · written track',
    tags: 'chapters documentation markdown table of contents progress',
    body: 'All written chapters across OneGate, Docker, Git, HAProxy, ESXtop and BIND. Full-text search, table of contents and completion tracking.',
  },
  {
    kind: 'page',
    id: 'page-scenarios',
    href: '#/scenarios',
    title: 'Simulations — every animated flow',
    meta: 'Page · simulations',
    tags: 'simulations scenarios animated flows filter category level tags',
    body: 'Browse all animated flows. Filter and search by topic, category, level, tag or keyword; open any simulation to inspect the wire view, artifacts and pitfalls.',
  },
  {
    kind: 'page',
    id: 'page-compare',
    href: '#/compare',
    title: 'Compare token formats and storage',
    meta: 'Page · decision helper',
    tags: 'compare jwt opaque token storage matrix decision helper',
    body: 'JWT versus opaque access tokens, a credential storage matrix and a client decision helper.',
  },
  {
    kind: 'page',
    id: 'page-quiz',
    href: '#/quiz',
    title: 'Quiz — test your boundaries',
    meta: 'Page · knowledge check',
    tags: 'quiz questions answers score progress knowledge check',
    body: 'A knowledge check across the tracks with explanations, chapter and simulation links, and local progress.',
  },
  {
    kind: 'page',
    id: 'page-selftest',
    href: '#/selftest',
    title: 'Self-check — validate the lab',
    meta: 'Page · diagnostics',
    tags: 'selftest self-check validation runtime checks diagnostics quality',
    body: 'Validate scenario data, actors, vault operations, token kinds, Markdown rendering, every doc fetch and the search index at runtime.',
  },
];

function makeRecord({ kind, id, href, title, meta, tags = '', body = '' }) {
  return {
    kind,
    id,
    href,
    title,
    meta,
    titleLower: lower(title),
    tagsLower: lower(tags),
    bodyLower: lower(body),
    snippetText: plain(body),
  };
}

function buildStaticRecords() {
  const records = [];

  for (const scenario of SCENARIOS) {
    const topic = TOPICS[scenario.topic];
    records.push(makeRecord({
      kind: 'simulation',
      id: `sim-${scenario.id}`,
      href: `#/sim/${scenario.id}`,
      title: scenario.title,
      meta: [
        topic?.shortTitle,
        CATEGORIES[scenario.category]?.label || scenario.category,
        scenario.level === 'advanced' ? 'Advanced' : 'Core',
        scenario.stepLabel,
      ].filter(Boolean).join(' · '),
      tags: [
        scenario.topic,
        TOPICS[scenario.topic]?.title,
        TOPICS[scenario.topic]?.shortTitle,
        scenario.category,
        CATEGORIES[scenario.category]?.label,
        scenario.level,
        ...(scenario.tags || []),
        ...(scenario.modes || []),
      ].filter(Boolean).join(' '),
      body: scenarioText(scenario),
    }));
  }

  for (const topic of Object.values(TOPICS)) {
    const docs = DOCS.filter((doc) => doc.topic === topic.id);
    const pathTitles = (topic.path || [])
      .map((slug) => DOCS.find((doc) => doc.slug === slug)?.title)
      .filter(Boolean);
    records.push(makeRecord({
      kind: 'topic',
      id: `topic-${topic.id}`,
      href: `#/topic/${topic.id}`,
      title: topic.title,
      meta: `${topic.eyebrow} · ${docs.length} chapters`,
      tags: [topic.id, topic.shortTitle, topic.eyebrow].join(' '),
      body: [
        topic.summary,
        topic.description,
        ...(topic.outcomes || []),
        ...pathTitles,
        ...(topic.project
          ? [topic.project.name, topic.project.label, topic.project.summary, ...(topic.project.features || [])]
          : []),
      ].join(' \n '),
    }));
  }

  for (const question of QUIZ) {
    const topic = TOPICS[question.track];
    records.push(makeRecord({
      kind: 'quiz',
      id: `quiz-${question.id}`,
      href: `#/quiz/${question.track}`,
      title: question.question,
      meta: `Quiz · ${topic?.shortTitle || question.track} · ${question.area}`,
      tags: [
        question.track,
        topic?.title,
        topic?.shortTitle,
        question.area,
        'quiz question',
      ].filter(Boolean).join(' '),
      body: [question.question, question.area, question.explanation, ...(question.options || [])].join(' \n '),
    }));
  }

  for (const page of STATIC_PAGES) records.push(makeRecord(page));
  return records;
}

const STATIC_RECORDS = buildStaticRecords();

const STATIC_GROUPS = [
  { kind: 'simulation', id: 'simulations', label: 'Simulations', limit: 5 },
  { kind: 'topic', id: 'topics', label: 'Learning tracks', limit: 3 },
  { kind: 'quiz', id: 'quiz', label: 'Quiz', limit: 3 },
  { kind: 'page', id: 'pages', label: 'Site pages', limit: 3 },
];

function countMatches(haystack, token) {
  let count = 0;
  let at = 0;
  while ((at = haystack.indexOf(token, at)) >= 0) {
    count += 1;
    at += token.length;
  }
  return count;
}

function scoreRecord(record, tokens) {
  let score = 0;
  for (const token of tokens) {
    const titleHits = countMatches(record.titleLower, token);
    const tagHits = countMatches(record.tagsLower, token);
    const bodyHits = countMatches(record.bodyLower, token);
    if (!titleHits && !tagHits && !bodyHits) return 0;
    score += titleHits * 36 + tagHits * 14 + Math.min(bodyHits, 20);
  }
  return score;
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
  const lowerText = text.toLowerCase();
  const positions = tokens.map((token) => lowerText.indexOf(token)).filter((i) => i >= 0);
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

/**
 * Search the structured parts of the site: simulations, learning tracks,
 * quiz questions and static pages. Chapter full text is handled by
 * searchChapters(), so the two can render independently.
 */
export function searchStaticSite(query, { perGroup = {} } = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const matches = [];
  for (const record of STATIC_RECORDS) {
    const score = scoreRecord(record, tokens);
    if (!score) continue;
    matches.push({
      ...record,
      score,
      snippetHtml: highlight(snippetFor(record.snippetText, tokens), tokens),
    });
  }

  matches.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return STATIC_GROUPS.map((group) => {
    const all = matches.filter((record) => record.kind === group.kind);
    const limit = perGroup[group.id] ?? group.limit;
    return {
      id: group.id,
      label: group.label,
      total: all.length,
      items: all.slice(0, limit).map(({ kind, id, href, title, meta, snippetHtml }) => ({
        kind, id, href, title, meta, snippetHtml,
      })),
    };
  }).filter((group) => group.items.length);
}

/** Search every chapter section. Multiple words must all be present. */
export async function searchChapters(query, { limit = 30, fresh = false } = {}) {
  const { items } = await searchChapterResults(query, { limit, fresh });
  return items;
}

/** Chapter search with the full match count for global search summaries. */
export async function searchChapterResults(query, { limit = 30, fresh = false } = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return { items: [], total: 0 };

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
  return {
    total: results.length,
    items: results.slice(0, limit).map((result) => ({
      ...result,
      snippetHtml: highlight(result.snippet, tokens),
    })),
  };
}
