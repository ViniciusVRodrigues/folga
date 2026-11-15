// "O que pesa": treemap squarified em SVG sincronizado com a lista.
import { h, icon, clear } from '../lib/dom.js';
import { t } from '../i18n/index.js';
import { formatBytes, formatInt, formatPercent, middleEllipsis } from '../lib/format.js';
import { squarify, groupSmall } from '../lib/treemap.js';

const LIMIT = 200;

export function crumbs(rootPath, path) {
  const base = rootPath.replace(/\\+$/, '');
  const list = [{ label: rootPath.length <= 3 ? rootPath : base.split('\\').pop(), path: rootPath }];
  const rest = path.slice(base.length).split('\\').filter(Boolean);
  let cur = base;
  for (const part of rest) { cur += '\\' + part; list.push({ label: part, path: cur }); }
  return list;
}

export function renderMap(ctx) {
  const scan = ctx.state.scan;
  const root = h('section', { class: 'view view-map', 'aria-labelledby': 'view-title' });
  root.append(h('h1', { id: 'view-title', tabindex: '-1' }, t('map.title')));
  if (scan.status === 'idle') return idle(ctx, root);
  if (scan.status === 'running') return running(ctx, root);
  return done(ctx, root);
}

function idle(ctx, root) {
  const scan = ctx.state.scan;
  const sys = (ctx.state.drives?.drives || []).find((d) => d.system);
  root.append(h('div', { class: 'card empty' },
    h('p', null, t('map.idle')),
    h('div', { class: 'item-actions' },
      sys ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.startScan(sys.root) }, icon('search'), t('map.scanDrive', { drive: sys.root.slice(0, 2) })) : null,
      h('a', { class: 'btn', href: '#/scan' }, icon('folder'), t('nav.scan')))));
  if (scan.error) root.append(h('p', { class: 'error', role: 'alert' }, scan.error));
  return root;
}

