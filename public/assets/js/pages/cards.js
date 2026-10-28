import { CATEGORIES } from '../content.js';
import { esc } from '../ui.js';

export function scenarioCard(s) {
  const cat = CATEGORIES[s.category]?.label || s.category;
  const level = s.level === 'advanced' ? 'Advanced' : 'Core';
  return `<a class="card scenario-card" href="#/sim/${esc(s.id)}">
    <div class="card-meta">
      <span class="pill ${s.level === 'advanced' ? 'violet' : 'accent'}">${level}</span>
      <span class="pill">${esc(cat)}</span>
      ${s.modes ? '<span class="pill ok">JWT / opaque</span>' : ''}
    </div>
    <h3>${esc(s.title)}</h3>
    <p>${esc(s.summary)}</p>
    <div class="flowline">${esc(s.flow)}</div>
    <div class="card-meta"><span class="dim" style="font-size:.72rem">${s.stepLabel || `${s.stepCount} steps`} · ${s.minutes} min</span></div>
  </a>`;
}

export function docCard(d) {
  return `<a class="card" href="#/learn/${esc(d.slug)}">
    <div class="card-meta"><span class="pill">${esc(d.chapter)}</span><span class="pill">${d.minutes} min</span></div>
    <h3>${esc(d.title)}</h3>
    <p>${esc(d.blurb)}</p>
  </a>`;
}
