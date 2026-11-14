// Limpando (progresso por item) e resumo final.
import { h, icon, clear } from '../lib/dom.js';
import { t, k } from '../i18n/index.js';
import { formatBytes } from '../lib/format.js';

const REASON_KEY = {
  'in-use': k('reason.in-use'), 'access-denied': k('reason.access-denied'), 'not-found': k('reason.not-found'),
  'too-deep': k('reason.too-deep'), 'admin-declined': k('reason.admin-declined'),
};
const STATUS_KEY = { pending: k('clean.status.pending'), running: k('clean.status.running'), done: k('clean.status.done'), failed: k('clean.status.failed'), skipped: k('clean.status.skipped') };
const STATUS_ICON = { pending: 'info', running: 'refresh', done: 'check-circle', failed: 'octagon-x', skipped: 'alert-triangle' };

export function reasonText(reason) {
  return t(REASON_KEY[reason] || k('reason.unknown'));
}

export function renderClean(ctx) {
  const job = ctx.state.job;
  const root = h('section', { class: 'view', 'aria-labelledby': 'view-title' });
  if (!job) {
    root.append(h('h1', { id: 'view-title', tabindex: '-1' }, t('nav.summary')), h('a', { class: 'btn', href: '#/summary' }, t('nav.summary')));
    return root;
  }
  return job.result ? renderResult(ctx, root, job) : renderRunning(ctx, root, job);
}

function renderRunning(ctx, root, job) {
  const list = h('ul', { class: 'progress-list' });
  const counter = h('p', { class: 'num', role: 'status' });
  const note = h('p', { class: 'banner', hidden: true }, icon('shield'), h('span', null));
  function paint() {
    const entries = [...job.meta.entries()];
    const finished = entries.filter(([id]) => ['done', 'failed', 'skipped'].includes(job.status.get(id)?.status)).length;
    counter.textContent = t('clean.progress', { done: finished, total: entries.length });
    clear(list);
    for (const [id, m] of entries) {
      const st = job.status.get(id)?.status || 'pending';
      list.append(h('li', { class: 'prog prog-' + st }, icon(STATUS_ICON[st], st === 'running' ? 'spin' : ''), h('span', { class: 'prog-name' }, m.name), h('span', { class: 'muted small' }, t(STATUS_KEY[st]))));
    }
    const adminLeft = entries.filter(([, m]) => m.needsAdmin).some(([id]) => ['pending', 'running'].includes(job.status.get(id)?.status || 'pending'));
    const normalLeft = entries.filter(([, m]) => !m.needsAdmin).some(([id]) => ['pending', 'running'].includes(job.status.get(id)?.status || 'pending'));
    note.hidden = !(adminLeft && !normalLeft);
    note.lastChild.textContent = t('clean.waitingAdmin');
    ctx.announce(counter.textContent);
  }
  paint();
  ctx.view.onEvent = (name, d) => {
    if (d.jobId !== job.jobId) return;
    if (name === 'clean-progress') { job.status.set(d.itemId, { status: d.status, reason: d.reason }); paint(); }
    if (name === 'clean-done') finish(ctx, job);
  };
  const poll = setInterval(async () => {
    try { const r = await ctx.api.job(job.jobId); if (r.status === 'done') finish(ctx, job); } catch { /* tenta de novo */ }
  }, 1500);
  ctx.cleanups.push(() => clearInterval(poll));
  root.append(h('h1', { id: 'view-title', tabindex: '-1' }, t('clean.running')), counter, note, list);
  return root;
}

let finishing = false;
async function finish(ctx, job) {
  if (finishing || job.result) return;
  finishing = true;
  try {
    job.result = await ctx.api.job(job.jobId);
    ctx.state.cleanup && ctx.refreshCleanup(false, true);
    ctx.drop(job.meta);
    if (ctx.state.route === 'clean') ctx.render({ focus: true });
  } catch (e) {
    ctx.announce(e.message);
  } finally { finishing = false; }
}

function renderResult(ctx, root, job) {
  const r = job.result;
  const failed = r.items.filter((i) => i.status === 'failed');
  const skippedAdmin = r.items.filter((i) => i.reason === 'admin-declined');
  const nameOf = (id) => job.meta.get(id)?.name || id;
  root.append(h('h1', { id: 'view-title', tabindex: '-1' }, t('clean.doneTitle')));
  root.append(h('div', { class: 'card result' },
    h('p', { class: 'stat-label' }, t('clean.freed')),
    h('p', { class: 'stat-num num' }, formatBytes(r.freed)),
    h('ul', { class: 'result-split' },
      h('li', null, icon('trash'), h('span', null, t('clean.toBin')), h('span', { class: 'num' }, formatBytes(r.movedToBin))),
      h('li', null, icon('flame'), h('span', null, t('clean.deleted')), h('span', { class: 'num' }, formatBytes(r.deletedPermanently)))),
    r.drive ? h('p', { class: 'num' }, t('clean.freeNow', { drive: r.drive.root.slice(0, 2), free: formatBytes(r.drive.free) })) : null));
  if (r.movedToBin > 0 && !job.binEmptied) {
    root.append(h('div', { class: 'card' }, h('p', null, t('clean.binHint', { size: formatBytes(r.movedToBin) })),
      h('button', { class: 'btn', type: 'button', onclick: (e) => ctx.emptyBin(e.currentTarget, job) }, icon('trash'), t('item.emptyBin'))));
  }
  if (job.binEmptied) root.append(h('p', { class: 'banner', role: 'status' }, icon('check-circle'), h('span', null, t('clean.binEmptied', { size: formatBytes(job.binEmptied) }))));
  if (skippedAdmin.length) root.append(h('p', { class: 'banner banner-warn', role: 'status' }, icon('alert-triangle'), h('span', null, t('clean.adminDeclined'))));
  if (failed.length) {
    root.append(h('h2', null, t('clean.failures', { n: failed.length })),
      h('ul', { class: 'progress-list' }, failed.map((f) => h('li', { class: 'prog prog-failed' }, icon('octagon-x'), h('span', { class: 'prog-name' }, nameOf(f.itemId)), h('span', { class: 'muted small' }, reasonText(f.reason))))),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.retry(failed.map((f) => f.itemId), job) }, icon('refresh'), t('clean.retry')));
  }
  root.append(h('p', null, h('a', { class: 'btn', href: '#/summary' }, t('clean.back'))));
  return root;
}
