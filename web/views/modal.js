// Modal de confirmação (foco preso, Esc fecha, foco volta à origem).
import { h, icon } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { formatBytes } from '../lib/format.js';
import { buildModel, canConfirm, buildRequest, modeOf, isPermanent } from '../lib/selection.js';
import { riskBadge } from './parts.js';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], select, textarea, summary, pre[tabindex], [tabindex]:not([tabindex="-1"])';

export function openDialog({ title, body, footer, origin, wide = false }) {
  const app = document.getElementById('app');
  const root = document.getElementById('modal-root');
  const titleId = 'dlg-title-' + Math.random().toString(36).slice(2, 8);
  const dlg = h('div', { class: 'dialog' + (wide ? ' dialog-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
    h('h2', { id: titleId, class: 'dialog-title' }, title),
    h('div', { class: 'dialog-body' }, body),
    h('div', { class: 'dialog-footer' }, footer));
  const backdrop = h('div', { class: 'backdrop' }, dlg);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    app.inert = false;
    if (origin && origin.isConnected) origin.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const els = [...dlg.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey, true);
  app.inert = true;
  root.append(backdrop);
  (dlg.querySelector('[data-initial]') || dlg).focus();
  return { close, el: dlg };
}

export function confirmDialog({ title, text, confirmLabel, origin }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (!answered) { answered = true; resolve(v); } d.close(); };
    const d = openDialog({
      title, origin,
      body: h('p', null, text),
      footer: [
        h('button', { class: 'btn', type: 'button', 'data-initial': '', onclick: () => answer(false) }, t('action.cancel')),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: () => answer(true) }, confirmLabel),
      ],
    });
    // Esc e clique fora fecham sem responder: resolve como falso.
    new MutationObserver((_, obs) => { if (!d.el.isConnected) { obs.disconnect(); if (!answered) { answered = true; resolve(false); } } }).observe(document.getElementById('modal-root'), { childList: true });
  });
}

export function openCleanModal(ctx, origin) {
  const cats = (ctx.state.cleanup?.categories || []).filter((c) => c.items.length);
  const model = buildModel(ctx.selection, cats);
  const index = ctx.index;

  if (!model.count) {
    const e = openDialog({ title: t('modal.title'), origin, body: h('p', null, t('modal.empty')), footer: [h('button', { class: 'btn', type: 'button', 'data-initial': '', onclick: () => e.close() }, t('action.close'))] });
    return;
  }

  const confirm = h('button', { class: 'btn btn-danger', type: 'button', disabled: !canConfirm(model, false), onclick: go }, icon('trash'), t('modal.confirm', { n: model.count, size: formatBytes(model.total) }));
  let ack = false;
  const ackBox = model.needsAck
    ? h('label', { class: 'ack' }, h('input', { type: 'checkbox', class: 'chk', onchange: (e) => { ack = e.target.checked; confirm.disabled = !canConfirm(model, ack); } }), h('span', null, t('modal.ack')))
    : null;

  function dest(line) {
    const perm = isPermanent(ctx.selection, line.item);
    return h('span', { class: 'dest ' + (perm ? 'dest-perm' : 'dest-trash') }, icon(perm ? 'flame' : 'trash'), perm ? t('modal.permanent') : t('modal.toBin'));
  }
  function lineEl(line) {
    const it = line.item;
    const destSlot = h('span', { class: 'dest-slot' }, dest(line));
    const name = 'mode-' + it.id.replace(/[^\w-]/g, '_');
    const chooser = line.canChoose
      ? h('fieldset', { class: 'mode' }, h('legend', { class: 'sr' }, t('modal.modeFor', { name: it.name })),
        ['trash', 'delete'].map((m) => h('label', { class: 'mode-opt' },
          h('input', { type: 'radio', name, value: m, checked: modeOf(ctx.selection, it) === m, onchange: () => { ctx.selection.setMode(it.id, m); destSlot.replaceChildren(dest({ item: it })); } }),
          h('span', null, t(m === 'trash' ? 'modal.optBin' : 'modal.optDelete')))))
      : null;
    return h('li', { class: 'dlg-line' },
      h('div', { class: 'dlg-line-main' }, h('span', { class: 'dlg-name' }, it.name), h('span', { class: 'num' }, formatBytes(it.size))),
      h('div', { class: 'item-badges' }, riskBadge(it.risk), destSlot), chooser);
  }

  const sections = model.groups.map((g) => h('section', { class: 'dlg-group', 'aria-label': g.category.name },
    h('h3', null, h('span', null, g.category.name), h('span', { class: 'num muted' }, formatBytes(g.subtotal))),
    h('ul', null, g.lines.map(lineEl))));

  let adminSection = null;
  if (model.admin.items.length) {
    const pre = h('pre', { class: 'script', tabindex: '0', 'aria-label': t('modal.scriptLabel') });
    const copyBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: (e) => ctx.copyText(pre.textContent, e.currentTarget) }, icon('copy'), t('item.copy'));
    pre.hidden = true;
    const showBtn = h('button', {
      class: 'btn', type: 'button', 'aria-expanded': 'false',
      onclick: async (e) => {
        const b = e.currentTarget;
        if (!pre.hidden) { pre.hidden = true; copyBtn.hidden = true; b.setAttribute('aria-expanded', 'false'); return; }
        try {
          const r = await ctx.api.adminScript(model.admin.items.map((l) => l.item.id));
          pre.textContent = r.script; pre.hidden = false; copyBtn.hidden = false; b.setAttribute('aria-expanded', 'true');
        } catch (err) { pre.textContent = err.message; pre.hidden = false; }
      },
    }, t('modal.viewScript'));
    adminSection = h('section', { class: 'dlg-group dlg-admin', 'aria-label': t('modal.adminTitle') },
      h('h3', null, h('span', null, icon('shield'), t('modal.adminTitle')), h('span', { class: 'num muted' }, formatBytes(model.admin.subtotal))),
      h('ul', null, model.admin.items.map(lineEl)),
      h('div', { class: 'item-actions' }, showBtn, copyBtn), pre);
  }

  async function go() {
    confirm.disabled = true;
    const items = buildRequest(ctx.selection, index);
    d.close();
    await ctx.startClean(items);
  }

  const d = openDialog({
    title: t('modal.title'), origin, wide: true,
    body: [h('p', { class: 'muted' }, t('modal.intro', { n: model.count, size: formatBytes(model.total) })), sections, adminSection, ackBox],
    footer: [h('button', { class: 'btn', type: 'button', 'data-initial': '', onclick: () => d.close() }, t('action.cancel')), confirm],
  });
}
