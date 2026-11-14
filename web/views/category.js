import { h, icon } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { formatBytes, formatRelative } from '../lib/format.js';
import { itemCard, riskBadge, guidedActions, stepsDetails, detailsBlock, lastUsedLine } from './parts.js';
import { isSelectable } from '../lib/selection.js';

export function renderCategory(ctx, id) {
  const cat = ctx.state.cleanup?.categories.find((c) => c.id === id && c.items.length);
  const root = h('section', { class: 'view', 'aria-labelledby': 'view-title' });
  if (!cat) {
    root.append(h('h1', { id: 'view-title', tabindex: '-1' }, t(ctx.state.cleanup ? 'category.empty' : 'summary.loading')));
    root.append(h('a', { class: 'btn', href: '#/summary' }, t('nav.summary')));
    return root;
  }
  root.append(h('h1', { id: 'view-title', tabindex: '-1' }, cat.name), h('p', { class: 'muted num' }, t('category.total', { size: formatBytes(cat.size), n: cat.items.length })));
  const safe = cat.items.filter((i) => i.risk === 'low' && i.action === 'clean' && !i.needsAdmin);
  if (safe.length && cat.id !== 'downloads') {
    root.append(h('p', null, h('button', {
      class: 'btn', type: 'button',
      onclick: () => {
        safe.forEach((i) => ctx.selection.add(i.id));
        ctx.updateSelBar();
        root.querySelectorAll('input.chk').forEach((c) => { c.checked = ctx.selection.has(c.dataset.item); });
      },
    }, icon('check-circle'), t('category.selectSafe', { n: safe.length }))));
  }
  if (cat.id === 'games') root.append(gamesTable(ctx, cat));
  else if (cat.id === 'dev') root.append(devGroups(ctx, cat));
  else root.append(h('ul', { class: 'cards' }, cat.items.map((i) => itemCard(ctx, i))));
  return root;
}

function devGroups(ctx, cat) {
  const groups = new Map();
  for (const it of cat.items) {
    const key = it.project ? it.project.root : '';
    if (!groups.has(key)) groups.set(key, { project: it.project, items: [] });
    groups.get(key).items.push(it);
  }
  const ordered = [...groups.values()].sort((a, b) => (a.project ? 0 : 1) - (b.project ? 0 : 1));
  return h('div', null, ordered.map((g) => {
    const size = g.items.reduce((s, i) => s + i.size, 0);
    return h('section', { class: 'group', 'aria-label': g.project ? g.project.name : t('category.devCaches') },
      h('h2', { class: 'group-title' },
        h('span', null, g.project ? g.project.name : t('category.devCaches')),
        h('span', { class: 'num muted' }, formatBytes(size))),
      g.project ? h('p', { class: 'muted small' }, t('category.projectTouched', { when: formatRelative(g.project.lastTouched) }), ' ', h('code', { class: 'path', title: g.project.root }, g.project.root)) : null,
      h('ul', { class: 'cards' }, g.items.map((i) => itemCard(ctx, i))));
  }));
}

function gamesTable(ctx, cat) {
  const rows = cat.items.slice().sort((a, b) => b.size - a.size);
  return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
    h('caption', { class: 'sr' }, cat.name),
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, t('games.game')),
      h('th', { scope: 'col', class: 'r' }, t('games.size')),
      h('th', { scope: 'col' }, t('games.lastPlayed')),
      h('th', { scope: 'col', class: 'col-lib' }, t('games.library')),
      h('th', { scope: 'col' }, t('games.actions')))),
    h('tbody', null, rows.map((i) => h('tr', { 'data-item': i.id },
      h('th', { scope: 'row', class: 'game-name' }, i.name, h('div', { class: 'item-badges' }, riskBadge(i.risk)),
        h('p', { class: 'small muted' }, h('strong', null, t('item.whatLabel') + ' '), i.whatItIs),
        h('p', { class: 'small muted' }, h('strong', null, t('item.afterLabel') + ' '), i.afterCleaning)),
      h('td', { class: 'num r' }, formatBytes(i.size)),
      h('td', null, i.game?.lastPlayed ? formatRelative(i.game.lastPlayed) : t('item.neverPlayedShort')),
      h('td', { class: 'col-lib' }, h('code', { class: 'path', title: i.game?.library }, i.game?.library || '')),
      h('td', null, h('div', { class: 'item-actions' }, guidedActions(ctx, i), stepsDetails(i)), detailsBlock(i)))))));
}
