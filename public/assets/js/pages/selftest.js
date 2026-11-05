import { SCENARIOS } from '../scenarios/index.js';
import { allActors, LAYOUTS } from '../sim/layout.js';
import { CATEGORIES, DOCS, LEARNING_PATH, TOPICS, TOPIC_ORDER, docBySlug } from '../content.js';
import { KINDS, STORES, materialize, decodeJwt, mockJwt } from '../tokens.js';
import { render } from '../markdown.js';
import { loadDoc } from '../app.js';
import { QUIZ } from '../quiz-data.js';
import { searchChapters } from '../search.js';
import { getProgress, progressSummary } from '../progress.js';
import { esc, icon } from '../ui.js';

const CHANNELS = new Set(['front', 'back', 'cookie', 'attr', 'internal', 'saml', 'cli', 'engine', 'network', 'registry', 'git', 'ci', 'deploy', 'host', 'storage', 'guest', 'report', 'dns', 'dnssec', 'xfer', 'update']);
const ACTORS = allActors();

export async function renderSelftest(view, isCurrent = () => true) {
  view.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">Quality check</p>
      <h1>Self-check</h1>
      <p class="page-lede">
        This page validates the scenario data, the token simulation and every Markdown chapter at runtime.
        It is meant for developing the lab itself — if a simulation looks wrong, start here.
      </p>
    </header>
    <div class="loading" data-running role="status"><span class="spinner"></span> Running checks…</div>
    <div data-results hidden></div>
  `;

  const results = await runTests();
  if (!isCurrent()) return;
  paint(view, results, isCurrent);
}

async function runTests() {
  const rows = [];
  const add = (name, ok, detail = '') => rows.push({ name, ok, detail });

  /* -------------------------------------------------------------- registry */
  add('scenario registry is not empty', SCENARIOS.length > 0, `${SCENARIOS.length} scenarios`);
  const ids = new Set();
  for (const s of SCENARIOS) {
    if (ids.has(s.id)) add(`unique id: ${s.id}`, false, 'duplicate scenario id');
    ids.add(s.id);
  }
  add('scenario ids are unique', ids.size === SCENARIOS.length, `${ids.size} ids`);

  const catKeys = new Set(Object.keys(CATEGORIES));
  for (const s of SCENARIOS) {
    const prefix = s.id || '(missing id)';
    add(`${prefix}: required fields`, Boolean(s.id && s.title && s.summary && s.level && s.category),
      !s.id ? 'missing id' : !s.title ? 'missing title' : !s.summary ? 'missing summary' : '');
    add(`${prefix}: known category`, catKeys.has(s.category), s.category || 'missing');
    add(`${prefix}: known topic`, Boolean(TOPICS[s.topic]), s.topic || 'missing');
    add(`${prefix}: known layout`, Boolean(LAYOUTS[s.layout || 'onegate']), s.layout || 'onegate');
    add(`${prefix}: flow line`, Boolean(s.flow), s.flow || 'missing');
    add(`${prefix}: search tags`, Array.isArray(s.tags) && s.tags.length >= 3 && s.tags.every((t) => typeof t === 'string' && t.trim()),
      Array.isArray(s.tags) ? `${s.tags.length} tags` : 'missing');

    const initialOk = checkVault(s.initial || {}, `${prefix}: initial vault`);
    for (const msg of initialOk.errors) add(`${prefix}: initial vault`, false, msg);

    const nodeList = s.nodes || [];
    add(`${prefix}: nodes array`, Array.isArray(nodeList) && nodeList.every((n) => ACTORS.has(n)),
      nodeList.filter((n) => !ACTORS.has(n)).join(', '));
    add(`${prefix}: default mode exists`, !s.variants || !s.defaultMode || Boolean(s.variants[s.defaultMode]),
      s.defaultMode || 'default');

    if (s.variants) {
      const modes = Object.keys(s.variants);
      add(`${prefix}: variants declared`, modes.length > 1, modes.join(', '));
      for (const mode of modes) {
        const v = s.variants[mode];
        add(`${prefix}/${mode}: has steps`, Array.isArray(v.steps) && v.steps.length > 0,
          `${v.steps?.length ?? 0} steps`);
        const vInitial = checkVault(v.initial || s.initial || {}, `${prefix}/${mode}: initial vault`);
        for (const msg of vInitial.errors) add(`${prefix}/${mode}: initial vault`, false, msg);
        checkSteps(v.steps || [], `${prefix}/${mode}`, add);
      }
    } else {
      add(`${prefix}: has steps`, Array.isArray(s.steps) && s.steps.length > 0, `${s.steps?.length ?? 0} steps`);
      checkSteps(s.steps || [], prefix, add);
    }

    add(`${prefix}: node labels valid`, Object.keys(s.nodeLabels || {}).every((n) => ACTORS.has(n)),
      Object.keys(s.nodeLabels || {}).filter((n) => !ACTORS.has(n)).join(', '));
    add(`${prefix}: config entries have titles`, (s.config || []).every((c) => c.title && Array.isArray(c.items)),
      `${(s.config || []).length} blocks`);
  }

  /* --------------------------------------------------------------- content */
  const slugs = new Set(DOCS.map((d) => d.slug));
  for (const slug of LEARNING_PATH) {
    add(`learning path: ${slug}`, slugs.has(slug) && Boolean(docBySlug(slug)), slugs.has(slug) ? '' : 'not in DOCS');
  }
  add('learning path has no duplicates', new Set(LEARNING_PATH).size === LEARNING_PATH.length);

  /* ------------------------------------------------------------------ topics */
  add('topic order is not empty', TOPIC_ORDER.length >= 3, `${TOPIC_ORDER.length} topics`);
  for (const id of TOPIC_ORDER) {
    const topic = TOPICS[id];
    const docs = DOCS.filter((doc) => doc.topic === id);
    const scenarios = SCENARIOS.filter((scenario) => scenario.topic === id);
    add(`topic ${id}: metadata`, Boolean(topic && topic.title && topic.summary && topic.icon));
    add(`topic ${id}: has chapters`, docs.length > 0, `${docs.length} chapters`);
    add(`topic ${id}: has simulations`, scenarios.length > 0, `${scenarios.length} simulations`);
    add(`topic ${id}: all path slugs exist`, (topic?.path || []).every((slug) => slugs.has(slug)));
  }
  for (const doc of DOCS) {
    add(`doc ${doc.slug}: known topic`, Boolean(TOPICS[doc.topic]), doc.topic || 'missing');
  }

  /* ------------------------------------------------------------------- quiz */
  const quizIds = new Set();
  add('quiz has questions', QUIZ.length >= 10, `${QUIZ.length} questions`);
  for (const q of QUIZ) {
    const at = `quiz: ${q.id || '(missing id)'}`;
    add(`${at}: unique id`, Boolean(q.id) && !quizIds.has(q.id), q.id || 'missing');
    quizIds.add(q.id);
    add(`${at}: question`, typeof q.question === 'string' && q.question.length > 15);
    add(`${at}: known track`, Boolean(TOPICS[q.track]), q.track || 'missing');
    add(`${at}: options`, Array.isArray(q.options) && q.options.length >= 2 && q.options.every((o) => typeof o === 'string' && o));
    add(`${at}: answer index`, Number.isInteger(q.answer) && q.answer >= 0 && q.answer < (q.options?.length || 0), String(q.answer));
    add(`${at}: explanation`, typeof q.explanation === 'string' && q.explanation.length > 20);
    const link = q.link || {};
    const target = String(link.href || '').replace(/^#\//, '');
    const validLink = target.startsWith('learn/')
      ? slugs.has(target.slice('learn/'.length))
      : target.startsWith('sim/')
        ? new Set(SCENARIOS.map((s) => s.id)).has(target.slice('sim/'.length))
        : false;
    add(`${at}: explanation link`, validLink, link.href || 'missing');
  }

  /* --------------------------------------------------------------- progress */
  const storedProgress = getProgress();
  add('progress store has chapters', Boolean(storedProgress.chapters && typeof storedProgress.chapters === 'object'));
  add('progress store has quiz state', Boolean(storedProgress.quiz && Number.isInteger(storedProgress.quiz.attempts)));
  add('progress summary uses the chapter total', progressSummary(DOCS.length).total === DOCS.length);

  /* ---------------------------------------------------------------- tokens */
  const jwt = mockJwt({ sub: 'selftest', aud: 'api.test', exp: 2000000000 });
  const decoded = decodeJwt(jwt);
  add('JWT round-trip decodes', Boolean(decoded && decoded.payload.sub === 'selftest'), decoded?.payload?.sub || 'decode failed');
  add('JWT has three parts', jwt.split('.').length === 3);

  try {
    const versionResponse = await fetch('/version.json', { cache: 'no-store' });
    const versionInfo = await versionResponse.json();
    add('version metadata loads', versionResponse.ok && Boolean(versionInfo.version),
      versionInfo.version ? `version ${versionInfo.version}` : 'missing version');
  } catch (err) {
    add('version metadata loads', false, String(err.message || err));
  }

  for (const [kind, def] of Object.entries({
    jwt: { id: 'at', kind: 'jwt' },
    opaque: { id: 'at', kind: 'opaque' },
    id: { id: 'id', kind: 'id' },
    rt: { id: 'rt', kind: 'rt' },
    code: { id: 'code', kind: 'code' },
    cookie: { id: 'bff', kind: 'cookie' },
    csrf: { id: 'csrf', kind: 'csrf' },
    secret: { id: 'secret', kind: 'secret' },
    jwk: { id: 'jwk', kind: 'jwk' },
    statement: { id: 'stmt', kind: 'statement' },
  })) {
    const m = materialize(def, { scenarioId: 'selftest' });
    add(`materialize ${kind}`, Boolean(m.value) && m.kind === kind, m.value ? `${String(m.value).length} chars` : 'no value');
  }

  /* --------------------------------------------------------------- markdown */
  const mdOut = render('# Title\n\n## Section\n\nSome **bold** text and a [link](https://example.com).\n\n- one\n- two\n\n```js\nconst x = 1;\n```');
  add('markdown headings', mdOut.html.includes('<h1 id="title">') && mdOut.html.includes('<h2 id="section">'));
  add('markdown inline formatting', mdOut.html.includes('<strong>bold</strong>') && mdOut.html.includes('<a href="https://example.com">link</a>'));
  add('markdown lists', mdOut.html.includes('<li>one</li>'));
  add('markdown code fences', mdOut.html.includes('const x = 1;'));
  add('markdown TOC extraction', mdOut.toc.length === 1 && mdOut.toc[0].id === 'section');
  add('markdown escapes HTML', render('<script>alert(1)</script>').html.includes('&lt;script&gt;'));
  add('markdown tables', render('| a | b |\n| --- | --- |\n| 1 | 2 |').html.includes('<table>'));
  const unsafeMd = render('[bad](javascript:alert(1)) ![bad](data:text/html,evil)');
  add('markdown blocks unsafe URLs', !/javascript:|data:text/i.test(unsafeMd.html), unsafeMd.html);

  /* ------------------------------------------------------------------ docs */
  if (DOCS.length === 0) add('docs list', false, 'no documents declared');
  const docResults = await Promise.all(DOCS.map(async (d) => {
    try {
      const src = await loadDoc(d.slug, { fresh: true });
      const r = render(src);
      return {
        slug: d.slug,
        ok: src.trim().length > 200 && r.html.length > 200,
        detail: `${src.length} chars · ${r.toc.length} sections`,
        toc: r.toc.length,
        src,
      };
    } catch (err) {
      return { slug: d.slug, ok: false, detail: String(err.message || err) };
    }
  }));
  for (const r of docResults) add(`doc: ${r.slug}`, r.ok, r.detail);
  const missingToc = docResults.filter((r) => r.ok && r.toc === 0);
  add('every chapter has sections', missingToc.length === 0, missingToc.map((r) => r.slug).join(', '));

  const simIds = new Set(SCENARIOS.map((s) => s.id));
  const docSlugs = new Set(DOCS.map((d) => d.slug));
  for (const r of docResults) {
    if (!r.src) continue;
    for (const match of r.src.matchAll(/#\/(sim|learn)\/([A-Za-z0-9._-]+)/g)) {
      const [, kind, target] = match;
      const valid = kind === 'sim' ? simIds.has(target) : docSlugs.has(target);
      add(`${r.slug}: ${kind} link ${target}`, valid, valid ? '' : 'target does not exist');
    }
  }

  const pkceResults = await searchChapters('PKCE');
  add('chapter search finds PKCE', pkceResults.some((r) => r.slug === '02-oidc-basics' || r.slug === '07-tokens-and-lifecycle'),
    `${pkceResults.length} matching sections`);

  return rows;
}

function checkSteps(steps, prefix, add) {
  if (!steps.length) { add(`${prefix}: steps not empty`, false, '0 steps'); return; }
  add(`${prefix}: step count`, steps.length >= 3, `${steps.length} steps`);
  add(`${prefix}: last step exists`, Boolean(steps[steps.length - 1]?.badge), steps[steps.length - 1]?.badge || 'missing');

  steps.forEach((st, i) => {
    const at = `${prefix}: step ${i + 1}`;
    const actorOk = ACTORS.has(st.from) && ACTORS.has(st.to);
    add(`${at}: actors exist`, actorOk, !ACTORS.has(st.from) ? `unknown from "${st.from}"` : !ACTORS.has(st.to) ? `unknown to "${st.to}"` : '');
    add(`${at}: badge`, Boolean(st.badge), st.badge || 'missing');
    add(`${at}: detail`, typeof st.detail === 'string' && st.detail.length > 20, st.detail ? `${st.detail.length} chars` : 'missing');
    add(`${at}: channel`, st.channel === undefined || CHANNELS.has(st.channel), st.channel || 'default');
    if (st.http) {
      add(`${at}: http shape`, (st.http.req === undefined || typeof st.http.req === 'string') &&
        (st.http.res === undefined || typeof st.http.res === 'string'));
    }
    const v = checkVault({ onegate: [] }, at, st.vault || []);
    for (const msg of v.errors) add(`${at}: vault`, false, msg);
    add(`${at}: tags array`, st.tags === undefined || Array.isArray(st.tags));
  });
}

function checkVault(initial = {}, prefix, ops = null) {
  const errors = [];
  const checkItem = (store, item, where) => {
    if (!STORES[store]) errors.push(`${where}: unknown store "${store}"`);
    if (!item || !item.id) errors.push(`${where}: item without id`);
    if (!item || !item.kind) errors.push(`${where}: item "${item?.id}" without kind`);
    else if (!KINDS[item.kind]) errors.push(`${where}: item "${item.id}" has unknown kind "${item.kind}"`);
    if (!item || !item.name) errors.push(`${where}: item "${item?.id}" without name`);
  };

  if (ops) {
    for (const op of ops) {
      if (!STORES[op.store]) errors.push(`unknown store "${op.store}"`);
      if (op.add) checkItem(op.store, op.add, 'add');
      if (op.del && typeof op.del !== 'string') errors.push('del without id');
      if (!op.add && !op.del && !op.clearStore) errors.push(`empty vault op on "${op.store}"`);
    }
  } else {
    for (const [store, items] of Object.entries(initial)) {
      if (!STORES[store]) errors.push(`unknown store "${store}"`);
      if (!Array.isArray(items)) { errors.push(`store "${store}" is not an array`); continue; }
      for (const item of items) checkItem(store, item, store);
    }
  }
  return { errors };
}

function paint(view, rows) {
  const failed = rows.filter((r) => !r.ok);
  const passed = rows.length - failed.length;
  const pct = rows.length ? Math.round((passed / rows.length) * 100) : 0;

  const groups = new Map();
  for (const r of rows) {
    const key = r.name.includes(':') ? r.name.split(':')[0] : 'General';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  view.querySelector('[data-running]')?.remove();
  const box = view.querySelector('[data-results]');
  box.hidden = false;
  box.innerHTML = `
    <div class="selftest-summary ${failed.length ? 'has-fail' : 'all-pass'}">
      <div class="st-score">${failed.length ? icon('alert', 26) : icon('check', 26)}<strong>${pct}%</strong></div>
      <div>
        <h2 style="margin:0 0 .2rem">${failed.length ? `${failed.length} check${failed.length === 1 ? '' : 's'} failed` : 'All checks passed'}</h2>
        <p class="muted" style="margin:0">${passed} of ${rows.length} assertions passed. This runs entirely in your browser against the live files.</p>
      </div>
      <button class="btn btn-sm" type="button" data-rerun>${icon('reset', 14)} Run again</button>
    </div>

    ${failed.length ? `<div class="selftest-list" style="margin-bottom:1.4rem">
      ${failed.map((r) => `<div class="selftest-row"><span class="st-fail">✗</span><span class="st-name">${esc(r.name)}</span><span class="st-detail">${esc(r.detail)}</span></div>`).join('')}
    </div>` : ''}

    <div class="selftest-groups">
      ${[...groups.entries()].map(([name, items]) => {
        const bad = items.filter((r) => !r.ok).length;
        return `<details class="selftest-group" ${bad ? 'open' : ''}>
          <summary><span class="${bad ? 'st-fail' : 'st-pass'}">${bad ? '✗' : '✓'}</span>
            <strong>${esc(name)}</strong>
            <span class="dim">${items.length - bad}/${items.length}</span></summary>
          <div class="selftest-list">
            ${items.map((r) => `<div class="selftest-row"><span class="${r.ok ? 'st-pass' : 'st-fail'}">${r.ok ? '✓' : '✗'}</span>
              <span class="st-name">${esc(r.name)}</span><span class="st-detail">${esc(r.detail)}</span></div>`).join('')}
          </div>
        </details>`;
      }).join('')}
    </div>

    <div class="callout" style="margin-top:1.4rem">
      <strong>What this does not test:</strong> real cryptography, real browsers beyond this one, or your OneGate
      deployment. Tokens are simulated; endpoints are illustrative.
    </div>
  `;

  box.querySelector('[data-rerun]').addEventListener('click', async () => {
    box.innerHTML = '<div class="loading"><span class="spinner"></span> Running checks…</div>';
    const next = await runTests();
    paint(view, next);
  });
}
