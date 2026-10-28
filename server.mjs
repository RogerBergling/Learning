#!/usr/bin/env node
/**
 * Optional Node.js launcher for the OneGate Learning Lab.
 * The primary launcher is start.py (Python stdlib); this file exists for
 * machines where Node is available but Python is not.
 *
 *   node server.mjs
 *   node server.mjs --port 8080 --no-browser
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
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
    const server = http.createServer(handle);
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

async function handle(req, res) {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  let file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = path.join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info && !path.extname(pathname)) {
    file = path.join(ROOT, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${pathname}`);
    return;
  }

  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  };
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const opts = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, opts, { detached: true, stdio: 'ignore' }).unref();
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
const url = `http://${shown}:${port}/`;

console.log('');
console.log('  OneGate Learning Lab');
console.log('  --------------------');
console.log(`  Serving : ${ROOT}`);
console.log(`  Open    : ${url}`);
console.log('  Stop    : Ctrl+C');
console.log('');

if (!flag('--no-browser')) openBrowser(url);

process.on('SIGINT', () => {
  console.log('\n  Stopped.');
  server.close(() => process.exit(0));
});
