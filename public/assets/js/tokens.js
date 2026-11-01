/* Simulated tokens.
   Nothing here is cryptographically valid — the tokens exist so the UI can show
   *what a real token contains* and where it lives during a flow. */

export const now = () => Math.floor(Date.now() / 1000);

const SIG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Deterministic pseudo-random string (same seed → same output). */
export function pseudo(seed, len) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let out = '';
  for (let i = 0; i < len; i++) {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    out += SIG_ALPHABET[h % SIG_ALPHABET.length];
  }
  return out;
}

export function b64url(input) {
  const bytes = new TextEncoder().encode(String(input));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    return {
      header: JSON.parse(fromB64url(parts[0])),
      payload: JSON.parse(fromB64url(parts[1])),
      signature: parts[2] || '',
      parts,
    };
  } catch {
    return null;
  }
}

/** Build a fake but structurally valid JWT. */
export function mockJwt(payload, header = { alg: 'RS256', typ: 'JWT', kid: 'og-sig-2026-07' }, seed = 'onegate') {
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.${pseudo(seed + JSON.stringify(payload).slice(0, 40), 342)}`;
}

export const KINDS = {
  jwt:    { label: 'Access token (JWT)',      chip: 'AT·jwt',   cls: 'k-jwt' },
  opaque: { label: 'Access token (opaque)',   chip: 'AT·opaque', cls: 'k-opaque' },
  id:     { label: 'ID token',                chip: 'id_token', cls: 'k-id' },
  rt:     { label: 'Refresh token',           chip: 'RT',       cls: 'k-rt' },
  code:   { label: 'Authorization code',      chip: 'code',     cls: 'k-code' },
  cookie: { label: 'Cookie',                  chip: 'cookie',   cls: 'k-cookie' },
  session:{ label: 'Server-side session',     chip: 'session',  cls: 'k-session' },
  csrf:   { label: 'CSRF token',              chip: 'csrf',     cls: 'k-csrf' },
  saml:   { label: 'SAML assertion',          chip: 'SAML',     cls: 'k-saml' },
  claims: { label: 'Claims / identity',       chip: 'claims',   cls: 'k-claims' },
  jwk:    { label: 'Public key (JWKS)',       chip: 'JWK',      cls: 'k-jwk' },
  statement: { label: 'Federation entity statement', chip: 'entity', cls: 'k-statement' },
  secret: { label: 'Client secret',           chip: 'secret',   cls: 'k-rt' },
  image:  { label: 'Container image',          chip: 'image',    cls: 'k-image' },
  container: { label: 'Container',             chip: 'container', cls: 'k-container' },
  volume: { label: 'Volume',                   chip: 'volume',   cls: 'k-volume' },
  compose: { label: 'Compose configuration',   chip: 'compose',  cls: 'k-config' },
  dockerfile: { label: 'Dockerfile',           chip: 'Dockerfile', cls: 'k-config' },
  layer:  { label: 'Image layer',              chip: 'layer',    cls: 'k-layer' },
  commit: { label: 'Git commit',               chip: 'commit',   cls: 'k-git' },
  branch: { label: 'Git branch',               chip: 'branch',   cls: 'k-git' },
  tag:    { label: 'Git tag',                  chip: 'tag',      cls: 'k-tag' },
  workflow: { label: 'GitHub Actions workflow', chip: 'workflow', cls: 'k-workflow' },
  network: { label: 'Container network',         chip: 'network',  cls: 'k-network' },
  file:   { label: 'Project file',               chip: 'file',     cls: 'k-config' },
};

export const STORES = {
  browser:  { label: 'Browser / user agent', hint: 'anything here is reachable by JavaScript or the user' },
  onegate:  { label: 'OneGate session store', hint: 'server-side: sessions, codes, tokens, attribute cache' },
  frontend: { label: 'Frontend / web server', hint: 'server-side session of the web tier' },
  backend:  { label: 'Backend / API',        hint: 'validated claims only — usually no raw token is kept' },
  idp:      { label: 'Partner IdP / trust anchor', hint: 'external OP, SAML IdP, or OpenID Federation trust anchor' },
  sp:       { label: 'Partner SP / app',     hint: 'the external service provider' },
  attr:     { label: 'Attribute source',     hint: 'the user attribute / entitlement service' },
  local:    { label: 'Local machine',        hint: 'working tree, CLI context, shell environment and local files' },
  docker:   { label: 'Docker Engine',        hint: 'images, layers, build cache and daemon state' },
  container:{ label: 'Running container',    hint: 'the isolated process, its filesystem and environment' },
  volume:   { label: 'Docker volume',         hint: 'persistent data managed by Docker' },
  network:  { label: 'Container network',     hint: 'bridge or user-defined network' },
  gitrepo:  { label: 'Git repository',       hint: 'index, commits, refs and reflog' },
  gitremote:{ label: 'Git remote',           hint: 'origin and upstream refs on GitHub' },
  reflog:   { label: 'Reflog & backups',     hint: 'local recovery refs, patches and stashes' },
  github:   { label: 'GitHub / Actions',     hint: 'repository metadata, workflow runs and package access' },
  registry: { label: 'Container registry',   hint: 'GHCR tags, digests and package visibility' },
  deployment: { label: 'Deployment host',    hint: 'the machine or platform that pulls and runs the image' },
};

/** Turn a scenario token definition into a concrete, displayable token. */
export function materialize(item, ctx = {}) {
  const t = ctx.now ?? now();
  const iss = ctx.iss || 'https://login.example.com/mg-local/portal';
  const aud = ctx.aud || 'api.orders';
  const sub = ctx.sub || 'a1b2c3d4-7f31-4a1e-9d2c-55e0f1a2b3c4';
  const clientId = ctx.clientId || 'portal-spa';
  const scope = ctx.scope || 'openid profile orders.read';
  const sid = ctx.sid || pseudo('sid' + sub, 24);
  const seed = `${ctx.scenarioId || 'og'}:${item.id}:${item.kind}`;
  const out = { ...item, kind: item.kind || 'opaque' };

  if (item.value) return out; // explicit value (e.g. SAML XML, plain text)

  switch (out.kind) {
    case 'jwt':
      out.value = mockJwt({
        iss, sub, aud,
        client_id: clientId,
        scope,
        exp: t + (item.ttl ?? 900),
        iat: t,
        jti: pseudo(seed + 'jti', 22),
        typ: 'at+jwt',
        ...(item.claims || {}),
      }, { alg: 'RS256', typ: 'at+jwt', kid: 'og-sig-2026-07' }, seed);
      break;
    case 'id':
      out.value = mockJwt({
        iss, sub, aud: clientId,
        exp: t + (item.ttl ?? 900),
        iat: t,
        auth_time: t - 12,
        nonce: pseudo(seed + 'nonce', 22),
        sid,
        preferred_username: 'roger.lind',
        name: 'Roger Lind',
        given_name: 'Roger',
        family_name: 'Lind',
        email: 'roger.lind@example.com',
        email_verified: true,
        ...(item.claims || {}),
      }, { alg: 'RS256', typ: 'JWT', kid: 'og-sig-2026-07' }, seed);
      break;
    case 'opaque':
      out.value = 'at_' + pseudo(seed, 43);
      break;
    case 'rt':
      out.value = 'rt_' + pseudo(seed, 48);
      break;
    case 'code':
      out.value = 'ac_' + pseudo(seed, 32);
      break;
    case 'cookie': {
      const cookieName = out.cookieName || out.claims?.name || 'ONEGATE_BFF';
      out.value = `${cookieName}=${pseudo(seed, 64)}`;
      break;
    }
    case 'session':
      out.value = 'sess_' + pseudo(seed, 40);
      break;
    case 'csrf':
      out.value = pseudo(seed, 32);
      break;
    case 'secret':
      out.value = 'cs_' + pseudo(seed, 40);
      break;
    case 'jwk':
      out.value = JSON.stringify({
        keys: [
          {
            kty: 'RSA', use: 'sig', kid: 'og-sig-2026-07', alg: 'RS256',
            n: pseudo(seed + 'n', 96) + '...', e: 'AQAB',
            x5t: pseudo(seed + 'x5t', 27),
          },
        ],
      }, null, 2);
      break;
    case 'statement':
      out.value = mockJwt({
        iss: ctx.iss || 'https://op.example.com',
        sub: ctx.iss || 'https://op.example.com',
        iat: t,
        exp: t + (item.ttl ?? 3600),
        jwks: { keys: [{ kty: 'RSA', use: 'sig', kid: 'fed-key-1', alg: 'RS256', n: pseudo(seed + 'fedn', 96) + '...', e: 'AQAB' }] },
        ...(item.claims || {}),
      }, { alg: 'RS256', typ: 'entity-statement+jwt', kid: out.headerKid || 'fed-key-1' }, seed);
      break;
    case 'claims':
      out.value = JSON.stringify(item.claims || { sub, name: 'Roger Lind', scope }, null, 2);
      break;
    case 'image':
      out.value = `sha256:${pseudo(seed, 64)}`;
      break;
    case 'container':
      out.value = `ctr_${pseudo(seed, 32)}`;
      break;
    case 'volume':
      out.value = `vol_${pseudo(seed, 32)}`;
      break;
    case 'layer':
      out.value = `sha256:${pseudo(seed, 64)}`;
      break;
    case 'compose':
      out.value = item.value || 'services:\n  app:\n    image: example/app:latest\n';
      break;
    case 'dockerfile':
      out.value = item.value || 'FROM alpine:3.20\nCMD ["sh"]\n';
      break;
    case 'commit':
      out.value = pseudo(seed, 40);
      break;
    case 'branch':
      out.value = item.branch || 'main';
      break;
    case 'tag':
      out.value = item.tag || 'v1.2.0';
      break;
    case 'workflow':
      out.value = item.value || 'name: Build and publish GHCR image\non: [push]\n';
      break;
    case 'network':
      out.value = item.value || 'bridge';
      break;
    case 'file':
      out.value = item.value || '.env\n.env.*\n!.env.example\n';
      break;
    default:
      out.value = String(item.value ?? pseudo(seed, 32));
  }
  return out;
}

/** Short, readable preview of a token value. */
export function preview(value, max = 18) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/** Human description of a unixtime claim relative to now. */
export function relTime(ts) {
  if (typeof ts !== 'number') return '';
  const diff = ts - now();
  const abs = Math.abs(diff);
  const unit = abs < 120 ? `${abs}s` : abs < 7200 ? `${Math.round(abs / 60)} min` : abs < 172800 ? `${Math.round(abs / 3600)} h` : `${Math.round(abs / 86400)} d`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}
