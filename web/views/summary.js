import { h, icon } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { formatBytes, formatPercent } from '../lib/format.js';
import { categoryRows, measureBanner } from './parts.js';
import { safePreselect } from '../lib/selection.js';

export function renderSummary(ctx) {
  const data = ctx.state.cleanup;
  const root = h('section', { class: 'view', 'aria-labelledby': 'view-title' });
  root.append(h('h1', { id: 'view-title', tabindex: '-1' }, t('summary.title')));
  if (!data) {
    if (ctx.state.cleanupError) {
      root.append(h('p', { class: 'muted', role: 'status' }, t('error.load')), h('button', { class: 'btn', type: 'button', onclick: () => ctx.refreshCleanup(true) }, t('action.retry')));
    } else root.append(measureBanner(ctx));
    const early = (ctx.state.drives?.drives || []).filter((d) => !d.system);
    if (early.length) root.append(h('h2', null, t('summary.otherDrives')), h('div', { class: 'drive-grid' }, early.map((d) => driveCard(ctx, d))));
    return root;
  }
  const { drive, summary } = data;
  if (ctx.state.measure) root.append(measureBanner(ctx));
  const freeFrac = drive && drive.total ? drive.free / drive.total : 1;
  const letter = drive ? drive.root.slice(0, 2) : '';
  if (drive && freeFrac < 0.1) {
    root.append(h('div', { class: 'banner banner-warn', role: 'status' }, icon('alert-triangle'),
      h('p', null, t('summary.low', { drive: letter, pct: formatPercent(freeFrac) }), ' ', h('span', { class: 'muted' }, t('summary.freeOf', { free: formatBytes(drive.free), total: formatBytes(drive.total) })))));
  }
  const cats = data.categories.filter((c) => c.items.length);
  root.append(h('div', { class: 'stats' },
    h('div', { class: 'card stat stat-safe' },
      h('p', { class: 'stat-label' }, t('summary.safeNow')),
      h('p', { class: 'stat-num num' }, formatBytes(summary.safeNow)),
      h('p', { class: 'muted small' }, t('summary.safeHint'))),
    h('div', { class: 'card stat' },
      h('p', { class: 'stat-label' }, t('summary.needsDecision')),
      h('p', { class: 'stat-num num' }, formatBytes(summary.needsDecision)),
      h('p', { class: 'muted small' }, t('summary.decisionHint')))));
  root.append(h('div', { class: 'cta-row' },
    h('button', {
      class: 'btn btn-primary btn-lg', type: 'button', disabled: !safePreselect(cats).length,
      onclick: (e) => { ctx.selection.replace(safePreselect(cats)); ctx.updateSelBar(); ctx.openModal(e.currentTarget); },
    }, icon('broom'), t('summary.cta')),
    h('button', { class: 'btn', type: 'button', disabled: !!ctx.state.measure, onclick: () => ctx.refreshCleanup(true) }, icon('refresh'), t('summary.remeasure'))));
  root.append(h('h2', null, t('summary.categories')), cats.length ? categoryRows(ctx, cats) : h('p', { class: 'muted' }, t('summary.nothing')));
  root.append(h('p', { class: 'checked muted' }, t('summary.checked', { list: data.checked.join(', ') })));
  const others = (ctx.state.drives?.drives || []).filter((d) => !d.system);
  if (others.length) {
    root.append(h('h2', null, t('summary.otherDrives')), h('div', { class: 'drive-grid' }, others.map((d) => driveCard(ctx, d))));
  }
  return root;
}

export function driveCard(ctx, d) {
  const used = d.total - d.free;
  return h('div', { class: 'card drive' },
    h('h3', null, d.label ? d.root.slice(0, 2) + ' ' + d.label : d.root),
    h('p', { class: 'muted small num' }, t('summary.driveFree', { free: formatBytes(d.free), total: formatBytes(d.total) })),
    h('span', { class: 'bar', 'aria-hidden': 'true', vars: { '--pct': (d.total ? (used / d.total) * 100 : 0) + '%' } }, h('span', { class: 'bar-fill' })),
    h('button', { class: 'btn', type: 'button', onclick: () => ctx.startScan(d.root) }, icon('search'), t('summary.scanDrive', { drive: d.root.slice(0, 2) })));
}

export function renderCleanupHome(ctx) {
  const data = ctx.state.cleanup;
  const root = h('section', { class: 'view', 'aria-labelledby': 'view-title' });
  root.append(h('h1', { id: 'view-title', tabindex: '-1' }, t('nav.cleanup')));
  if (!data) { root.append(measureBanner(ctx)); return root; }
  const cats = data.categories.filter((c) => c.items.length);
  root.append(cats.length ? categoryRows(ctx, cats) : h('p', { class: 'muted' }, t('summary.nothing')));
  root.append(h('p', null, h('a', { class: 'btn', href: '#/large' }, icon('file'), t('nav.large'))));
  return root;
}
