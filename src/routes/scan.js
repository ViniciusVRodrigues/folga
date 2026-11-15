import fs from 'node:fs';
import path from 'node:path';
import { HttpError, reply } from '../router.js';
import { scanTree, pathKey } from '../scan/walk.js';
import * as platform from '../platform/index.js';

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

export function register(router, ctx) {
  const { events, state } = ctx;

  router.get('/api/drives', async () => ({
    drives: await platform.drives(),
    home: platform.home(),
    shortcuts: platform.shortcuts(),
  }));

  const canElevate = process.platform === 'win32';
  const summary = (scanId, res, extra = {}) => ({
    scanId, partial: !!res?.partial, files: res?.files || 0, dirs: res?.dirs || 0, bytes: res?.bytes || 0,
    unreadable: res?.unreadable || 0, elapsedMs: res?.elapsedMs || 0, admin: !!res?.admin, ...extra,
  });

  router.post('/api/scan', async ({ body }) => {
    const p = body?.path;
    const admin = body?.admin;
    if (admin !== undefined && typeof admin !== 'boolean') throw new HttpError(400, 'BAD_REQUEST', 'admin deve ser booleano');
    if (admin && !canElevate) throw new HttpError(400, 'BAD_REQUEST', 'Leitura como administrador só existe no Windows');
    if (typeof p !== 'string' || !path.isAbsolute(p)) throw new HttpError(400, 'BAD_REQUEST', 'Caminho deve ser absoluto');
    let st;
    try { st = await fs.promises.stat(p); } catch { throw new HttpError(400, 'BAD_REQUEST', 'Caminho não existe'); }
    if (!st.isDirectory()) throw new HttpError(400, 'BAD_REQUEST', 'Caminho não é uma pasta');
    if (state.scan?.running) throw new HttpError(409, 'SCAN_RUNNING', 'Já existe uma varredura em andamento');

    const scanId = 's' + (++state.seq);
    const controller = new AbortController();
    const prev = state.scan;
    const scan = { id: scanId, root: path.resolve(p), running: true, controller, result: null, admin: !!admin };
    state.scan = scan;
    // UAC recusado ou leitor elevado que falhou: a varredura anterior continua valendo
    const restore = (extra) => {
      if (state.scan === scan) state.scan = prev;
      events.broadcast('scan-done', summary(scanId, prev?.result, { root: prev?.root || null, ...extra }));
    };
    (ctx.scanTree || scanTree)(scan.root, {
      signal: controller.signal,
      largeFileMin: ctx.largeFileMin,
      admin: !!admin,
      onProgress: (pr) => { scan.progress = pr; events.broadcast('scan-progress', { scanId, ...pr }); },
    }).then((result) => {
      scan.running = false;
      if (result.declined) { restore({ declined: true }); return; }
      scan.result = result;
      scan.progress = { files: result.files, dirs: result.dirs, bytes: result.bytes, unreadable: result.unreadable, elapsedMs: result.elapsedMs };
      events.broadcast('scan-done', summary(scanId, result));
    }).catch(() => {
      scan.running = false;
      scan.failed = true;
      if (admin) { restore({ failed: true }); return; }
      events.broadcast('scan-done', summary(scanId, null, { partial: true, failed: true }));
    });
    return reply(202, { scanId });
  });

  router.get('/api/scan/status', async () => {
    const scan = state.scan;
    if (!scan) return { state: 'idle', root: null, progress: null, partial: false, admin: false, canElevate };
    const st = scan.running ? 'running' : scan.result ? 'done' : 'idle';
    return { state: st, root: scan.root, progress: scan.progress || null, partial: !!(scan.result?.partial), admin: !!scan.admin, canElevate };
  });

  router.post('/api/scan/cancel', async () => {
    state.scan?.controller.abort();
    return { ok: true };
  });

  router.get('/api/tree', async ({ query }) => {
    const scan = state.scan;
    if (!scan?.result) throw new HttpError(409, 'NO_SCAN', 'Nenhuma varredura concluída');
    const result = scan.result;
    if (typeof query.path !== 'string' || !path.isAbsolute(query.path)) throw new HttpError(404, 'NOT_FOUND', 'Fora da raiz da varredura');
    const node = result.index.get(pathKey(query.path));
    if (!node) throw new HttpError(404, 'NOT_FOUND', 'Fora da raiz da varredura');
    const limit = Math.max(1, Math.min(5000, parseInt(query.limit, 10) || 200));

    const items = [
      ...node.children.map((c) => ({
        name: c.name, path: c.path, type: 'dir', size: c.size, alloc: c.alloc,
        items: c.children.length + c.directFiles,
        noAccess: c.noAccess, mtime: iso(c.mtime),
      })),
      ...node.topFiles.map((f) => ({
        name: f.name, path: path.join(node.path, f.name), type: 'file', size: f.size, alloc: f.alloc, mtime: iso(f.mtime),
      })),
    ].sort((a, b) => b.size - a.size);
    const shown = items.slice(0, limit);
    const cut = items.slice(limit);
    const more = {
      count: cut.length + node.otherFiles.count,
      size: cut.reduce((s, x) => s + x.size, 0) + node.otherFiles.size,
    };
    const isRoot = pathKey(node.path) === pathKey(result.root.path);
    return {
      path: node.path, name: node.name, size: node.size, alloc: node.alloc, files: node.files, dirs: node.dirs,
      noAccess: node.noAccess, partial: result.partial,
      parent: isRoot ? null : path.dirname(node.path),
      children: shown, more,
    };
  });

  router.get('/api/large-files', async ({ query }) => {
    const result = state.scan?.result;
    if (!result) throw new HttpError(409, 'NO_SCAN', 'Nenhuma varredura concluída');
    const min = Number(query.min);
    const floor = Number.isFinite(min) && query.min !== undefined ? min : 500 * 1024 ** 2;
    return {
      files: result.largeFiles.filter((f) => f.size >= floor).map((f) => ({ path: f.path, size: f.size, mtime: iso(f.mtime), ext: f.ext })),
    };
  });
}
