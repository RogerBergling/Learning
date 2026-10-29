/* Fixed topology used by the simulator.
   All coordinates live in a 1000 × 600 virtual canvas. The stage keeps the same
   aspect ratio, so HTML nodes (positioned with %) and SVG wires stay aligned. */

export const STAGE = { w: 1000, h: 600 };

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

/** Bounding box for any node id (container, subnode, or plain node). */
export function rectOf(id) {
  if (SUBNODES[id]) {
    const s = SUBNODES[id];
    return { x: s.x, y: s.y, w: SUBNODE_SIZE.w, h: SUBNODE_SIZE.h };
  }
  const n = NODES[id];
  return n ? n.rect : { x: 500, y: 300, w: 100, h: 60 };
}

export function labelOf(id) {
  if (SUBNODES[id]) return SUBNODES[id].name;
  return NODES[id]?.name || id;
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
export function pathFor(from, to) {
  const a = rectOf(from), b = rectOf(to);
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
