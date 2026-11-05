import { DOCS, TOPICS, TOPIC_ORDER } from '../content.js';
import { SCENARIOS, scenariosByTopic } from '../scenarios/index.js';
import { docCard, scenarioCard } from './cards.js';
import { completedChapters } from '../progress.js';
import { esc, icon } from '../ui.js';

function groupedDocs(docs) {
  const groups = new Map();
  for (const doc of docs) {
    if (!groups.has(doc.chapter)) groups.set(doc.chapter, []);
    groups.get(doc.chapter).push(doc);
  }
  return groups;
}

export function renderTopic(view, id) {
  const topic = TOPICS[id];
  if (!topic) {
    view.innerHTML = `<div class="page-head">
      <p class="eyebrow">Topic not found</p>
      <h1>There is no topic called “${esc(id)}”</h1>
      <p class="page-lede">Choose one of the learning paths below.</p>
      <div class="cards">${TOPIC_ORDER.map((key) => `<a class="card" href="#/topic/${key}">
        <h3>${esc(TOPICS[key].title)}</h3><p>${esc(TOPICS[key].summary)}</p>
      </a>`).join('')}</div>
    </div>`;
    return;
  }

  const docs = DOCS.filter((doc) => doc.topic === id);
  const scenarios = scenariosByTopic(id);
  const completed = completedChapters();
  const topicCompleted = docs.filter((doc) => completed.has(doc.slug)).length;
  const percent = docs.length ? Math.round((topicCompleted / docs.length) * 100) : 0;
  const groups = groupedDocs(docs);
  const path = topic.path.map((slug) => DOCS.find((doc) => doc.slug === slug)).filter(Boolean);
  const start = path[0];
  const otherTopics = TOPIC_ORDER.filter((key) => key !== id);

  document.title = `${topic.title} · Learning Lab`;

  view.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="#/">Topics</a><span aria-hidden="true">/</span><span>${esc(topic.title)}</span>
    </nav>

    <header class="topic-hero ${topic.accent}">
      <div class="topic-hero-copy">
        <div class="topic-icon">${icon(topic.icon, 28)}</div>
        <p class="eyebrow">${esc(topic.eyebrow)}</p>
        <h1>${esc(topic.title)}</h1>
        <p class="page-lede">${esc(topic.summary)}</p>
        <div class="hero-actions">
          ${start ? `<a class="btn btn-primary" href="#/learn/${esc(start.slug)}">${icon('book', 15)} Start with ${esc(start.title.split(':')[0])}</a>` : ''}
          <a class="btn" href="#/scenarios">${icon('play', 15)} ${scenarios.length} simulations</a>
        </div>
        <div class="topic-outcomes">
          <h2>What you will be able to do</h2>
          <ul>${topic.outcomes.map((outcome) => `<li>${esc(outcome)}</li>`).join('')}</ul>
        </div>
      </div>
      <aside class="topic-side">
        <div class="topic-stats">
          <div><strong>${docs.length}</strong><span>chapters</span></div>
          <div><strong>${scenarios.length}</strong><span>simulations</span></div>
          <div><strong>${topicCompleted}</strong><span>completed</span></div>
        </div>
        <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="${esc(topic.shortTitle)} chapter completion">
          <span style="width:${percent}%"></span>
        </div>
        <p class="dim">${topicCompleted} of ${docs.length} chapters complete. Progress is stored in this browser.</p>
        <div class="topic-links">
          <a class="btn btn-sm" href="#/quiz/${esc(id)}">${icon('check', 14)} Take the quiz</a>
          <a class="btn btn-sm btn-ghost" href="${id === 'onegate' ? '#/glossary' : `#/learn/${id}-glossary`}">${icon('book', 14)} Glossary</a>
        </div>
        ${topic.project ? `<a class="topic-project ${topic.accent}" href="${esc(topic.project.url)}" target="_blank" rel="noopener noreferrer">
          <span class="topic-project-eyebrow">${icon('github', 13)} Companion project</span>
          <strong>${esc(topic.project.name)}</strong>
          <span class="topic-project-label">${esc(topic.project.label)}</span>
          <p>${esc(topic.project.summary)}</p>
          <ul>${topic.project.features.map((feature) => `<li>${esc(feature)}</li>`).join('')}</ul>
          <span class="topic-project-link">Open on GitHub ${icon('arrow', 13)}</span>
        </a>` : ''}
      </aside>
    </header>

    <section class="section-head">
      <div><h2>The written track</h2><p>${esc(topic.description)}</p></div>
      <a class="btn btn-ghost btn-sm" href="#/learn">All chapters</a>
    </section>

    <div class="topic-chapters">
      ${[...groups.entries()].map(([chapter, items]) => `<section class="chapter-block">
        <div class="chapter-head"><h2>${esc(chapter)}</h2><span class="pill">${items.length} chapter${items.length === 1 ? '' : 's'}</span></div>
        <div class="cards">${items.map((doc) => docCard(doc, completed.has(doc.slug))).join('')}</div>
      </section>`).join('')}
    </div>

    <section class="section-head">
      <div><h2>Simulations</h2><p>Every flow is animated hop by hop with a live artifact vault, HTTP/CLI view and production notes.</p></div>
      <a class="btn btn-ghost btn-sm" href="#/scenarios">All ${SCENARIOS.length} simulations</a>
    </section>
    <div class="scenario-grid">${scenarios.map(scenarioCard).join('')}</div>

    <section class="section-head"><div><h2>Keep going</h2><p>Switch topic or use the global tools.</p></div></section>
    <div class="cards">
      ${otherTopics.map((key) => `<a class="card" href="#/topic/${key}">
        <div class="card-icon">${icon(TOPICS[key].icon, 18)}</div>
        <h3>${esc(TOPICS[key].title)}</h3>
        <p>${esc(TOPICS[key].summary)}</p>
      </a>`).join('')}
      <a class="card" href="#/quiz"><div class="card-icon">${icon('check', 18)}</div>
        <h3>Quiz & progress</h3><p>Check the boundaries you just learned and save your score locally.</p></a>
    </div>
  `;
}
