import { NODES, SUBNODES, pathFor, pctX, pctY } from './layout.js';
import { materialize, KINDS, STORES, decodeJwt, relTime, preview } from '../tokens.js';
import { md } from '../markdown.js';
import { icon, esc, prefersReducedMotion } from '../ui.js';

const CHANNELS = {
  front: 'front channel',
  back: 'back channel',
  cookie: 'cookie',
  attr: 'attribute call',
  internal: 'internal',
  saml: 'SAML',
};

const STORE_ICONS = {
  browser: 'browser', onegate: 'gate', frontend: 'server', backend: 'database',
  idp: 'cloud', sp: 'layers', attr: 'sparkle',
};

const STORE_ORDER = ['browser', 'onegate', 'frontend', 'backend', 'idp', 'sp', 'attr'];

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class SimPlayer {
  constructor(root, scenario, opts = {}) {
    this.root = root;
    this.scenario = scenario;
    this.opts = opts;
    this.mode = scenario.variants ? (scenario.defaultMode || 'jwt') : null;
    this.speed = 1;
    this.index = 0;
    this.playing = false;
    this.animating = false;
    this.raf = null;
    this.timer = null;
    this.vault = new Map();
    this.ctx = {
      scenarioId: scenario.id,
      iss: 'https://login.example.com/mg-local/portal',
      sub: 'a1b2c3d4-7f31-4a1e-9d2c-55e0f1a2b3c4',
      aud: 'api.orders',
      clientId: 'portal-web',
      ...(scenario.ctx || {}),
    };
    this.steps = this.pickSteps();
    this.usedActors = this.computeUsedActors();
    this.journey = this.computeJourney();
    this.selectedToken = null;
    this.tab = 'explain';
    this.build();
    this.bind();
    this.go(0, false, true);
  }

  /* ------------------------------------------------------------------ data */

  pickSteps() {
    const s = this.scenario;
    if (s.variants) {
      const v = s.variants[this.mode] || s.variants[Object.keys(s.variants)[0]];
      return v.steps.map((x) => ({ ...x }));
    }
    return s.steps.map((x) => ({ ...x }));
  }

  computeUsedActors() {
    const used = new Set(this.scenario.nodes || []);
    for (const st of this.steps) {
      used.add(st.from);
      used.add(st.to);
    }
    return used;
  }

  computeJourney() {
    const events = [];
    const initial = this.scenario.variants?.[this.mode]?.initial || this.scenario.initial || {};
    for (const [store, items] of Object.entries(initial)) {
      for (const item of items) events.push({ step: -1, store, item, op: 'add' });
    }
    const addEvents = (stepIndex) => {
      for (const op of this.steps[stepIndex].vault || []) {
        if (op.add) events.push({ step: stepIndex, store: op.store, item: op.add, op: 'add' });
        if (op.del) events.push({ step: stepIndex, store: op.store, item: { id: op.del }, op: 'del' });
      }
    };
    for (let i = 0; i < this.steps.length; i++) addEvents(i);
    const groups = new Map();
    for (const e of events) {
      if (!e.item.id) continue;
      if (!groups.has(e.item.id)) groups.set(e.item.id, { id: e.item.id, name: '', kind: '', stores: [], first: null, last: null });
      const g = groups.get(e.item.id);
      if (e.op === 'add') {
        g.name = e.item.name || g.name;
        g.kind = e.item.kind || g.kind;
        if (!g.stores.includes(e.store)) g.stores.push(e.store);
        if (g.first === null) g.first = { step: e.step, store: e.store };
        g.last = { step: e.step, store: e.store, removed: false };
      } else if (g.first) {
        g.last = { step: e.step, store: e.store, removed: true };
      }
    }
    return [...groups.values()].sort((a, b) => (a.first?.step ?? 0) - (b.first?.step ?? 0));
  }

  recomputeVault(upto) {
    const v = new Map();
    for (const st of Object.keys(STORES)) v.set(st, new Map());
    const initial = this.scenario.variants?.[this.mode]?.initial || this.scenario.initial || {};
    for (const [store, items] of Object.entries(initial)) {
      if (!v.has(store)) v.set(store, new Map());
      for (const it of items) {
        const m = materialize(it, this.ctx);
        v.get(store).set(m.id, m);
      }
    }
    for (let i = 0; i <= upto; i++) {
      for (const op of this.steps[i].vault || []) {
        if (!v.has(op.store)) v.set(op.store, new Map());
        const store = v.get(op.store);
        if (op.clearStore) store.clear();
        if (op.del) store.delete(op.del);
        if (op.add) {
          const m = materialize(op.add, this.ctx);
          store.set(m.id, m);
        }
      }
    }
    return v;
  }

  /* ------------------------------------------------------------------- DOM */

  build() {
    const s = this.scenario;
    const guideNote = (s.notes || []).find((n) => !/^\*\*Manual caveat/i.test(n)) || (s.notes || [])[0];
    const guideTrap = (s.pitfalls || [])[0];
    const modeControl = s.variants
      ? `<div class="seg" role="group" aria-label="Token format">
           ${Object.entries(s.variants).map(([k, v]) =>
             `<button type="button" data-mode="${k}" class="${k === this.mode ? 'active' : ''}">${esc(v.label || k)}</button>`).join('')}
         </div>`
      : '';

    this.root.innerHTML = `
      <div class="controls">
        <button class="btn btn-icon" data-act="reset" title="Restart (R)" aria-label="Restart">${icon('reset', 17)}</button>
        <button class="btn btn-icon" data-act="prev" title="Previous step (←)" aria-label="Previous step">${icon('prev', 15)}</button>
        <button class="btn btn-primary" data-act="play" title="Play / pause (Space)">${icon('play', 15)}<span data-play-label>Play</span></button>
        <button class="btn btn-icon" data-act="next" title="Next step (→)" aria-label="Next step">${icon('next', 15)}</button>
        <span class="counter" data-counter>1 / ${this.steps.length}</span>
        <span class="spacer"></span>
        ${modeControl}
        <label>Speed
          <select class="control-select" data-speed>
            <option value="0.6">0.6×</option>
            <option value="1" selected>1×</option>
            <option value="1.6">1.6×</option>
            <option value="2.4">2.4×</option>
          </select>
        </label>
      </div>
      <div class="progress-track"><div class="progress-fill" data-progress></div></div>

      <div class="sim-shell">
        <div class="sim-main">
          <div class="stage-wrap">
            <div class="stage-scroll">
              <div class="stage" data-stage>
                <div class="stage-grid"></div>
                <svg class="wires" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true" data-wires></svg>
                ${this.renderNodes()}
                <div class="packets" data-packets></div>
              </div>
            </div>
            <div class="stage-legend">
              <span><i class="lg-dot" style="background:var(--accent)"></i>front channel</span>
              <span><i class="lg-dot" style="background:var(--ok)"></i>back channel</span>
              <span><i class="lg-dot" style="background:var(--warn)"></i>cookie</span>
              <span><i class="lg-dot" style="background:var(--accent-2)"></i>attribute call</span>
              <span><i class="lg-dot" style="background:var(--orange)"></i>SAML</span>
              <span style="margin-left:auto">access &amp; refresh tokens never travel in the front channel</span>
            </div>
          </div>

          <div class="panel">
            <div class="tabs" role="tablist">
              <button class="tab active" data-tab="explain" role="tab">Explain</button>
              <button class="tab" data-tab="wire" role="tab">Wire</button>
              <button class="tab" data-tab="tokens" role="tab">Tokens <span class="tab-dot"></span></button>
              <button class="tab" data-tab="setup" role="tab">Setup</button>
              <button class="tab" data-tab="risks" role="tab">Watch out</button>
            </div>
            <div class="tab-body">
              <div class="tab-panel active" data-panel="explain"></div>
              <div class="tab-panel" data-panel="wire"></div>
              <div class="tab-panel" data-panel="tokens"></div>
              <div class="tab-panel" data-panel="setup"></div>
              <div class="tab-panel" data-panel="risks"></div>
            </div>
          </div>
        </div>

        <div class="sim-rail">
          <div class="rail-card guide-card">
            <div class="rail-head"><h3>Scenario guide</h3><span class="rail-hint">start here</span></div>
            <div class="scenario-guide">
              <p class="guide-summary">${inlineMd(s.summary)}</p>
              <div class="guide-meta">
                <span class="pill ${s.level === 'advanced' ? 'violet' : 'accent'}">${s.level === 'advanced' ? 'Advanced' : 'Core'}</span>
                <span class="pill">${this.steps.length} hops</span>
                <span class="pill">${s.minutes} min</span>
              </div>
              ${guideNote ? `<details class="guide-note"><summary>One thing to remember</summary><p>${inlineMd(guideNote)}</p></details>` : ''}
              ${guideTrap ? `<details class="guide-note"><summary>First thing to watch out for</summary><p>${inlineMd(guideTrap)}</p></details>` : ''}
              <button class="btn btn-sm" type="button" data-act="watch">${icon('alert', 13)} Open Watch out</button>
            </div>
          </div>
          <div class="rail-card">
            <div class="rail-head"><h3>Live token vault</h3><span class="rail-hint">where credentials live</span></div>
            <div class="vault" data-vault></div>
          </div>
          <div class="rail-card">
            <div class="rail-head"><h3>Steps</h3><span class="rail-hint">${this.steps.length} hops</span></div>
            <div class="steplist" data-steplist></div>
          </div>
        </div>
      </div>
    `;

    this.$stage = this.q('[data-stage]');
    this.$wires = this.q('[data-wires]');
    this.$packets = this.q('[data-packets]');
    this.$vault = this.q('[data-vault]');
    this.$steplist = this.q('[data-steplist]');
    this.$progress = this.q('[data-progress]');
    this.$counter = this.q('[data-counter]');
    this.$playLabel = this.q('[data-play-label]');
    this.$playBtn = this.q('[data-act="play"]');
    this.wireEls = new Map();

    this.renderStepList();
    this.buildConfig();
  }

  q(sel) { return this.root.querySelector(sel); }
  qa(sel) { return [...this.root.querySelectorAll(sel)]; }

  storeLabel(store) {
    return this.scenario.storeLabels?.[store] || STORES[store]?.label || store;
  }

  actorName(id) {
    if (SUBNODES[id]) return `OneGate · ${SUBNODES[id].name}`;
    return this.scenario.nodeLabels?.[id]?.name || NODES[id]?.name || id;
  }

  renderNodes() {
    const node = (id, extraClass = '') => {
      const n = NODES[id];
      const custom = this.scenario.nodeLabels?.[id] || {};
      const r = n.rect;
      return `<div class="node ${extraClass}" data-node="${id}" style="left:${pctX(r.x)}%;top:${pctY(r.y)}%;width:${(r.w / 10)}%;height:${(r.h / 6)}%">
        <div class="node-pulse"></div>
        <div class="node-icon">${icon(n.icon, 26)}</div>
        <div class="node-name">${esc(custom.name || n.name)}</div>
        <div class="node-sub">${esc(custom.sub || n.sub)}</div>
      </div>`;
    };

    const sub = (id) => {
      const sn = SUBNODES[id];
      return `<div class="subnode" data-node="${id}" style="left:${pctX(sn.x)}%;top:${pctY(sn.y)}%;width:${124 / 10}%;height:${62 / 6}%">
        <span class="sn-dot"></span>
        <span class="sn-name">${esc(sn.name)}</span>
        <span class="sn-sub">${esc(sn.sub)}</span>
      </div>`;
    };

    const og = NODES.onegate.rect;
    return `
      ${node('user')}
      ${node('idp')}
      ${node('frontend')}
      ${node('sp')}
      ${node('backend')}
      ${node('attr')}
      <div class="og-box" data-node="onegate" style="left:${pctX(og.x)}%;top:${pctY(og.y)}%;width:${og.w / 10}%;height:${og.h / 6}%">
        <div class="og-title">${esc(this.scenario.nodeLabels?.onegate?.name || 'OneGate')} <span>${esc(this.scenario.nodeLabels?.onegate?.sub || 'proxy · OP · RP · BFF · token handler')}</span></div>
        ${Object.keys(SUBNODES).map(sub).join('')}
        <div class="og-foot">session store · signing keys · attribute cache</div>
      </div>
    `;
  }

  renderStepList() {
    this.$steplist.innerHTML = this.steps.map((st, i) => {
      const from = this.actorName(st.from), to = this.actorName(st.to);
      return `<button class="step-item" data-step="${i}" title="${esc(from)} → ${esc(to)}">
        <span class="si-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="si-main">
          <span class="si-label">${esc(st.badge || st.detail.slice(0, 40) + '…')}</span>
          <span class="si-hop">${esc(from)} → ${esc(to)}</span>
        </span>
      </button>`;
    }).join('');
  }

  buildConfig() {
    const s = this.scenario;
    const cfgHtml = (s.config || []).map((c) => `
      <div class="config-card">
        <h5>${esc(c.title)}</h5>
        <ul>${c.items.map((i) => `<li>${inlineMd(i)}</li>`).join('')}</ul>
      </div>`).join('');
    this.q('[data-panel="setup"]').innerHTML = `
      <p class="dim" style="font-size:.78rem;margin-top:0">${esc(s.configNote || 'Menu paths follow the OneGate Administration Manual. Labels can differ slightly between versions.')}</p>
      ${cfgHtml || '<p class="muted">No configuration notes for this scenario.</p>'}
      ${(s.notes || []).length ? `<h4 style="font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:1.2rem 0 .5rem">Design notes</h4>
        <ul class="prose" style="font-size:.82rem;padding-left:1.1rem">${s.notes.map((n) => `<li>${inlineMd(n)}</li>`).join('')}</ul>` : ''}
    `;

  }

  renderRisks(step) {
    const s = this.scenario;
    const ch = step.channel || 'front';
    const checks = s.id === 'openid-federation' && ch === 'back'
      ? ['Fetch only from an allow-listed entity host over HTTPS; set timeouts and response-size limits.', 'Validate `typ`, `alg`/`kid`, signature, `iss`/`sub` linkage, key binding and `iat`/`exp`.', 'Do not follow arbitrary `authority_hints` from an untrusted request.']
      : s.id === 'openid-federation' && ch === 'internal'
        ? ['Validate the complete chain to the pinned Trust Anchor, not just the leaf signature.', 'Apply metadata policy, then check the resolved `redirect_uris` and client authentication method.', 'Cache only until the earliest `exp`; re-resolve after key rollover.']
        : channelChecks(step);
    const production = [
      'Every redirect URI is registered exactly, or inside a deliberately narrow prefix whitelist.',
      'Issuer, audience and token type are checked by every consumer.',
      'Secrets and refresh tokens stay server-side; nothing sensitive is logged.',
      'Where sessions exist, logout ends the local session, the OP/partner session and downstream sessions.',
      'Failure paths are tested: timeout, bad signature, unknown user, expired token.',
      ...(s.productionChecks || []),
    ];
    this.q('[data-panel="risks"]').innerHTML = `
      <div class="callout"><strong>Read this after the animation.</strong> Start with the current hop, then check the traps and the production list.</div>
      <div class="watch-block">
        <h5>Troubleshooting this hop</h5>
        <p class="watch-hop">${esc(this.actorName(step.from))} → ${esc(this.actorName(step.to))} <span class="pill">${esc(CHANNELS[ch])}</span></p>
        <ul class="checklist">${checks.map((c) => `<li>${inlineMd(c)}</li>`).join('')}</ul>
      </div>
      <div class="watch-block">
        <h5>Common traps in this flow</h5>
        ${(s.pitfalls || []).map((p) => `<div class="callout danger">${inlineMd(p)}</div>`).join('') || '<p class="muted">Nothing specific.</p>'}
      </div>
      <div class="watch-block">
        <h5>Before production</h5>
        <ul class="checklist">${production.map((c) => `<li>${inlineMd(c)}</li>`).join('')}</ul>
      </div>
    `;
  }

  /* --------------------------------------------------------------- controls */

  bind() {
    this.root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'play') this.togglePlay();
        if (a === 'next') { this.playing = false; this.go(this.index + 1, true); }
        if (a === 'prev') { this.playing = false; this.go(this.index - 1, true); }
        if (a === 'reset') { this.playing = false; this.go(0, false, true); }
        if (a === 'replay') { this.playing = true; this.go(0, true); }
        if (a === 'watch') { this.setTab('risks'); }
        return;
      }
      const step = e.target.closest('[data-step]');
      if (step) { this.playing = false; this.go(Number(step.dataset.step), true); return; }

      const tab = e.target.closest('[data-tab]');
      if (tab) { this.setTab(tab.dataset.tab); return; }

      const chip = e.target.closest('[data-token-store]');
      if (chip) { this.selectToken(chip.dataset.tokenStore, chip.dataset.tokenId); return; }

      const modeBtn = e.target.closest('[data-mode]');
      if (modeBtn && modeBtn.dataset.mode !== this.mode) {
        this.mode = modeBtn.dataset.mode;
        this.steps = this.pickSteps();
        this.usedActors = this.computeUsedActors();
        this.journey = this.computeJourney();
        this.playing = false;
        // Root listeners stay attached; build() only replaces the inner markup.
        this.build();
        this.go(0, false, true);
        return;
      }

      const tokBtn = e.target.closest('[data-inspect]');
      if (tokBtn) {
        this.selectedToken = { store: tokBtn.dataset.inspect, id: tokBtn.dataset.id };
        this.setTab('tokens');
        this.renderTokenPanel();
      }
    });

    this.root.addEventListener('change', (e) => {
      if (e.target.matches('[data-speed]')) this.speed = Number(e.target.value);
    });

    this.onKey = (e) => {
      if (!document.body.contains(this.root)) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') { e.preventDefault(); this.togglePlay(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.playing = false; this.go(this.index + 1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.playing = false; this.go(this.index - 1, true); }
      else if (e.key.toLowerCase() === 'r') { this.playing = false; this.go(0, false, true); }
    };
    document.addEventListener('keydown', this.onKey);
  }

  togglePlay() {
    if (this.playing) {
      this.playing = false;
      this.clearTimers();
      this.updatePlayButton();
      return;
    }
    const atStart = this.index <= 0;
    this.playing = true;
    this.updatePlayButton();
    if (this.index >= this.steps.length - 1) this.index = -1;
    this.go(atStart ? 0 : this.index + 1, true);
  }

  updatePlayButton() {
    if (!this.$playBtn) return;
    this.$playBtn.innerHTML = this.playing ? `${icon('pause', 14)}<span data-play-label>Pause</span>` : `${icon('play', 14)}<span data-play-label>Play</span>`;
    this.$playLabel = this.q('[data-play-label]');
  }

  clearTimers() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.raf = null;
    this.timer = null;
  }

  destroy() {
    this.clearTimers();
    document.removeEventListener('keydown', this.onKey);
  }

  /* ------------------------------------------------------------- rendering */

  go(target, animate = true, reset = false) {
    const i = Math.max(0, Math.min(this.steps.length - 1, target));
    this.clearTimers();
    if (reset) this.index = 0;
    else this.index = i;
    this.updatePlayButton();
    const step = this.steps[this.index];

    this.updateVault(this.index);
    this.updateNodes(step);
    this.updateStepList();
    this.updateProgress();
    this.renderPanels(step);
    this.renderWire(step, animate);

    if (this.playing) {
      const dwell = (this.animating ? 1500 / this.speed : 0) + 900 / this.speed;
      this.timer = setTimeout(() => {
        if (!this.playing) return;
        if (this.index >= this.steps.length - 1) {
          this.playing = false;
          this.updatePlayButton();
          return;
        }
        this.go(this.index + 1, true);
      }, dwell);
    }
  }

  updateProgress() {
    const p = ((this.index + 1) / this.steps.length) * 100;
    this.$progress.style.width = `${p}%`;
    this.$counter.textContent = `${this.index + 1} / ${this.steps.length}`;
    this.qa('[data-act="prev"]').forEach((b) => (b.disabled = this.index === 0));
    this.qa('[data-act="next"]').forEach((b) => (b.disabled = this.index === this.steps.length - 1));
  }

  updateStepList() {
    this.qa('[data-step]').forEach((el) => {
      const i = Number(el.dataset.step);
      el.classList.toggle('active', i === this.index);
      el.classList.toggle('done', i < this.index);
    });
    const active = this.$steplist.querySelector('.step-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  updateNodes(step) {
    const active = new Set([step.from, step.to]);
    if (step.channel === 'internal' && step.from === step.to) active.add(step.from);
    const ogActive = [...active].some((a) => a.startsWith('og.'));
    this.qa('[data-node]').forEach((el) => {
      const id = el.dataset.node;
      const isActive = active.has(id) || (id === 'onegate' && ogActive);
      const isTarget = step.to === id;
      el.classList.toggle('is-active', isActive);
      el.classList.toggle('is-target', isTarget && isActive);
      if (!el.classList.contains('og-box')) {
        el.classList.toggle('is-idle', !this.usedActors.has(id));
      }
    });
  }

  updateVault(upto) {
    const prev = this.vault;
    this.vault = this.recomputeVault(upto);
    const newKeys = new Set();
    for (const [store, items] of this.vault) {
      const old = prev.get(store);
      for (const id of items.keys()) if (!old || !old.has(id)) newKeys.add(`${store}:${id}`);
    }
    this.renderVault(newKeys);
  }

  renderVault(newKeys) {
    const focus = this.steps[this.index]?.vault?.map((o) => o.store) || [];
    const stores = STORE_ORDER.filter((st) => {
      if (st === 'browser' || st === 'onegate') return true;
      return this.vault.get(st)?.size > 0 || (this.scenario.nodes || []).includes(st);
    });
    this.$vault.innerHTML = stores.map((st) => {
      const items = this.vault.get(st) || new Map();
      const list = [...items.values()];
      const chips = list.length
        ? list.map((it) => {
            const k = KINDS[it.kind] || KINDS.opaque;
            const isNew = newKeys.has(`${st}:${it.id}`);
            return `<button class="vchip ${k.cls}" data-token-store="${st}" data-token-id="${it.id}"
              title="${esc(it.name)} — ${esc(it.meta || '')}" style="${isNew ? '' : 'animation:none'}">
              <span class="vc-dot"></span>${esc(k.chip)}${it.secret ? ' 🔒' : ''}</button>`;
          }).join('')
        : '<span class="vault-empty">empty</span>';
      return `<div class="vault-store ${focus.includes(st) ? 'is-focus' : ''} ${list.length ? '' : 'is-empty'}" data-store="${st}">
        <div class="vs-head">${icon(STORE_ICONS[st] || 'server', 13)}<span>${esc(this.storeLabel(st))}</span><span class="vs-count">${list.length}</span></div>
        <div class="vault-items">${chips}</div>
      </div>`;
    }).join('');
  }

  renderWire(step, animate) {
    // fade everything, then bring the current hop to the front
    for (const p of this.wireEls.values()) p.classList.remove('is-active');
    const key = `${step.from}->${step.to}`;
    let path = this.wireEls.get(key);
    if (!path) {
      const ns = 'http://www.w3.org/2000/svg';
      path = document.createElementNS(ns, 'path');
      path.setAttribute('d', pathFor(step.from, step.to).d);
      path.setAttribute('class', 'wire');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      this.$wires.appendChild(path);
      this.wireEls.set(key, path);
    }
    for (const p of this.wireEls.values()) if (p !== path) p.classList.add('is-done');
    path.classList.remove('is-done');
    path.classList.add('is-active');
    if (step.channel) path.classList.add(`ch-${step.channel}`);
    // move to top of the SVG paint order
    this.$wires.appendChild(path);

    this.animating = false;
    const isSelf = step.from === step.to;
    if (!animate || isSelf) {
      if (isSelf && step.from) this.pulseSelf(step.from, step.badge);
      return;
    }
    this.animating = true;
    this.animatePacket(path, step);
  }

  animatePacket(path, step) {
    const reduced = prefersReducedMotion();
    const dur = reduced ? 0 : 1550 / this.speed;
    const total = path.getTotalLength();
    const packet = document.createElement('div');
    packet.className = `packet ch-${step.channel || 'front'}`;
    packet.innerHTML = `<span class="pk-dot"></span>${esc(step.badge || '')}`;
    this.$packets.appendChild(packet);

    if (!dur) {
      const pt = path.getPointAtLength(total);
      packet.style.left = `${pctX(pt.x)}%`;
      packet.style.top = `${pctY(pt.y)}%`;
      this.ripple(pt.x, pt.y, step.channel);
      setTimeout(() => packet.remove(), 400);
      this.animating = false;
      return;
    }

    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const pt = path.getPointAtLength(total * easeInOut(p));
      packet.style.left = `${pctX(pt.x)}%`;
      packet.style.top = `${pctY(pt.y)}%`;
      if (p < 1) {
        this.raf = requestAnimationFrame(tick);
      } else {
        this.ripple(pt.x, pt.y, step.channel);
        setTimeout(() => packet.remove(), 320);
        this.animating = false;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  pulseSelf(nodeId, label) {
    const el = this.root.querySelector(`[data-node="${nodeId}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const stage = this.$stage.getBoundingClientRect();
    const chip = document.createElement('div');
    chip.className = 'packet ch-internal';
    chip.style.left = `${((r.left - stage.left + r.width / 2) / stage.width) * 100}%`;
    chip.style.top = `${((r.top - stage.top + r.height / 2) / stage.height) * 100}%`;
    chip.innerHTML = `<span class="pk-dot"></span>${esc(label || 'processing')}`;
    this.$packets.appendChild(chip);
    setTimeout(() => chip.remove(), 1200);
  }

  ripple(x, y, channel) {
    const el = document.createElement('div');
    el.className = `ripple ch-${channel || 'front'}`;
    el.style.left = `${pctX(x)}%`;
    el.style.top = `${pctY(y)}%`;
    this.$packets.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ---------------------------------------------------------------- panels */

  setTab(name) {
    this.tab = name;
    this.qa('[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    this.qa('[data-panel]').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
    if (name === 'tokens') this.renderTokenPanel();
  }

  /** Jump straight to a credential from the live vault. */
  selectToken(store, id) {
    this.selectedToken = { store, id };
    this.setTab('tokens');
  }

  renderPanels(step) {
    this.renderExplain(step);
    this.renderWirePanel(step);
    this.renderTokenPanel();
    this.renderRisks(step);
    this.qa('[data-panel]').forEach((p) => p.classList.toggle('active', p.dataset.panel === this.tab));
    this.qa('[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === this.tab));
  }

  renderExplain(step) {
    const from = this.actorName(step.from), to = this.actorName(step.to);
    const ch = CHANNELS[step.channel || 'front'];
    const done = this.index === this.steps.length - 1;
    const tags = (step.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    const journey = this.journeyTable();

    this.q('[data-panel="explain"]').innerHTML = `
      <div class="explain-step">
        <div class="explain-badge">
          <span class="eb-num">${String(this.index + 1).padStart(2, '0')}</span>
          <span class="eb-line"></span>
        </div>
        <div class="explain-body">
          <h4>${esc(step.badge || 'Step')}</h4>
          <div class="hop">
            <span>${esc(from)}</span><span class="arrow">→</span><span>${esc(to)}</span>
            <span class="pill">${esc(ch)}</span>
          </div>
          <div class="detail">${md(step.detail || '')}</div>
          <div class="channel-rule"><span class="cr-label">What to notice</span>${inlineMd(channelRule(step))}</div>
          ${tags ? `<div class="tag-row">${tags}</div>` : ''}
        </div>
      </div>
      ${done ? `<div class="complete-banner">${icon('check', 18)}<span><strong>Flow complete.</strong> Replay it from the top, or open the Tokens tab to inspect what was left behind.</span>
        <button class="btn btn-sm" data-act="replay">Replay</button></div>` : ''}
      <details style="margin-top:1rem">
        <summary style="cursor:pointer;font-size:.78rem;color:var(--muted)">Token journey in this scenario (issued → stored → gone)</summary>
        <div style="margin-top:.6rem">${journey}</div>
      </details>
    `;
  }

  journeyTable() {
    if (!this.journey.length) return '<p class="dim" style="font-size:.78rem">This scenario has no stateful tokens.</p>';
    const rows = this.journey.map((g) => {
      const k = KINDS[g.kind] || KINDS.opaque;
      const first = g.first ? (g.first.step < 0 ? 'at start' : `step ${g.first.step + 1} · ${this.storeLabel(g.first.store)}`) : '—';
      const stores = g.stores.map((s) => this.storeLabel(s)).join(' → ') || '—';
      const last = g.last
        ? g.last.removed ? `removed at step ${g.last.step + 1}` : 'still present at the end'
        : '—';
      return `<tr>
        <td><span class="vchip ${k.cls}" style="animation:none;cursor:default"><span class="vc-dot"></span>${esc(k.chip)}</span><br><span style="font-size:.72rem">${esc(g.name || '')}</span></td>
        <td>${esc(first)}</td>
        <td class="mono">${esc(stores)}</td>
        <td>${esc(last)}</td>
      </tr>`;
    }).join('');
    return `<table class="journey-table">
      <thead><tr><th>Token / credential</th><th>Appears</th><th>Lives in</th><th>Ends</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  renderWirePanel(step) {
    const http = step.http;
    let html = '';
    if (http?.req) html += `<p class="code-label">Request</p><pre class="code-block">${highlightHttp(esc(http.req))}</pre>`;
    if (http?.res) html += `<p class="code-label">Response</p><pre class="code-block">${highlightHttp(esc(http.res))}</pre>`;
    if (!html) {
      html = `<div class="callout"><strong>No HTTP on this hop.</strong> ${
        step.channel === 'internal'
          ? 'This is processing inside OneGate — a policy check, a lookup, a decision.'
          : 'This transfer is shown conceptually; not every hop has a request/response pair worth showing.'
      }</div>`;
    }
    html += `<p class="dim" style="font-size:.72rem;margin:.2rem 0 0">Values and paths are illustrative. Tokens are truncated; inspect them in the Tokens tab.</p>`;
    this.q('[data-panel="wire"]').innerHTML = html;
  }

  renderTokenPanel() {
    const all = [];
    for (const [store, items] of this.vault) for (const it of items.values()) all.push({ store, it });
    if (!all.length) {
      this.q('[data-panel="tokens"]').innerHTML = '<p class="muted">No credentials exist at this point in the flow — which is often exactly the point.</p>';
      return;
    }
    if (!this.selectedToken || !all.some((x) => x.store === this.selectedToken.store && x.it.id === this.selectedToken.id)) {
      this.selectedToken = { store: all[0].store, id: all[0].it.id };
    }
    const sel = all.find((x) => x.store === this.selectedToken.store && x.it.id === this.selectedToken.id);
    const list = all.map(({ store, it }) => {
      const k = KINDS[it.kind] || KINDS.opaque;
      const active = store === this.selectedToken.store && it.id === this.selectedToken.id;
      return `<button data-inspect="${store}" data-id="${it.id}" class="${active ? 'active' : ''}">
        <span class="ts-store">${esc(this.storeLabel(store))}</span>${esc(it.name)}
      </button>`;
    }).join('');

    this.q('[data-panel="tokens"]').innerHTML = `
      <div class="token-layout">
        <div>
          ${this.inspect(sel.it)}
        </div>
        <div class="token-select">${list}</div>
      </div>
    `;
  }

  inspect(item) {
    const k = KINDS[item.kind] || KINDS.opaque;
    const head = `<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem">
        <span class="vchip ${k.cls}" style="animation:none;cursor:default"><span class="vc-dot"></span>${esc(k.chip)}</span>
        <strong style="font-size:.85rem">${esc(item.name)}</strong>
        <span class="dim" style="font-size:.72rem">${esc(item.meta || '')}</span>
      </div>`;

    if (item.kind === 'jwt' || item.kind === 'id' || item.kind === 'statement') {
      const d = decodeJwt(item.value);
      const [h, p, s] = item.value.split('.');
      const raw = `<div class="jwt-raw"><b>${esc(h)}</b>.<i>${esc(p)}</i>.<u>${esc(s)}</u></div>`;
      const claimRows = Object.entries(d?.payload || {}).map(([key, val]) => {
        const isTime = key === 'exp' || key === 'iat' || key === 'nbf' || key === 'auth_time';
        const rendered = typeof val === 'object' ? esc(JSON.stringify(val)) : esc(String(val));
        return `<dt>${esc(key)}</dt><dd>${rendered}${isTime ? ` <span class="dim" style="font-size:.7rem">(${esc(relTime(val))})</span>` : ''}</dd>`;
      }).join('');
      return `${head}${raw}
        <div class="jwt-part"><div class="jp-label"><span>Header</span><span>base64url → JSON</span></div>
          <pre class="code-block" style="margin:.2rem 0 0">${esc(JSON.stringify(d?.header || {}, null, 2))}</pre></div>
        <div class="jwt-part"><div class="jp-label"><span>Payload</span><span>${Object.keys(d?.payload || {}).length} claims</span></div>
          <pre class="code-block" style="margin:.2rem 0 0">${esc(JSON.stringify(d?.payload || {}, null, 2))}</pre></div>
        <dl class="kv" style="margin-top:.4rem">${claimRows}</dl>
        <div class="callout" style="margin-top:.7rem"><strong>Signature is not verified here.</strong> ${item.kind === 'statement' ? 'A federation statement is trusted only after the complete trust chain, key binding and metadata policy validate.' : 'In a real system the API verifies it with the issuer\'s public key (JWKS).'} These values are simulated for teaching, not valid credentials.</div>`;
    }

    if (item.kind === 'saml') {
      return `${head}<pre class="code-block" style="max-height:340px">${esc(item.value)}</pre>
        <div class="callout"><strong>Signed XML.</strong> The signature covers the assertion (and/or the response). Validation also checks Audience, Destination, NotBefore/NotOnOrAfter and replay.</div>`;
    }

    if (item.kind === 'jwk' || item.kind === 'claims') {
      return `${head}<pre class="code-block">${esc(item.value)}</pre>`;
    }

    if (item.kind === 'opaque') {
      return `${head}
        <div class="jwt-raw" style="color:var(--text-soft)">${esc(item.value)}</div>
        <div class="callout"><strong>Opaque means unreadable.</strong> There are no claims to decode. If the deployment provides introspection, the API must call that endpoint to learn <code>active</code>, <code>scope</code>, <code>sub</code> and <code>aud</code>. That is why revocation can be instant and why every uncached check costs a round trip.</div>`;
    }

    if (item.kind === 'cookie') {
      const [name, ...rest] = String(item.value).split('=');
      const flags = String(item.meta || 'HttpOnly · Secure · SameSite=Lax').replace(/ · /g, '; ');
      const path = item.cookiePath || '/';
      return `${head}
        <p class="code-label">Set-Cookie</p>
        <pre class="code-block">${esc(name)}=${esc(preview(rest.join('='), 42))}
${esc(flags)}; Path=${esc(path)}</pre>
        <div class="callout"><strong>A cookie is not a token.</strong> It is an opaque pointer to a server-side session. Nothing can be learned from its value, and JavaScript cannot read it. Cookie names, flags and paths here are illustrative.</div>`;
    }

    return `${head}
      <div class="jwt-raw" style="color:var(--text-soft)">${esc(preview(item.value, 120))}</div>
      <div class="callout">${esc(explainKind(item.kind))}</div>`;
  }
}

function explainKind(kind) {
  const map = {
    rt: 'A refresh token is a long-lived credential. It is never sent to APIs and should be rotated on every use where rotation is enabled. It lives only on a server.',
    code: 'An authorization code is one-time and short-lived. In a code flow the browser carries it for exactly one hop, then the server exchanges it.',
    session: 'A server-side session has no readable value. The client only holds a pointer (a cookie) to it.',
    csrf: 'A CSRF token is not an authentication credential. It proves the request came from your own page, not from another site.',
    secret: 'A client secret authenticates an application to the token endpoint. It must never reach a browser, a log or a repository.',
  };
  return map[kind] || 'Simulated credential.';
}

function inlineMd(text) {
  const html = md(text);
  return html.replace(/^<p>/, '').replace(/<\/p>$/, '');
}

function channelRule(step) {
  const ch = step.channel || 'front';
  const rules = {
    front: 'Front-channel data is visible to the browser. Codes, `state`, `nonce` and cookies belong here; access tokens, refresh tokens and secrets do not.',
    back: 'Back-channel traffic is server-to-server. Client secrets and tokens may travel here, but never through the browser.',
    cookie: 'The browser sends this automatically. Treat it as a credential: `HttpOnly`, `Secure`, `SameSite`, and the narrowest possible `Path`.',
    attr: 'This is an attribute lookup, not a login. The response is cached and becomes claims, headers or an authorisation decision.',
    internal: 'This happens inside the entity shown as the source — no network request leaves it. For OneGate, check configuration, the selected virtual host and logs; for an RP/OP, check local trust-chain, policy and cache state.',
    saml: 'SAML is signed XML carried through the browser. Validate the signature, `Audience`, `Destination`, time conditions and replay.',
  };
  return rules[ch] || rules.front;
}

function channelChecks(step) {
  const ch = step.channel || 'front';
  if (ch === 'back') return [
    'Client authentication: `client_secret_basic`, `private_key_jwt`, certificate — match what the server expects.',
    'Issuer, audience, signature and `exp`/`nbf` on the returned token.',
    'Clock skew, rotated keys and stale JWKS caches.',
  ];
  if (ch === 'cookie') return [
    '`Set-Cookie` flags: `HttpOnly`, `Secure`, `SameSite`, `Domain`, `Path`.',
    'Was the cookie set on the host the SPA actually calls?',
    'Is the session still alive server-side, or only the browser cookie?',
  ];
  if (ch === 'attr') return [
    'API URL, request method, timeout, TLS trust and `Skip SSL Check`.',
    '`realm`, `subject`, `actor`, `requested_attributes` and `ext` match the source contract.',
    '`Valid time`, cache key, and whether a failed lookup fails open or closed.',
  ];
  if (ch === 'internal') return [
    'Which component is doing the work? Check its own logs and configuration, not only the final error page.',
    'OneGate: confirm the **Virtual Host Selector**, then **Activate Changes → Reload configuration** (and **Reindex files** for file changes).',
    'RP/OP: check the local session, trust-chain cache, policy result and clock.',
  ];
  if (ch === 'saml') return [
    'Signature: assertion, response, or both — whichever the SP validates.',
    '`Audience`, `Destination`, `NotBefore`/`NotOnOrAfter`, `InResponseTo` and clock skew.',
    'Certificate rollover and replay cache.',
  ];
  return [
    'Is the browser hitting the expected host and path? Check DNS, reverse proxy and the selected virtual host.',
    'For a login redirect: `redirect_uri` whitelist, `state`, `nonce` and the stored transaction.',
    'Browser cookies and the `SameSite`/`Secure` rules on the callback.',
  ];
}

function highlightHttp(html) {
  // Colour the first line (status/request line), header names and JSON keys.
  // The input is already HTML-escaped, so quotes arrive as &quot;.
  return html
    .replace(/^([^\n]+)/, '<span class="hl">$1</span>')
    .replace(/^([A-Za-z0-9-]+):/gm, '<span class="hl2">$1</span>:')
    .replace(/&quot;([^&\n]+)&quot;:/g, '<span class="hl3">&quot;$1&quot;</span>:');
}
