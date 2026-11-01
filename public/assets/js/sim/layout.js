/* Fixed topology library for the simulator.
   All coordinates live in a 1000 × 600 virtual canvas. The stage keeps the same
   aspect ratio, so HTML nodes (positioned with %) and SVG wires stay aligned.

   A scenario selects a layout with `layout: 'onegate' | 'docker' | 'git'`.
   Layouts may contain flat nodes and one or more groups with subnodes. */

export const STAGE = { w: 1000, h: 600 };

/* ---------------------------------------------------------------- OneGate */

export const NODES = {
  user: {
    name: 'Browser', sub: 'end user · user agent', icon: 'browser',
    rect: { x: 92, y: 300, w: 164, h: 126 },
  },
  frontend: {
    name: 'Frontend server', sub: 'web app · SPA host', icon: 'server',
    rect: { x: 878, y: 168, w: 176, h: 112 },
  },
  sp: {
    name: 'Partner SP', sub: 'external app / SP', icon: 'layers',
    rect: { x: 878, y: 302, w: 176, h: 96 },
  },
  backend: {
    name: 'Backend API', sub: 'resource server', icon: 'database',
    rect: { x: 878, y: 442, w: 176, h: 112 },
  },
  idp: {
    name: 'Partner IdP', sub: 'external OP / SAML IdP', icon: 'cloud',
    rect: { x: 500, y: 58, w: 236, h: 84 },
  },
  attr: {
    name: 'Attribute source', sub: 'LDAP · REST · Graph', icon: 'sparkle',
    rect: { x: 500, y: 552, w: 248, h: 82 },
  },
  onegate: {
    name: 'OneGate', sub: 'reverse proxy · OP · RP · BFF', icon: 'gate',
    rect: { x: 500, y: 300, w: 408, h: 334 },
    container: true,
  },
};

export const SUBNODES = {
  'og.op':    { name: 'OIDC OP', sub: 'local provider', x: 372, y: 218 },
  'og.rp':    { name: 'OIDC RP', sub: 'federation · BFF', x: 500, y: 218 },
  'og.bff':   { name: 'BFF', sub: 'cookie + proxy', x: 628, y: 218 },
  'og.proxy': { name: 'Proxy', sub: 'reverse proxy · SSO', x: 372, y: 332 },
  'og.token': { name: 'Token handler', sub: 'issue · exchange', x: 500, y: 332 },
  'og.attr':  { name: 'Attribute client', sub: 'LDAP · REST · Graph', x: 628, y: 332 },
};

export const SUBNODE_SIZE = { w: 124, h: 62 };

/* ----------------------------------------------------------------- Docker */

export const DOCKER_NODES = {
  developer: {
    name: 'Developer', sub: 'terminal · editor', icon: 'terminal',
    rect: { x: 100, y: 300, w: 176, h: 122 },
  },
  project: {
    name: 'Project files', sub: 'Dockerfile · .dockerignore', icon: 'book',
    rect: { x: 336, y: 112, w: 220, h: 112 },
  },
  daemon: {
    name: 'Docker Engine', sub: 'build · run · manage', icon: 'server',
    rect: { x: 520, y: 300, w: 220, h: 174 },
  },
  registry: {
    name: 'GHCR', sub: 'container registry', icon: 'cloud',
    rect: { x: 822, y: 112, w: 190, h: 106 },
  },
  container: {
    name: 'Container', sub: 'isolated process', icon: 'box',
    rect: { x: 810, y: 302, w: 190, h: 118 },
  },
  volume: {
    name: 'Volume', sub: 'persistent data', icon: 'database',
    rect: { x: 556, y: 520, w: 180, h: 92 },
  },
  network: {
    name: 'Bridge network', sub: 'DNS · ports', icon: 'network',
    rect: { x: 792, y: 520, w: 190, h: 92 },
  },
  watchtower: {
    name: 'Watchtower', sub: 'pull · recreate', icon: 'clock',
    rect: { x: 316, y: 512, w: 190, h: 96 },
  },
  deployment: {
    name: 'Deployment host', sub: 'pull · run · verify', icon: 'server',
    rect: { x: 100, y: 512, w: 170, h: 96 },
  },
};

/* -------------------------------------------------------------------- Git */

