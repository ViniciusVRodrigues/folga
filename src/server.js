import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRouter, sendError } from './router.js';
import { createEvents } from './events.js';
import { registrars } from './routes/index.js';

const DEFAULT_WEB_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function tokenOk(given, expected) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function serveStatic(req, res, url, webRoot) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 404, 'NOT_FOUND', 'Não encontrado');
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return sendError(res, 400, 'BAD_REQUEST', 'Caminho inválido'); }
  if (rel.includes('\0')) return sendError(res, 400, 'BAD_REQUEST', 'Caminho inválido');
  if (rel.endsWith('/')) rel += 'index.html';
  const root = path.resolve(webRoot);
  const file = path.resolve(root, '.' + path.sep + path.normalize(rel).replace(/^[\\/]+/, ''));
  if (file !== root && !file.startsWith(root + path.sep)) return sendError(res, 404, 'NOT_FOUND', 'Não encontrado');
  try {
    const st = await fs.promises.stat(file);
    if (!st.isFile()) return sendError(res, 404, 'NOT_FOUND', 'Não encontrado');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {
    sendError(res, 404, 'NOT_FOUND', 'Não encontrado');
  }
}

export async function startServer({ port = 0, host = '127.0.0.1', webRoot = DEFAULT_WEB_ROOT, token, largeFileMin, catalog, clean, scanTree } = {}) {
  token = token || crypto.randomBytes(32).toString('hex');
  const events = createEvents();
  const state = { scan: null, seq: 0 };
  const router = createRouter();
  const ctx = { events, state, largeFileMin, catalog, clean, scanTree };
  for (const register of registrars) register(router, ctx);
  router.get('/api/events', ({ req, res }) => { events.add(req, res); });

  let boundPort = port;
  const server = http.createServer(async (req, res) => {
    const hosts = new Set([`127.0.0.1:${boundPort}`, `localhost:${boundPort}`]);
    const origins = new Set([`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`]);
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (!hosts.has(req.headers.host || '')) return sendError(res, 403, 'FORBIDDEN', 'Host não permitido');
      if (req.headers.origin !== undefined && !origins.has(req.headers.origin)) return sendError(res, 403, 'FORBIDDEN', 'Origin não permitido');
      const url = new URL(req.url, `http://127.0.0.1:${boundPort}`);
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        const given = url.pathname === '/api/events' ? url.searchParams.get('t') : req.headers['x-token'];
        if (!tokenOk(given, token)) return sendError(res, 403, 'FORBIDDEN', 'Token inválido');
        if (!(await router.handle(req, res, url))) sendError(res, 404, 'NOT_FOUND', 'Rota não encontrada');
        return;
      }
      await serveStatic(req, res, url, webRoot);
    } catch {
      if (!res.headersSent) sendError(res, 500, 'INTERNAL', 'Erro interno');
      else res.end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  boundPort = server.address().port;

  return {
    url: `http://127.0.0.1:${boundPort}/#t=${token}`,
    port: boundPort,
    token,
    events,
    state,
    close() {
      state.scan?.controller.abort();
      events.closeAll();
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}
