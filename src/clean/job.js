import fs from 'node:fs';
import path from 'node:path';
import trashDefault from 'trash';
import { checkPath, isInside } from './guard.js';
import { removeTree, reasonOf } from './remove.js';
import { binInfo as binInfoDefault, wouldBePermanent } from './bin.js';
import { runCommand } from './commands.js';
import { buildAdminScript, runElevated } from './admin.js';
import { run } from './exec.js';
import { measure } from '../catalog/util.js';

/** Dependências injetáveis nos testes. */
export function makeDeps(over = {}) {
  const exec = over.exec || run;
  const d = {
    exec,
    trash: over.trash || ((list) => trashDefault(list)),
    binInfo: over.binInfo || ((root) => binInfoDefault(root, exec)),
    runAdmin: over.runAdmin || ((script) => runElevated(script, { exec })),
    runCommand: over.runCommand || ((cmd) => runCommand(cmd, { exec })),
    statfs: over.statfs || (async (root) => {
      const s = await fs.promises.statfs(root);
      return { free: Number(s.bsize) * Number(s.bavail) };
    }),
  };
  return d;
}

function trashReason(e) {
  const m = `${e && e.message}`;
  if (/in use|being used|sharing|busy/i.test(m)) return 'in-use';
  if (/too long|filename.*long|too deep/i.test(m)) return 'too-deep';
  if (/not found|no such|cannot find/i.test(m)) return 'not-found';
  return 'access-denied';
}

const driveOf = (p) => path.parse(path.resolve(p)).root;
const exists = async (p) => { try { await fs.promises.lstat(p); return true; } catch { return false; } };

/** Lista de alvos que o item remove, já revalidados. Devolve { targets:[{p,size}], failures:[reason], ignored } */
async function collectTargets(entry, env) {
  const targets = [];
  const failures = [];
  let notFound = 0;
  const contents = entry.method === 'trash-contents' || entry.method === 'admin-contents';
  for (const base of entry.paths || []) {
    if (!contents) {
      const root = (entry.roots || entry.paths).find((r) => isInside(base, r)) || base;
      const c = await checkPath(base, { allowedRoot: root, env });
      if (!c.ok) { if (c.reason === 'not-found') notFound++; else if (c.reason !== 'claude-temp') failures.push(c.reason); continue; }
      targets.push({ p: base, size: (await measure([base])).size });
      continue;
    }
    const rc = await checkPath(base, { allowedRoot: base, env, contents: true });
    if (!rc.ok) { if (rc.reason === 'not-found') notFound++; else failures.push(rc.reason); continue; }
    let names = [];
    try { names = await fs.promises.readdir(base); } catch (e) { failures.push(reasonOf(e)); continue; }
    for (const n of names) {
      const child = path.join(base, n);
      const c = await checkPath(child, { allowedRoot: base, env });
      if (!c.ok) {
        if (c.reason === 'not-found' || c.reason === 'claude-temp') continue;
        failures.push(c.reason); continue;
      }
      targets.push({ p: child, size: (await measure([child])).size });
    }
  }
  return { targets, failures, notFound };
}

