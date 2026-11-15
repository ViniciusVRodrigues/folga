// Peças compartilhadas pelas telas: selo de risco, card de item, lista de categorias.
import { measureFraction } from '../lib/measure.js';
import { h, icon } from '../lib/dom.js';
import { t, k } from '../i18n/index.js';
import { formatBytes, formatRelative, middleEllipsis } from '../lib/format.js';
import { isSelectable } from '../lib/selection.js';

const RISK_KEY = { low: k('risk.low'), medium: k('risk.medium'), high: k('risk.high') };
const RISK_ICON = { low: 'check-circle', medium: 'alert-triangle', high: 'octagon-x' };

export function riskBadge(risk) {
  return h('span', { class: 'badge risk-' + risk }, icon(RISK_ICON[risk] || 'info'), h('span', null, t(RISK_KEY[risk] || RISK_KEY.medium)));
}

export function adminChip() {
  return h('span', { class: 'badge badge-admin' }, icon('shield'), h('span', null, t('item.needsAdmin')));
}

export function pathText(p, max = 56) {
  return h('code', { class: 'path', title: p }, middleEllipsis(p, max));
}

export function lastUsedLine(item) {
  if (item.game) {
    return item.game.lastPlayed ? t('item.lastPlayed', { when: formatRelative(item.game.lastPlayed) }) : t('item.neverPlayed');
  }
  const d = item.lastUsed || item.project?.lastTouched;
  return d ? t('item.lastUsed', { when: formatRelative(d) }) : null;
}

/** Botões de um item guiado. */
export function guidedActions(ctx, item) {
  const g = item.guide || {};
  const out = [];
  if (item.id === 'system.recycle-bin') {
    out.push(h('button', { class: 'btn', type: 'button', onclick: (e) => ctx.emptyBin(e.currentTarget) }, icon('trash'), t('item.emptyBin')));
  }
  if (g.open?.kind === 'steam') {
    out.push(h('button', { class: 'btn', type: 'button', onclick: (e) => ctx.openItem(item, 'steam-uninstall', e.currentTarget) }, icon('external'), t('item.openSteam')));
  } else if (g.open?.kind === 'explorer') {
    out.push(h('button', { class: 'btn', type: 'button', onclick: (e) => ctx.openItem(item, 'explorer', e.currentTarget) }, icon('folder'), t('item.openExplorer')));
  }
  if (item.paths?.length && g.open?.kind !== 'explorer' && item.id !== 'system.recycle-bin' && item.id !== 'system.winsxs') {
    out.push(h('button', { class: 'btn', type: 'button', onclick: (e) => ctx.openItem(item, 'explorer', e.currentTarget) }, icon('folder'), t('item.openExplorer')));
  }
  if (g.copy) {
    out.push(h('button', { class: 'btn', type: 'button', onclick: (e) => ctx.copyText(g.copy, e.currentTarget) }, icon('copy'), t('item.copyCommand')));
  }
  return out;
}

export function stepsDetails(item) {
  const steps = item.guide?.steps || [];
  if (!steps.length) return null;
  return h('details', { class: 'steps' }, h('summary', null, t('item.steps')), h('ol', null, steps.map((s) => h('li', null, s))));
}

export function detailsBlock(item) {
  return h('details', { class: 'more' },
    h('summary', null, t('item.details')),
    h('div', { class: 'more-body' },
      h('p', { class: 'muted small' }, t('item.pathsLabel')),
      h('ul', { class: 'paths' }, (item.paths || []).map((p) => h('li', null, h('code', { class: 'path-full' }, p)))),
      item.inUseBy?.length ? h('p', { class: 'small' }, t('item.inUseBy', { apps: item.inUseBy.join(', '), n: item.inUseBy.length })) : null,
      item.unreadable ? h('p', { class: 'small' }, t('item.unreadable')) : null));
}

