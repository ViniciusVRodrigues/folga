import fs from 'node:fs';
import path from 'node:path';
import { HttpError, reply } from '../router.js';
import { knownLocations } from '../platform/index.js';
import { makeDeps, runJob } from '../clean/job.js';
import { buildAdminScript } from '../clean/admin.js';
import { wouldBePermanent } from '../clean/bin.js';

const STEAM_URL = /^steam:\/\/(uninstall|nav\/games\/details)\/\d+$/;

export function register(router, ctx) {
  const { events, state } = ctx;
  state.cleanup = state.cleanup || { running: null, result: null, items: new Map(), generatedAt: null };
  state.clean = state.clean || { jobs: new Map(), seq: 0, queue: Promise.resolve() };
  const env = ctx.catalog?.env || process.env;
  const deps = makeDeps(ctx.clean);
  const catalogMap = () => state.cleanup.items;

  router.post('/api/clean', async ({ body }) => {
    const list = body?.items;
    if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'BAD_REQUEST', 'Informe items.');
    const wanted = [];
    const seen = new Set();
    for (const x of list) {
      if (!x || typeof x.id !== 'string') throw new HttpError(400, 'BAD_REQUEST', 'Item inválido.');
      const mode = x.mode === undefined ? 'trash' : x.mode;
      if (mode !== 'trash' && mode !== 'delete') throw new HttpError(400, 'BAD_REQUEST', 'mode deve ser trash ou delete.');
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      wanted.push({ id: x.id, mode, confirmPermanent: x.confirmPermanent === true });
    }
    const map = catalogMap();
    const stale = wanted.filter((w) => !map.has(w.id)).map((w) => w.id);
    if (stale.length) {
      return reply(409, { error: { code: 'STALE_ITEM', message: 'Itens desconhecidos ou desatualizados. Atualize a lista.', items: stale } });
    }
    for (const w of wanted) {
      const e = map.get(w.id);
      if (e.action === 'guided') throw new HttpError(400, 'BAD_REQUEST', `O item ${w.id} é guiado e não é limpo pelo app.`);
      if (!['trash', 'trash-contents', 'command', 'admin-contents'].includes(e.method)) throw new HttpError(400, 'BAD_REQUEST', `O item ${w.id} não tem limpeza.`);
      if (w.mode === 'delete' && !e.regenerable) throw new HttpError(400, 'BAD_REQUEST', `O item ${w.id} não pode ser apagado de vez.`);
    }
    // normais primeiro, admin depois
    const plan = wanted.map((w) => ({ ...w, entry: map.get(w.id) }));
    const binCache = new Map();
    const planOut = [];
    for (const p of plan) {
      let permanent = p.mode === 'delete' || p.entry.needsAdmin || p.entry.method === 'command';
      if (!permanent && p.entry.paths?.[0]) {
        const root = path.parse(path.resolve(p.entry.paths[0])).root;
        if (!binCache.has(root)) binCache.set(root, await deps.binInfo(root));
        permanent = wouldBePermanent(binCache.get(root), p.entry.size);
      }
      planOut.push({ itemId: p.id, size: p.entry.size, permanent, needsAdmin: !!p.entry.needsAdmin });
    }
    const jobId = `j${++state.clean.seq}`;
    const job = { jobId, status: 'running', freed: 0, movedToBin: 0, deletedPermanently: 0, items: [], drive: null };
    state.clean.jobs.set(jobId, job);
    state.clean.queue = state.clean.queue.then(() => runJob(job, plan, { events, deps, env })).catch(() => {
      job.status = 'done';
    });
    return reply(202, { jobId, plan: planOut });
  });

  router.get('/api/clean/:jobId', async ({ params }) => {
    const job = state.clean.jobs.get(params.jobId);
    if (!job) throw new HttpError(404, 'NOT_FOUND', 'Job não encontrado.');
    return { ...job };
  });

  router.get('/api/admin-script', async ({ query }) => {
    const ids = String(query.items || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) throw new HttpError(400, 'BAD_REQUEST', 'Informe items.');
    const map = catalogMap();
    if (ids.some((i) => !map.has(i))) throw new HttpError(409, 'STALE_ITEM', 'Itens desconhecidos ou desatualizados.');
    const entries = [];
    for (const id of ids) {
      const e = map.get(id);
      if (!e.needsAdmin) throw new HttpError(400, 'BAD_REQUEST', `O item ${id} não é de administrador.`);
      entries.push({ id, paths: e.paths });
    }
    try { return buildAdminScript(entries, { env }); } catch { throw new HttpError(400, 'BAD_REQUEST', 'Caminho não permitido.'); }
  });

  router.post('/api/open', async ({ body }) => {
    const { itemId, kind } = body || {};
    const e = typeof itemId === 'string' ? catalogMap().get(itemId) : null;
    if (!e) throw new HttpError(409, 'STALE_ITEM', 'Item desconhecido ou desatualizado.');
    let args;
    if (kind === 'explorer') {
      const t = e.guide?.open?.kind === 'explorer' ? e.guide.open.target : null;
      if (t && /^shell:[A-Za-z]+$/.test(t)) args = [t];
      else {
        for (const p of e.paths || []) {
          try {
            const st = await fs.promises.lstat(p);
            args = st.isDirectory() ? [p] : [`/select,${p}`];
            break;
          } catch { /* tenta o próximo */ }
        }
      }
      if (!args) throw new HttpError(404, 'NOT_FOUND', 'A pasta não existe mais.');
    } else if (kind === 'steam-uninstall' || kind === 'steam-move') {
      const appid = e.game?.appid;
      const url = kind === 'steam-uninstall' ? e.guide?.open?.target : (appid ? `steam://nav/games/details/${appid}` : null);
      if (!url || !STEAM_URL.test(url)) throw new HttpError(400, 'BAD_REQUEST', 'Este item não abre a Steam.');
      args = [url];
    } else {
      throw new HttpError(400, 'BAD_REQUEST', 'kind inválido.');
    }
    try { await deps.exec('explorer.exe', args); } catch (err) {
      if (err.code !== 1) throw new HttpError(500, 'INTERNAL', 'Não foi possível abrir.');
    }
    return { ok: true };
  });

  router.post('/api/recycle-bin/empty', async ({ body }) => {
    if (body?.confirm !== true) throw new HttpError(400, 'BAD_REQUEST', 'Confirmação necessária.');
    const L = knownLocations(env);
    const letter = L.systemDrive.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1);
    if (!/^[A-Z]$/.test(letter)) throw new HttpError(400, 'BAD_REQUEST', 'Unidade inválida.');
    const root = `${letter}:\\`;
    let before = null;
    try { before = (await deps.statfs(root)).free; } catch { /* sem medição */ }
    try {
      await deps.exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Clear-RecycleBin -Force -DriveLetter ${letter}`], { timeout: 5 * 60 * 1000 });
    } catch (e) {
      throw new HttpError(500, 'INTERNAL', `Não foi possível esvaziar a Lixeira: ${String(e.stderr || e.message).slice(0, 200)}`);
    }
    let freed = 0;
    try { freed = Math.max(0, (await deps.statfs(root)).free - before); } catch { /* sem medição */ }
    return { freed };
  });
}
