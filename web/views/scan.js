import { h, icon, clear } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { formatBytes, formatDate, middleEllipsis } from '../lib/format.js';
import { driveCard } from './summary.js';

export function renderScan(ctx) {
  const root = h('section', { class: 'view', 'aria-labelledby': 'view-title' });
  root.append(h('h1', { id: 'view-title', tabindex: '-1' }, t('scan.title')));
  const d = ctx.state.drives;
  if (ctx.state.scan.status === 'running') root.append(h('p', { class: 'banner', role: 'status' }, icon('info'), h('span', null, t('scan.busy'), ' ', h('a', { href: '#/map' }, t('nav.map')))));
  root.append(h('h2', null, t('scan.drives')));
  root.append(d ? h('div', { class: 'drive-grid' }, d.drives.map((x) => driveCard(ctx, x))) : h('p', { class: 'muted' }, t('summary.loading')));
  const input = h('input', { id: 'scan-path', class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false', value: d?.home || 'C:\\', 'aria-describedby': 'scan-help' });
  const err = h('p', { class: 'error', role: 'alert' });
  const form = h('form', {
    class: 'path-form',
    onsubmit: async (e) => {
      e.preventDefault();
      clear(err);
      const msg = await ctx.startScan(input.value.trim());
      if (msg) err.textContent = msg;
    },
  },
    h('label', { for: 'scan-path' }, t('scan.pathLabel')),
    h('div', { class: 'path-row' }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, icon('search'), t('scan.go'))),
    h('p', { id: 'scan-help', class: 'muted small' }, t('scan.pathHelp')), err);
  root.append(h('h2', null, t('scan.folder')), form);
  if (d?.shortcuts?.length) {
    root.append(h('h2', null, t('scan.shortcuts')), h('ul', { class: 'shortcuts' }, d.shortcuts.map((s) => h('li', null,
      h('button', { class: 'btn', type: 'button', onclick: () => { input.value = s.path; input.focus(); } }, icon('folder'), s.label, ' ', h('code', { class: 'path', title: s.path }, middleEllipsis(s.path, 28)))))));
  }
  return root;
}

export function renderLarge(ctx) {
  const root = h('section', { class: 'view', 'aria-labelledby': 'view-title' });
  root.append(h('h1', { id: 'view-title', tabindex: '-1' }, t('large.title')));
  if (ctx.state.scan.status !== 'done') {
    root.append(h('div', { class: 'card empty' }, h('p', null, t('large.needScan')), h('a', { class: 'btn btn-primary', href: '#/scan' }, icon('search'), t('nav.scan'))));
    return root;
  }
  const mins = [[500 * 1024 ** 2, '500 MB'], [1024 ** 3, '1 GB'], [5 * 1024 ** 3, '5 GB']];
  const out = h('div', { 'aria-live': 'off' });
  const sel = h('select', { id: 'large-min', class: 'input', onchange: () => load() }, mins.map(([v, l]) => h('option', { value: v }, l)));
  root.append(h('div', { class: 'toolbar' }, h('label', { for: 'large-min' }, t('large.min')), sel), out);
  let mounted = true;
  ctx.cleanups.push(() => { mounted = false; });
  async function load() {
    try {
      const { files } = await ctx.api.largeFiles(Number(sel.value));
      if (!mounted) return;
      clear(out);
      if (!files.length) { out.append(h('p', { class: 'muted' }, t('large.none'))); return; }
      out.append(h('p', { class: 'muted' }, t('large.hint')), h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('caption', { class: 'sr' }, t('large.title')),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('large.file')), h('th', { scope: 'col', class: 'r' }, t('games.size')), h('th', { scope: 'col' }, t('large.modified')), h('th', { scope: 'col' }, t('games.actions')))),
        h('tbody', null, files.map((f) => h('tr', null,
          h('th', { scope: 'row' }, h('code', { class: 'path', title: f.path }, middleEllipsis(f.path, 52))),
          h('td', { class: 'num r' }, formatBytes(f.size)),
          h('td', null, formatDate(f.mtime)),
          h('td', null, h('button', { class: 'btn', type: 'button', onclick: (e) => ctx.copyText(f.path, e.currentTarget, 'item.copyPath') }, icon('copy'), t('item.copyPath')))))))));
    } catch (e) {
      if (mounted) clear(out).append(h('p', { class: 'error', role: 'alert' }, e.message));
    }
  }
  load();
  return root;
}