function running(ctx, root) {
  const p = ctx.state.scan.progress || {};
  const els = {
    files: h('dd', { class: 'num' }), dirs: h('dd', { class: 'num' }), bytes: h('dd', { class: 'num' }), unread: h('dd', { class: 'num' }),
    current: h('p', { class: 'path muted', 'aria-hidden': 'true' }),
  };
  const update = (d) => {
    els.files.textContent = formatInt(d.files || 0);
    els.dirs.textContent = formatInt(d.dirs || 0);
    els.bytes.textContent = formatBytes(d.bytes || 0);
    els.unread.textContent = formatInt(d.unreadable || 0);
    els.current.textContent = middleEllipsis(d.current || '', 60);
    els.current.title = d.current || '';
  };
  update(p);
  ctx.view.onEvent = (name, d) => { if (name === 'scan-progress') { update(d); ctx.announce(t('scan.live', { files: formatInt(d.files), bytes: formatBytes(d.bytes) })); } };
  root.append(h('div', { class: 'card scanning' },
    h('p', { class: 'scan-title', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('scan.running', { path: ctx.state.scan.path || '' })),
    h('dl', { class: 'counters' },
      h('div', null, h('dt', null, t('scan.files')), els.files), h('div', null, h('dt', null, t('scan.dirs')), els.dirs),
      h('div', null, h('dt', null, t('scan.bytes')), els.bytes), h('div', null, h('dt', null, t('scan.unreadable')), els.unread)),
    els.current,
    h('button', { class: 'btn', type: 'button', onclick: () => ctx.cancelScan() }, icon('x'), t('action.cancel'))));
  return root;
}

function done(ctx, root) {
  const scan = ctx.state.scan;
  const cur = { path: ctx.state.mapPath || scan.rootPath, data: null, active: null, view: ctx.state.mapView || 'list' };
  const body = h('div', { class: 'map-body' });
  const bar = h('div', { class: 'map-bar' });
  root.append(bar, body);
  let mounted = true;
  ctx.cleanups.push(() => { mounted = false; });

  let firstLoad = true;
  async function load(path) {
    try {
      const data = await ctx.api.tree(path, LIMIT);
      if (!mounted) return;
      cur.data = data; cur.path = data.path; ctx.state.mapPath = data.path; cur.active = null;
      draw();
      // depois de entrar ou subir (teclado ou clique), o foco vai para o item ativo da nova pasta
      if (!firstLoad) (cur.view === 'map' ? body.querySelector('g.tile[tabindex="0"]') : body.querySelector('.row[tabindex="0"]'))?.focus({ preventScroll: true });
      firstLoad = false;
    } catch (e) {
      if (!mounted) return;
      if (e.code === 'NO_SCAN') { scan.status = 'idle'; ctx.render(); return; }
      clear(body).append(h('p', { class: 'error', role: 'alert' }, e.message));
    }
  }

  function toolbar() {
    const d = cur.data;
    clear(bar);
    bar.append(
      h('div', { class: 'crumb-row' },
        h('button', { class: 'btn', type: 'button', disabled: !d.parent, onclick: () => load(d.parent) }, icon('up'), t('map.up')),
        h('nav', { class: 'crumbs', 'aria-label': t('map.breadcrumb') }, h('ol', null, crumbs(scan.rootPath, d.path).map((c, i, all) =>
          h('li', null, i === all.length - 1
            ? h('span', { 'aria-current': 'page' }, c.label)
            : h('button', { class: 'crumb', type: 'button', onclick: () => load(c.path) }, c.label))))),
        h('button', { class: 'btn', type: 'button', onclick: () => ctx.startScan(scan.rootPath) }, icon('refresh'), t('map.rescan'))),
      h('div', { class: 'map-meta' },
        h('span', { class: 'num strong' }, t('map.folderTotal', { size: formatBytes(d.size) })),
        d.partial || scan.partial ? h('span', { class: 'badge risk-medium' }, icon('alert-triangle'), t('map.partial')) : null,
        d.noAccess ? h('span', { class: 'badge risk-high' }, icon('lock'), t('map.noAccess')) : null,
        scan.unreadable ? h('span', { class: 'muted small' }, t('map.unreadable', { n: scan.unreadable })) : null));
  }

  function draw() {
    const d = cur.data;
    toolbar();
    clear(body);
    const total = d.size || 1;
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('map.viewTabs') },
      tab('list', 'map.tabList'), tab('map', 'map.tabMap'));
    function tab(id, key) {
      return h('button', {
        class: 'tab', type: 'button', role: 'tab', id: 'tab-' + id, 'aria-selected': String(cur.view === id), 'aria-controls': 'pane-' + id,
        onclick: () => { cur.view = id; ctx.state.mapView = id; grid.dataset.view = id; tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.id === 'tab-' + id))); layout(); },
        onkeydown: (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); tabs.querySelector('#tab-' + (id === 'list' ? 'map' : 'list')).click(); tabs.querySelector('#tab-' + (id === 'list' ? 'map' : 'list')).focus(); } },
      }, t(key));
    }
    const entries = d.children;
    const rowEls = [];
    const list = h('ul', { class: 'tree-list', 'aria-label': t('map.listLabel') });
    entries.forEach((c, i) => {
      const isDir = c.type === 'dir';
      const row = h('li', {
        class: 'row' + (isDir ? ' row-dir' : ''), tabindex: i === 0 ? '0' : '-1', 'data-path': c.path,
        onclick: () => { if (isDir && !c.noAccess) load(c.path); else setActive(c.path); },
        onfocus: () => setActive(c.path, 'list'),
        onmouseenter: () => highlight(c.path),
        onmouseleave: () => highlight(null),
      },
        h('span', { class: 'row-name' }, icon(isDir ? 'folder' : 'file'), h('span', { class: 'row-label', title: c.path }, c.name),
          c.noAccess ? h('span', { class: 'badge risk-high' }, icon('lock'), t('map.noAccessShort')) : null),
        h('span', { class: 'num' }, formatBytes(c.size)),
        h('span', { class: 'num muted small' }, formatPercent(c.size / total)),
        h('span', { class: 'bar', 'aria-hidden': 'true', vars: { '--pct': Math.max(1, (c.size / total) * 100) + '%' } }, h('span', { class: 'bar-fill' })));
      rowEls.push(row); list.append(row);
    });
    if (d.more) list.append(h('li', { class: 'row-more muted' }, t('map.more', { n: d.more.count, size: formatBytes(d.more.size) })));
    if (!entries.length) list.append(h('li', { class: 'row-more muted' }, t('map.empty')));
    const listPane = h('div', { class: 'list-pane', id: 'pane-list', role: 'tabpanel', 'aria-labelledby': 'tab-list' }, list);
    const svgHost = h('div', { class: 'map-pane', id: 'pane-map', role: 'tabpanel', 'aria-labelledby': 'tab-map' });
    const grid = h('div', { class: 'map-grid', 'data-view': cur.view }, listPane, svgHost);
    body.append(tabs, grid);

    // --- sincronização lista <-> treemap ---
    let tileEls = [];
    function highlight(path) {
      for (const el of [...rowEls, ...tileEls]) el.classList.toggle('is-hover', path !== null && el.dataset.path === path);
    }
    function setActive(path, from) {
      cur.active = path;
      rowEls.forEach((r) => { const on = r.dataset.path === path; r.classList.toggle('is-active', on); r.tabIndex = on ? 0 : -1; });
      tileEls.forEach((g) => { const on = g.dataset.path === path; g.classList.toggle('is-active', on); g.setAttribute('tabindex', on ? '0' : '-1'); });
      if (from === 'tile') rowEls.find((r) => r.dataset.path === path)?.scrollIntoView({ block: 'nearest' });
    }
    const entryOf = (path) => entries.find((c) => c.path === path);
    function onKeys(els, e, focusPath) {
      const idx = els.findIndex((x) => x.dataset.path === cur.active);
      const go = (n) => { const el = els[Math.max(0, Math.min(els.length - 1, n))]; if (el) { e.preventDefault(); el.focus(); } };
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); if (d.parent) load(d.parent); } else go(idx - 1); }
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(els.length - 1);
      else if (e.key === 'Backspace') { e.preventDefault(); if (d.parent) load(d.parent); }
      else if (e.key === 'Enter' || e.key === ' ') {
        const c = entryOf(cur.active);
        if (c && c.type === 'dir' && !c.noAccess) { e.preventDefault(); load(c.path); }
      }
    }
    list.addEventListener('keydown', (e) => onKeys(rowEls, e));

    let lastW = 0;
    function layout() {
      const W = svgHost.clientWidth;
      if (!W || (W === lastW && tileEls.length)) return;
      lastW = W;
      const H = Math.max(240, Math.round(W * (W < 500 ? 0.9 : 0.66)));
      const items = entries.map((c) => ({ value: c.size, c }));
      if (d.more) items.push({ value: d.more.size, more: d.more });
      const grouped = groupSmall(items, 0.004);
      const tiles = squarify(grouped.items, { x: 0, y: 0, w: W, h: H });
      const rest = grouped.rest;
      const svg = h('svg:svg', { class: 'treemap', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': t('map.mapLabel') });
      tileEls = [];
      tiles.forEach((tl, i) => {
        if (tl.more) { svg.append(h('svg:g', { class: 'tile tile-more' }, h('svg:rect', { x: tl.x, y: tl.y, width: tl.w, height: tl.h }), label(tl, t('map.moreShort', { n: tl.more.count }), formatBytes(tl.value)))); return; }
        const c = tl.c;
        const g = h('svg:g', {
          class: 'tile ' + (c.type === 'dir' ? 'tile-dir' : 'tile-file') + (c.noAccess ? ' tile-noaccess' : ''), role: 'button',
          tabindex: (cur.active ? cur.active === c.path : tileEls.length === 0) ? '0' : '-1', 'data-path': c.path,
          'aria-label': t('map.tileLabel', { name: c.name, size: formatBytes(c.size), pct: formatPercent(c.size / total) }),
          onclick: () => { if (c.type === 'dir' && !c.noAccess) load(c.path); else setActive(c.path, 'tile'); },
          onfocus: () => setActive(c.path, 'tile'),
          onmouseenter: () => highlight(c.path), onmouseleave: () => highlight(null),
        }, h('svg:title', null, c.path),
          h('svg:rect', { x: tl.x + 0.5, y: tl.y + 0.5, width: Math.max(0, tl.w - 1), height: Math.max(0, tl.h - 1), 'fill-opacity': Math.max(0.35, 1 - i * 0.04) }),
          label(tl, c.name, formatBytes(c.size)));
        tileEls.push(g); svg.append(g);
      });
      svg.addEventListener('keydown', (e) => onKeys(tileEls, e));
      clear(svgHost).append(svg);
      // Fora do SVG: a legenda dos itens pequenos não pode ficar por cima de um bloco.
      if (rest.count) svgHost.append(h('p', { class: 'map-more muted' }, t('map.smallGrouped', { n: rest.count, size: formatBytes(rest.value) })));
      if (cur.active) setActive(cur.active);
    }
    function label(tl, name, size) {
      const g = h('svg:g', { class: 'tile-labels' });
      if (tl.w > 64 && tl.h > 34) {
        const max = Math.max(4, Math.floor((tl.w - 12) / 7));
        g.append(h('svg:text', { x: tl.x + 6, y: tl.y + 17, class: 'tile-text' }, middleEllipsis(name, max)));
        g.append(h('svg:text', { x: tl.x + 6, y: tl.y + 32, class: 'tile-text tile-size' }, size));
      }
      return g;
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(() => mounted && layout()));
    ro.observe(svgHost);
    ctx.cleanups.push(() => ro.disconnect());
    layout();
    if (!entries.length) return;
    cur.active = cur.active || entries[0].path;
  }

  load(cur.path);
  return root;
}
