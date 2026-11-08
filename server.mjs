#!/usr/bin/env node
/**
 * Optional Node.js launcher for the Learning Lab.
 * The primary launcher is start.py (Python stdlib); this file exists for
 * machines where Node is available but Python is not.
 *
 *   node server.mjs
 *   node server.mjs --port 8080 --no-browser
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(__dirname, 'public'));
const ROOT_REAL = await realpath(ROOT);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const NO_CACHE = 'no-store, no-cache, must-revalidate, max-age=0';

// Only these hash-router entry points may fall back to the app shell. Unknown
// extension-less paths (/.git/config, /admin, /server, ...) must stay 404s.
// Keep in sync with APP_ROUTE_PREFIXES in start.py.
const APP_ROUTE_PREFIXES = [
  '/learn',
  '/topic',
  '/sim',
  '/scenarios',
  '/compare',
  '/glossary',
  '/quiz',
  '/selftest',
];

const isAppRoute = (pathname) =>
  APP_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

// Keep these in sync with SECURITY_HEADERS in start.py.
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; '),
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const isInside = (root, file) => {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

const sendError = (res, status, message, extra = {}) => {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = `${message}\n`;
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': NO_CACHE,
    ...SECURITY_HEADERS,
    ...extra,
  });
  res.end(body);
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const host = valueOf('--host') || '127.0.0.1';
const preferred = Number(valueOf('--port')) || null;

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch(() => {
        if (!res.headersSent) sendError(res, 500, 'Internal server error');
        else res.destroy();
      });
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 5_000;
    const onError = (err) => reject(err);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve(server);
    });
  });
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') {
    // Reverse proxies commonly probe a backend with OPTIONS before sending
    // traffic. Answer with an empty 200 and the allowed methods.
    res.writeHead(200, {
      Allow: 'GET, HEAD, OPTIONS',
      'Content-Length': 0,
      'Cache-Control': NO_CACHE,
      ...SECURITY_HEADERS,
    });
    res.end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'Method not allowed', { Allow: 'GET, HEAD, OPTIONS' });
    return;
  }

  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    sendError(res, 400, 'Bad request');
    return;
  }

  let file;
  try {
    file = path.resolve(ROOT, '.' + pathname);
  } catch {
    sendError(res, 400, 'Bad request');
    return;
  }
  if (!isInside(ROOT, file)) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  let info = await stat(file).catch(() => null);
  let directory = false;
  if (info?.isDirectory()) {
    directory = true;
    file = path.join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!directory && !info && !path.extname(pathname) && isAppRoute(pathname)) {
    file = path.join(ROOT, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info || !info.isFile()) {
    sendError(res, 404, `Not found: ${pathname}`);
    return;
  }

  // Resolve symlinks and verify the real file is still inside public/.
  const real = await realpath(file).catch(() => null);
  if (!real || !isInside(ROOT_REAL, real)) {
    sendError(res, 404, `Not found: ${pathname}`);
    return;
  }

  const headers = {
    'Content-Type': MIME[path.extname(real).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': NO_CACHE,
    'X-Content-Type-Options': 'nosniff',
    ...SECURITY_HEADERS,
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = createReadStream(real);
  stream.on('error', () => {
    if (!res.headersSent) sendError(res, 500, 'Internal server error');
    else res.destroy();
  });
  stream.pipe(res);
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const opts = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, opts, { detached: true, stdio: 'ignore' });
    // xdg-open/open can be missing. An unhandled 'error' event would crash
    // the server, so browser opening is deliberately best-effort.
    child.on('error', () => {});
    child.unref();
  } catch {
    /* opening a browser is best-effort */
  }
}

let server = null;
if (preferred) server = await listen(preferred).catch(() => null);
if (!server) {
  for (let port = 8080; port < 8100 && !server; port++) {
    server = await listen(port).catch(() => null);
  }
}
if (!server) {
  console.error('No free port in 8080–8099. Pass --port with another number.');
  process.exit(1);
}

const port = server.address().port;
const shown = host === '127.0.0.1' || host === '0.0.0.0' ? 'localhost' : host;
const urlHost = shown.includes(':') ? `[${shown}]` : shown;
const url = `http://${urlHost}:${port}/`;

console.log('');
console.log('  Learning Lab');
console.log('  --------------------');
console.log(`  Serving : ${ROOT}`);
console.log(`  Open    : ${url}`);
console.log('  Stop    : Ctrl+C');
console.log('');

if (!flag('--no-browser')) openBrowser(url);

const shutdown = () => {
  console.log('\n  Stopped.');
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
