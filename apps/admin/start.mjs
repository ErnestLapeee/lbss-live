#!/usr/bin/env node
/**
 * Production admin server: static SPA + same-origin `/api` proxy.
 *
 * Why: the API sets an httpOnly `session` cookie on responses. If the browser
 * loads the admin UI from host A but calls the API on host B, mobile Safari often
 * blocks that cross-site cookie on credentialed fetches — login appears to work
 * (user from JSON) but `/admin/seasons` returns 401 and the UI shows no seasons.
 * Proxying `/api` through this host makes cookies first-party.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const httpProxy = require('http-proxy');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = parseInt(String(process.env.PORT || '4173'), 10);

function resolveUpstreamOrigin() {
  let u = (process.env.VITE_API_URL || process.env.API_URL || '').trim();
  if (!u) {
    console.error(
      '[@lbss/admin] Set API_URL (or VITE_API_URL) to your public API base, e.g. https://your-api.up.railway.app/api',
    );
    process.exit(1);
  }
  u = u.replace(/\/$/, '');
  if (!u.endsWith('/api')) u += '/api';
  return new URL(u).origin;
}

const upstreamOrigin = resolveUpstreamOrigin();

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'config.js'), 'window.__LBSS_API_URL__="";\n', 'utf8');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mime[ext] ?? 'application/octet-stream';
}

/** Resolve URL path to a file under dist; returns null if path escapes dist. */
function fileUnderDist(urlPath) {
  const pathname = decodeURIComponent((urlPath ?? '/').split('?')[0] || '/');
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const root = path.resolve(distDir);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

const proxy = httpProxy.createProxyServer({
  target: upstreamOrigin,
  changeOrigin: true,
  xfwd: true,
});

proxy.on('error', (err, req, res) => {
  console.error('[admin] API proxy error:', err.message);
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (res && typeof res.end === 'function') {
    res.end(`Bad gateway (could not reach API): ${err.message}`);
  }
});

function sendFile(req, res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      const idx = path.join(distDir, 'index.html');
      fs.stat(idx, (e2, st2) => {
        if (e2 || !st2.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Not found');
        }
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': st2.size });
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(idx).pipe(res);
      });
      return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': contentType(filePath), 'Content-Length': st.size });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url ?? '').split('?')[0] || '/';
  if (urlPath.startsWith('/api')) {
    proxy.web(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }
  const filePath = fileUnderDist(req.url ?? '/');
  if (!filePath) {
    res.writeHead(403).end();
    return;
  }
  sendFile(req, res, filePath);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[@lbss/admin] http://0.0.0.0:${port}  static:${distDir}  /api -> ${upstreamOrigin}`);
});