/** Executa um item de limpeza normal. Devolve { status, freed, bin, perm, reason }. */
export async function cleanItem(entry, { mode, confirmPermanent }, deps, env, binCache) {
  if (entry.method === 'command') {
    const before = (await measure(entry.paths || [])).size;
    const r = await deps.runCommand(entry.command);
    if (!r.ok) return { status: 'failed', freed: 0, bin: 0, perm: 0, reason: r.reason };
    const after = (await measure(entry.paths || [])).size;
    const freed = Math.max(0, before - after);
    return { status: 'done', freed, bin: 0, perm: freed, reason: null };
  }
  const { targets, failures, notFound } = await collectTargets(entry, env);
  const res = { freed: 0, bin: 0, perm: 0 };
  const fails = [...failures];
  const ok = [];
  if (mode === 'delete') {
    for (const t of targets) {
      const r = await removeTree(t.p);
      if (r.failed.length) fails.push(r.failed[0].reason); else { res.freed += t.size; res.perm += t.size; }
    }
  } else {
    const toTrash = [];
    for (const t of targets) {
      const root = driveOf(t.p);
      if (!binCache.has(root)) binCache.set(root, await deps.binInfo(root));
      const perm = wouldBePermanent(binCache.get(root), t.size);
      if (perm && !confirmPermanent) { fails.push('would-be-permanent'); continue; }
      toTrash.push({ ...t, perm });
    }
    const settle = async (list) => {
      for (const t of list) {
        if (await exists(t.p)) fails.push('access-denied');
        else { res.freed += t.size; if (t.perm) res.perm += t.size; else res.bin += t.size; ok.push(t); }
      }
    };
    if (toTrash.length) {
      try {
        await deps.trash(toTrash.map((t) => t.p));
        await settle(toTrash);
      } catch {
        // isola quem falhou; nunca cai para exclusão definitiva
        for (const t of toTrash) {
          try { await deps.trash([t.p]); await settle([t]); } catch (e) { fails.push(trashReason(e)); }
        }
      }
    }
  }
  if (!fails.length) {
    if (!targets.length && notFound) return { status: 'skipped', ...res, reason: 'not-found' };
    return { status: 'done', ...res, reason: null };
  }
  const reason = fails[0];
  if (res.freed === 0) return { status: 'failed', ...res, reason };
  return { status: 'done', ...res, reason };
}

/** Executa o job inteiro: itens normais em sequência e, depois, os de admin numa só elevação. */
export async function runJob(job, plan, { events, deps, env }) {
  const binCache = new Map();
  const emit = (itemId, status, reason) => events.broadcast('clean-progress', { jobId: job.jobId, itemId, status, ...(reason ? { reason } : {}) });
  const push = (itemId, r) => {
    job.items.push({ itemId, status: r.status, freed: r.freed || 0, reason: r.reason || null });
    job.freed += r.freed || 0;
    job.movedToBin += r.bin || 0;
    job.deletedPermanently += r.perm || 0;
    emit(itemId, r.status, r.reason);
  };
  const admin = [];
  for (const it of plan) {
    if (it.entry.needsAdmin) { admin.push(it); continue; }
    emit(it.id, 'running');
    try {
      push(it.id, await cleanItem(it.entry, it, deps, env, binCache));
    } catch {
      push(it.id, { status: 'failed', freed: 0, reason: 'access-denied' });
    }
  }
  if (admin.length) {
    for (const a of admin) emit(a.id, 'running');
    try {
      const { script } = buildAdminScript(admin.map((a) => ({ id: a.id, paths: a.entry.paths })), { env });
      const before = new Map();
      for (const a of admin) before.set(a.id, (await measure(a.entry.paths)).size);
      const r = await deps.runAdmin(script);
      for (const a of admin) {
        if (r.declined) { push(a.id, { status: 'failed', freed: 0, reason: 'admin-declined' }); continue; }
        if (!r.ok) { push(a.id, { status: 'failed', freed: 0, reason: 'access-denied' }); continue; }
        const after = (await measure(a.entry.paths)).size;
        const freed = Math.max(0, before.get(a.id) - after);
        push(a.id, { status: 'done', freed, perm: freed, reason: after > 0 ? 'in-use' : null });
      }
    } catch {
      for (const a of admin) push(a.id, { status: 'failed', freed: 0, reason: 'protected' });
    }
  }
  const first = plan[0]?.entry?.paths?.[0];
  const root = first ? driveOf(first) : (env?.SystemDrive || 'C:') + '\\';
  try { job.drive = { root, free: (await deps.statfs(root)).free }; } catch { job.drive = null; }
  job.status = 'done';
  events.broadcast('clean-done', { jobId: job.jobId });
}