function checkbox(ctx, item) {
  const id = 'chk-' + item.id.replace(/[^\w-]/g, '_');
  const input = h('input', {
    type: 'checkbox', id, class: 'chk', checked: ctx.selection.has(item.id),
    'data-item': item.id,
    onchange: (e) => { if (e.target.checked) ctx.selection.add(item.id); else ctx.selection.remove(item.id); ctx.updateSelBar(); },
  });
  return h('label', { class: 'chk-wrap', for: id }, input, h('span', { class: 'sr' }, t('item.select', { name: item.name })));
}

/** Card de CleanupItem com os 4 campos: o quê, depois de limpar, risco e tamanho. */
export function itemCard(ctx, item) {
  const selectable = isSelectable(item);
  const last = lastUsedLine(item);
  const guided = item.action === 'guided';
  const title = h('h3', { class: 'item-name' }, item.name);
  return h('li', { class: 'card item' + (guided ? ' guided' : ''), 'data-item': item.id },
    h('div', { class: 'item-head' },
      selectable ? checkbox(ctx, item) : h('span', { class: 'chk-wrap chk-off', 'aria-disabled': 'true', title: t(guided ? 'item.guidedWhy' : 'item.protectedWhy') }, icon('lock'), h('span', { class: 'sr' }, t(guided ? 'item.guidedWhy' : 'item.protectedWhy'))),
      title,
      h('span', { class: 'num' }, formatBytes(item.size))),
    h('div', { class: 'item-badges' }, riskBadge(item.risk), item.needsAdmin ? adminChip() : null, last ? h('span', { class: 'muted small' }, last) : null),
    h('p', { class: 'item-text' }, h('strong', null, t('item.whatLabel') + ' '), item.whatItIs),
    h('p', { class: 'item-text' }, h('strong', null, t('item.afterLabel') + ' '), item.afterCleaning),
    guided ? h('div', { class: 'item-actions' }, guidedActions(ctx, item), stepsDetails(item)) : null,
    detailsBlock(item));
}

export function categoryRows(ctx, categories) {
  const max = Math.max(1, ...categories.map((c) => c.size));
  return h('ul', { class: 'cat-list' }, categories.map((c) => h('li', { class: 'cat-row' },
    h('a', { class: 'cat-link', href: '#/cat/' + c.id },
      h('span', { class: 'cat-name' }, c.name),
      h('span', { class: 'num' }, formatBytes(c.size)),
      h('span', { class: 'bar', 'aria-hidden': 'true', vars: { '--pct': Math.max(2, (c.size / max) * 100) + '%' } }, h('span', { class: 'bar-fill' }))),
    h('span', { class: 'chips' },
      c.counts.safe ? h('span', { class: 'chip chip-safe' }, icon('check-circle'), t('chip.safe', { n: c.counts.safe })) : null,
      c.counts.admin ? h('span', { class: 'chip chip-admin' }, icon('shield'), t('chip.admin', { n: c.counts.admin })) : null,
      c.counts.decision ? h('span', { class: 'chip chip-decision' }, icon('alert-triangle'), t('chip.decision', { n: c.counts.decision })) : null))));
}

/** Faixa "Medindo… N de M" com barra. Atualizada por ctx.updateMeasure sem redesenhar a tela. */
export function measureBanner(ctx) {
  const p = ctx.state.measure;
  const text = h('span', { class: 'measure-text' }, measureText(p));
  const bar = h('span', { class: 'bar', 'aria-hidden': 'true', vars: { '--pct': measureFraction(p) * 100 + '%' } }, h('span', { class: 'bar-fill' }));
  return h('div', { class: 'banner measure', 'data-measure': '', role: 'status' }, icon('refresh', 'spin'),
    h('div', { class: 'measure-body' }, text, bar, h('span', { class: 'muted small' }, t('summary.measuringHint'))));
}

export function measureText(p) {
  if (!(p && p.total)) return t('summary.loading');
  const pend = (p.pending || []).slice(0, 3).join(', ');
  return pend ? t('summary.measuringPending', { done: p.done, total: p.total, pending: pend }) : t('summary.measuring', { done: p.done, total: p.total });
}