export const GIT_NODES = {
  developer: {
    name: 'Developer shell', sub: 'git CLI · editor', icon: 'terminal',
    rect: { x: 100, y: 108, w: 184, h: 100 },
  },
  working: {
    name: 'Working tree', sub: 'files you edit', icon: 'book',
    rect: { x: 100, y: 300, w: 184, h: 122 },
  },
  index: {
    name: 'Staging area', sub: 'git index', icon: 'layers',
    rect: { x: 330, y: 300, w: 184, h: 112 },
  },
  local: {
    name: 'Local repository', sub: '.git · commits · refs', icon: 'database',
    rect: { x: 556, y: 300, w: 190, h: 122 },
  },
  remote: {
    name: 'GitHub remote', sub: 'origin · push / pull', icon: 'cloud',
    rect: { x: 814, y: 300, w: 190, h: 122 },
  },
  actions: {
    name: 'GitHub Actions', sub: 'CI · publish', icon: 'server',
    rect: { x: 814, y: 112, w: 190, h: 106 },
  },
  ghcr: {
    name: 'GHCR image', sub: 'ghcr.io/...', icon: 'box',
    rect: { x: 814, y: 516, w: 190, h: 96 },
  },
  server: {
    name: 'Deployment host', sub: 'pull · verify', icon: 'server',
    rect: { x: 556, y: 516, w: 190, h: 96 },
  },
  reflog: {
    name: 'Reflog / backups', sub: 'recover lost work', icon: 'clock',
    rect: { x: 330, y: 516, w: 184, h: 96 },
  },
};

/* --------------------------------------------------------------- layouts */

const onegateNodes = Object.fromEntries(
  Object.entries(NODES).filter(([id]) => id !== 'onegate'),
);

export const LAYOUTS = {
  onegate: {
    id: 'onegate',
    label: 'OneGate',
    nodes: onegateNodes,
    groups: [{
      id: 'onegate',
      ...NODES.onegate,
      footer: 'session store · signing keys · attribute cache',
      subnodes: SUBNODES,
    }],
  },
  docker: {
    id: 'docker',
    label: 'Docker on Linux',
    nodes: DOCKER_NODES,
    groups: [],
  },
  git: {
    id: 'git',
    label: 'Git & GitHub',
    nodes: GIT_NODES,
    groups: [],
  },
};

export const getLayout = (name) => LAYOUTS[name] || LAYOUTS.onegate;

function groupFor(id, layout) {
  return (layout.groups || []).find((group) => group.id === id) || null;
}

/** Bounding box for any node, group, or subnode id in a layout. */
export function rectOf(id, layoutArg = 'onegate') {
  const layout = typeof layoutArg === 'string' ? getLayout(layoutArg) : layoutArg;
  if (layout.nodes?.[id]) return layout.nodes[id].rect;
  const group = groupFor(id, layout);
  if (group) return group.rect;
  for (const g of layout.groups || []) {
    if (g.subnodes?.[id]) {
      return { x: g.subnodes[id].x, y: g.subnodes[id].y, w: SUBNODE_SIZE.w, h: SUBNODE_SIZE.h };
    }
  }
  return { x: 500, y: 300, w: 100, h: 60 };
}

export function labelOf(id, layoutArg = 'onegate') {
  const layout = typeof layoutArg === 'string' ? getLayout(layoutArg) : layoutArg;
  if (layout.nodes?.[id]) return layout.nodes[id].name;
  const group = groupFor(id, layout);
  if (group) return group.name;
  for (const g of layout.groups || []) {
    if (g.subnodes?.[id]) return g.subnodes[id].name;
  }
  return id;
}

export function allActors() {
  const actors = new Set();
  for (const layout of Object.values(LAYOUTS)) {
    for (const id of Object.keys(layout.nodes || {})) actors.add(id);
    for (const group of layout.groups || []) {
      actors.add(group.id);
      for (const id of Object.keys(group.subnodes || {})) actors.add(id);
    }
  }
  return actors;
}

function edgePoint(rect, tx, ty) {
  const cx = rect.x, cy = rect.y, hw = rect.w / 2, hh = rect.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? hw / Math.abs(dx) : Infinity;
  const sy = dy ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function hashPair(a, b) {
  let h = 2166136261;
  const s = a + '>' + b;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** Build an SVG path between two actors with a gentle, deterministic bow. */
export function pathFor(from, to, layoutArg = 'onegate') {
  const a = rectOf(from, layoutArg), b = rectOf(to, layoutArg);
  const ac = { x: a.x, y: a.y }, bc = { x: b.x, y: b.y };
  const p1 = edgePoint(a, bc.x, bc.y);
  const p2 = edgePoint(b, ac.x, ac.y);
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const bend = (hashPair(from, to) % 2 === 0 ? 1 : -1) * (26 + (hashPair(from, to) % 14));
  const c1 = { x: p1.x + dx * 0.42 + nx * bend, y: p1.y + dy * 0.14 + ny * bend };
  const c2 = { x: p2.x - dx * 0.42 + nx * bend, y: p2.y - dy * 0.14 + ny * bend };
  return {
    d: `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    p1, p2,
  };
}

/** Percentage helpers for CSS positioning. */
export const pctX = (x) => (x / STAGE.w) * 100;
export const pctY = (y) => (y / STAGE.h) * 100;
