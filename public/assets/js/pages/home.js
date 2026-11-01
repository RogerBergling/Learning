import { DOCS, TOPICS, TOPIC_ORDER } from '../content.js';
import { SCENARIOS, scenariosByTopic, scenarioById } from '../scenarios/index.js';
import { formatLocalClock } from '../version.js';
import { scenarioCard } from './cards.js';
import { progressSummary } from '../progress.js';
import { icon, esc } from '../ui.js';

function topicCard(topic) {
  const docs = DOCS.filter((doc) => doc.topic === topic.id);
  const scenarios = scenariosByTopic(topic.id);
  return `<a class="card topic-card ${topic.accent}" href="#/topic/${topic.id}">
    <div class="topic-card-head">
      <div class="topic-icon">${icon(topic.icon, 24)}</div>
      <span class="pill">${docs.length} chapters · ${scenarios.length} sims</span>
    </div>
    <h3>${esc(topic.title)}</h3>
    <p>${esc(topic.summary)}</p>
    <span class="topic-cta">${icon('arrow', 14)} Enter ${esc(topic.shortTitle)} track</span>
  </a>`;
}

export function renderHome(view) {
  const summary = progressSummary(DOCS.length);
  const quiz = summary.quiz;
  const featured = ['bff-login', 'docker-run', 'git-first-push', 'docker-build', 'git-release-ghcr', 'openid-federation']
    .map(scenarioById)
    .filter(Boolean);

  view.innerHTML = `
    <section class="hero lab-hero">
      <div>
        <p class="eyebrow">Learning Lab · simulated · offline</p>
        <h1>What do you want to <em>learn?</em></h1>
        <p class="hero-lede">
          Pick a track and learn it hop by hop. Every topic combines written chapters,
          animated flows, a live artifact vault and production pitfalls — no real
          credentials leave your browser.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/topic/onegate">${icon('gate', 16)} OneGate federation</a>
          <a class="btn" href="#/topic/docker">${icon('box', 16)} Docker on Linux</a>
          <a class="btn" href="#/topic/git">${icon('branch', 16)} Git &amp; GHCR</a>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><strong>${TOPIC_ORDER.length}</strong><span>learning tracks</span></div>
          <div class="hero-stat"><strong>${DOCS.length}</strong><span>chapters</span></div>
          <div class="hero-stat"><strong>${SCENARIOS.length}</strong><span>simulations</span></div>
          <div class="hero-stat"><strong>${summary.completed}/${summary.total}</strong><span>chapters complete</span></div>
        </div>
      </div>
      <div class="hero-art lab-art" aria-hidden="true">
        <div class="lab-art-orbit">
          ${TOPIC_ORDER.map((id) => `<div class="lab-art-topic ${TOPICS[id].accent}">
            <span>${icon(TOPICS[id].icon, 24)}</span>
            <strong>${esc(TOPICS[id].shortTitle)}</strong>
            <small>${DOCS.filter((d) => d.topic === id).length} chapters</small>
          </div>`).join('')}
        </div>
        <p>Choose a track → read → simulate → verify</p>
      </div>
    </section>

    <section class="deploy-status" aria-label="Deployment and clock information">
      <span class="pill">Version <strong data-app-version>dev</strong></span>
      <span class="pill">Image <strong data-image-tag>local</strong></span>
      <span class="pill">Commit <strong data-commit>local</strong></span>
      <span class="pill">Built <span data-build-date>local build</span></span>
      <span class="pill deploy-clock">Local time <time data-clock>—</time></span>
      <a class="pill accent" href="/version.json">version.json</a>
    </section>

    <section class="section-head">
      <div>
        <h2>Choose your track</h2>
        <p>Three independent curricula. Each one has chapters, simulations, a glossary and production checklists.</p>
      </div>
    </section>
    <div class="topic-grid">
      ${TOPIC_ORDER.map((id) => topicCard(TOPICS[id])).join('')}
    </div>

    <section class="learn-progress home-progress">
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

    <section class="section-head">
      <div>
        <h2>Featured simulations</h2>
        <p>Short, concrete flows from each track. Open the Tokens/artifacts tab to see what exists after every hop.</p>
      </div>
      <a class="btn btn-ghost btn-sm" href="#/scenarios">${icon('play', 14)} All ${SCENARIOS.length} simulations</a>
    </section>
    <div class="scenario-grid">${featured.map(scenarioCard).join('')}</div>

    <div class="home-foot">
      <div class="callout ok">
        <strong>Everything here is simulated.</strong> Tokens are structurally valid JWTs with fake signatures;
        Docker and Git artifacts are illustrative. No real credentials or infrastructure are used.
        Endpoint and CLI paths are examples — confirm them in your own environment.
      </div>
      <p class="dim">Unofficial study aid. Progress is stored only in this browser.
        <a href="#/selftest">Run the self-check</a> if something looks broken.</p>
    </div>
  `;

  const clock = view.querySelector('[data-clock]');
  if (clock) {
    let timer = null;
    const tick = () => {
      if (!document.body.contains(clock)) {
        clearInterval(timer);
        return;
      }
      const now = new Date();
      clock.textContent = formatLocalClock(now);
      clock.dateTime = now.toISOString();
    };
    tick();
    timer = setInterval(tick, 1000);
  }
}
