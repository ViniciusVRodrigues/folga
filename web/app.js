import { createApi } from './lib/api.js';
import { createMockApi } from './lib/mock-api.js';
import { h, icon, clear, append } from './lib/dom.js';
import { t } from './i18n/index.js';
import { formatBytes } from './lib/format.js';
import { measureFraction } from './lib/measure.js';
import { measureText } from './views/parts.js';
import { createSelection, indexItems, selectionTotals } from './lib/selection.js';
import { createAnnouncer } from './lib/live.js';
import { renderSummary, renderCleanupHome } from './views/summary.js';
import { renderMap } from './views/map.js';
import { renderCategory } from './views/category.js';
import { renderScan, renderLarge } from './views/scan.js';
import { renderClean } from './views/clean.js';
import { openCleanModal, confirmDialog } from './views/modal.js';

// ---------- token ----------
function readToken() {
  const m = /(?:^#|&)t=([^&]+)/.exec(location.hash);
  let tok = m ? decodeURIComponent(m[1]) : null;
  if (tok) {
    try { sessionStorage.setItem('folga.t', tok); } catch { /* sem sessionStorage */ }
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    try { tok = sessionStorage.getItem('folga.t'); } catch { tok = null; }
  }
  return tok;
}

const query = new URLSearchParams(location.search);
const token = readToken();
const useMock = !token && query.get('mock') === '1';
const api = token ? createApi(token) : useMock ? createMockApi({ adminDeclined: query.get('admin') === 'declined' }) : null;

// ---------- tema ----------
function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
}
function effectiveTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
}
function toggleTheme() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('folga.theme', next); } catch { /* sem localStorage */ }
  renderTop();
}

// ---------- estado ----------
const app = document.getElementById('app');
const mainEl = document.getElementById('main');
const navEl = document.getElementById('nav');
const topEl = document.getElementById('top');
const selbarEl = document.getElementById('selbar');
const toastEl = document.getElementById('toast');
const announcer = createAnnouncer(document.getElementById('live'));

const selection = createSelection();
const ctx = {
  api,
  selection,
  index: new Map(),
  cleanups: [],
  view: {},
  state: {
    route: 'summary', param: null, cleanup: null, cleanupError: false, measure: null, drives: null, job: null,
    scan: { status: 'idle', path: null, rootPath: null, progress: null, partial: false, unreadable: 0, error: null },
    mapPath: null, mapView: 'list',
  },
  announce: (m) => announcer.announce(m),
};

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.textContent = ''; }, 6000);
}
ctx.toast = toast;

// ---------- roteamento ----------
function parseRoute() {
  const [r, p] = (location.hash.replace(/^#\/?/, '') || 'summary').split('/');
  const known = ['summary', 'cleanup', 'map', 'cat', 'large', 'scan', 'clean'];
  return { route: known.includes(r) ? r : 'summary', param: p || null };
}

ctx.navigate = (hash) => { if (location.hash === hash) ctx.render({ focus: true }); else location.hash = hash; };

ctx.render = ({ focus = false } = {}) => {
  for (const fn of ctx.cleanups.splice(0)) fn();
  ctx.view = {};
  const { route, param } = ctx.state;
  const views = {
    summary: () => renderSummary(ctx), cleanup: () => renderCleanupHome(ctx), map: () => renderMap(ctx),
    cat: () => renderCategory(ctx, param), large: () => renderLarge(ctx), scan: () => renderScan(ctx), clean: () => renderClean(ctx),
  };
  const el = views[route]();
  clear(mainEl).append(el);
  const title = el.querySelector('#view-title');
  document.title = (title ? title.textContent + ' · ' : '') + t('app.title');
  renderNav();
  if (focus && title) title.focus({ preventScroll: false });
  if (focus) window.scrollTo(0, 0);
};

function onRoute() {
  Object.assign(ctx.state, parseRoute());
  if (ctx.state.route === 'map') ctx.syncScan();
  ctx.render({ focus: true });
}

// ---------- navegação ----------
function renderTop() {
  const dark = effectiveTheme() === 'dark';
  append(clear(topEl), [
    h('span', { class: 'brand' }, icon('broom'), t('app.name')),
    api?.mock ? h('span', { class: 'badge risk-medium mock-badge' }, t('app.mock')) : null,
    h('button', { class: 'btn btn-icon', type: 'button', onclick: toggleTheme, 'aria-label': t(dark ? 'theme.toLight' : 'theme.toDark') }, icon(dark ? 'sun' : 'moon'))]);
}

function renderNav() {
  const { route, param } = ctx.state;
  const cur = (r) => (route === r ? 'page' : null);
  const cats = (ctx.state.cleanup?.categories || []).filter((c) => c.items.length);
  const link = (href, ic, label, current, cls = '', extra = null) =>
    h('a', { class: 'nav-link ' + cls, href, 'aria-current': current }, icon(ic), h('span', { class: 'nav-label' }, label), extra);
  clear(navEl).append(h('ul', { class: 'nav-list' },
    h('li', null, link('#/summary', 'home', t('nav.summary'), cur('summary'))),
    h('li', null, link('#/map', 'pie', t('nav.map'), cur('map'))),
    h('li', { class: 'only-narrow' }, link('#/cleanup', 'broom', t('nav.cleanup'), route === 'cleanup' || route === 'cat' || route === 'large' || route === 'clean' ? 'page' : null)),
    h('li', { class: 'only-wide nav-section' },
      h('p', { class: 'nav-heading' }, t('nav.cleanup')),
      h('ul', null, cats.map((c) => h('li', null, link('#/cat/' + c.id, 'folder', c.name, route === 'cat' && param === c.id ? 'page' : null, 'nav-sub', h('span', { class: 'num nav-size' }, formatBytes(c.size))))))),
    h('li', { class: 'only-wide' }, link('#/large', 'file', t('nav.large'), cur('large'))),
    h('li', null, link('#/scan', 'search', t('nav.scan'), cur('scan')))));
}

// ---------- barra de seleção ----------
ctx.updateSelBar = () => {
  clear(selbarEl);
  const { count, size } = selectionTotals(selection, ctx.index);
  selbarEl.hidden = count === 0;
  if (!count) return;
  selbarEl.append(h('div', { class: 'selbar-in', role: 'region', 'aria-label': t('selbar.label') },
    h('span', { class: 'selbar-text num' }, t('selbar.summary', { n: count, size: formatBytes(size) })),
    h('button', { class: 'btn', type: 'button', onclick: () => { selection.clear(); ctx.updateSelBar(); mainEl.querySelectorAll('input.chk').forEach((c) => { c.checked = false; }); } }, t('selbar.clear')),
    h('button', { class: 'btn btn-danger', type: 'button', onclick: (e) => ctx.openModal(e.currentTarget) }, icon('trash'), t('selbar.go'))));
};

ctx.openModal = (origin) => openCleanModal(ctx, origin);

// ---------- dados ----------
// O servidor só entrega o catálogo quando termina de medir (GET dá 409 NO_SCAN antes disso).
// Por isso: pedimos a medição (POST refresh), mostramos "Medindo… N de M" pelos eventos
// cleanup-progress e buscamos o resultado em cleanup-done (com um sondador de reserva).
let measurePoll = null;
function stopMeasurePoll() { clearInterval(measurePoll); measurePoll = null; }

ctx.updateMeasure = () => {
  const p = ctx.state.measure;
  for (const el of mainEl.querySelectorAll('[data-measure]')) {
    el.querySelector('.measure-text').textContent = measureText(p);
    el.querySelector('.bar').style.setProperty('--pct', measureFraction(p) * 100 + '%');
  }
  if (p?.total) ctx.announce(measureText(p));
};

async function loadCleanup(silent) {
  try {
    const d = await api.cleanup();
    ctx.state.cleanup = d;
    ctx.state.cleanupError = false;
    ctx.index = indexItems(d.categories);
    selection.reconcile(ctx.index);
    return d;
  } catch (e) {
    if (!silent && e.code !== 'NO_SCAN') ctx.state.cleanupError = true;
    return null;
  }
}

function paintCleanup() {
  ctx.updateSelBar();
  if (['summary', 'cleanup', 'cat'].includes(ctx.state.route)) ctx.render();
  else renderNav();
}

ctx.refreshCleanup = async (remeasure = false, silent = false) => {
  if (remeasure) {
    if (ctx.state.measure) return;
    try {
      await api.cleanupRefresh();
    } catch {
      if (!silent) { ctx.state.cleanupError = true; paintCleanup(); }
      return;
    }
    ctx.state.cleanupError = false;
    ctx.state.measure = { done: 0, total: 0 };
    stopMeasurePoll();
    measurePoll = setInterval(async () => {
      const d = await loadCleanup(true);
      if (d && !d.categories.some((c) => c.scanning)) finishMeasure();
    }, 5000);
    paintCleanup();
    return;
  }
  await loadCleanup(silent);
  paintCleanup();
};

async function finishMeasure(failed = false) {
  if (!ctx.state.measure) return;
  stopMeasurePoll();
  ctx.state.measure = null;
  await loadCleanup(false);
  if (!ctx.state.cleanup || failed) ctx.state.cleanupError = true;
  paintCleanup();
}

ctx.refreshDrives = async () => {
  try { ctx.state.drives = await api.drives(); } catch { /* sem unidades */ }
  if (['summary', 'scan', 'map'].includes(ctx.state.route)) ctx.render();
};

// Depois de um reload: o servidor pode estar medindo o catálogo ou ter uma varredura pronta.
async function resumeServerState() {
  try {
    const m = await api.cleanupStatus();
    if (m.running && !ctx.state.measure) {
      ctx.state.measure = { done: m.progress?.done || 0, total: m.progress?.total || 0, pending: m.progress?.pending || [] };
      stopMeasurePoll();
      measurePoll = setInterval(async () => {
        const st = await api.cleanupStatus().catch(() => null);
        if (st && !st.running) finishMeasure(!!st.error);
      }, 5000);
      paintCleanup();
    }
  } catch { /* servidor antigo: segue sem */ }
}

ctx.syncScan = async () => {
  if (ctx.state.scan.status !== 'idle') return;
  try {
    const st = await api.scanStatus();
    if (st.state === 'idle' || ctx.state.scan.status !== 'idle') return;
    ctx.state.scan = {
      status: st.state, path: st.root, rootPath: st.root, progress: st.progress, partial: !!st.partial,
      unreadable: st.progress?.unreadable || 0, error: null,
    };
    if (ctx.state.route === 'map') ctx.render();
  } catch { /* sem estado de varredura */ }
};

// ---------- varredura ----------
ctx.startScan = async (path) => {
  try {
    await api.scan(path);
  } catch (e) {
    const msg = e.code === 'SCAN_RUNNING' ? t('error.scanRunning') : e.code === 'BAD_REQUEST' ? t('error.badPath') : e.message;
    toast(msg);
    return msg;
  }
  ctx.state.scan = { status: 'running', path, rootPath: path, progress: null, partial: false, unreadable: 0, error: null };
  ctx.state.mapPath = null;
  ctx.navigate('#/map');
  return null;
};

ctx.cancelScan = async () => {
  try { await api.cancelScan(); } catch (e) { toast(e.message); }
};

// ---------- ações de itens ----------
ctx.copyText = async (text, btn, key) => {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('item.copied'));
    if (btn) { btn.dataset.copied = '1'; setTimeout(() => delete btn.dataset.copied, 1500); }
  } catch { toast(t('item.copyFailed')); }
};

ctx.openItem = async (item, kind) => {
  try { await api.open(item.id, kind); toast(t('item.opened')); } catch (e) { toast(e.message); }
};

ctx.emptyBin = async (btn, job) => {
  const ok = await confirmDialog({ title: t('bin.title'), text: t('bin.text'), confirmLabel: t('bin.confirm'), origin: btn });
  if (!ok) return;
  try {
    const { freed } = await api.emptyBin();
    toast(t('clean.binEmptied', { size: formatBytes(freed) }));
    if (job) {
      job.binEmptied = freed;
      if (job.result?.drive) job.result.drive.free += freed;
      ctx.render();
    }
    ctx.refreshCleanup(false, true);
    ctx.state.drives = await api.drives().catch(() => ctx.state.drives);
  } catch (e) { toast(e.message); }
};

// ---------- limpeza ----------
ctx.startClean = async (items) => {
  const meta = new Map();
  for (const x of items) {
    const e = ctx.index.get(x.id);
    if (e) meta.set(x.id, { name: e.item.name, project: e.item.project && !e.item.name.includes(e.item.project.name) ? e.item.project.name : null, size: e.item.size, mode: x.mode, needsAdmin: e.item.needsAdmin });
  }
  try {
    const r = await api.clean(items);
    ctx.state.job = { jobId: r.jobId, plan: r.plan, meta, status: new Map(), result: null, binEmptied: 0 };
    ctx.navigate('#/clean');
  } catch (e) {
    toast(e.code === 'STALE_ITEM' ? t('error.stale') : e.message);
    if (e.code === 'STALE_ITEM') ctx.refreshCleanup(true);
  }
};

ctx.retry = (ids, job) => ctx.startClean(ids.map((id) => ({ id, mode: job.meta.get(id)?.mode || 'trash' })));
ctx.drop = (meta) => { for (const id of meta.keys()) selection.remove(id); ctx.updateSelBar(); };

// ---------- eventos do servidor ----------
function onEvent(name, d) {
  const s = ctx.state.scan;
  if (name === 'scan-progress') s.progress = d;
  if (name === 'scan-done') {
    s.status = 'done'; s.partial = !!d.partial; s.unreadable = d.unreadable || 0; s.progress = d;
    ctx.announce(t(d.partial ? 'scan.donePartial' : 'scan.done'));
    if (ctx.state.route === 'map') ctx.render();
  }
  if (name === 'cleanup-progress' && ctx.state.measure) { ctx.state.measure = { done: d.done, total: d.total, pending: d.pending || [] }; ctx.updateMeasure(); }
  if (name === 'cleanup-done') {
    const failed = d && d.ok === false;
    if (failed) toast(t('error.measureFailed', { msg: d.error || '' }));
    if (ctx.state.measure) finishMeasure(failed);
    else ctx.refreshCleanup(false, true);
  }
  ctx.view.onEvent?.(name, d);
}

// ---------- início ----------
function showNoToken() {
  clear(mainEl).append(h('section', { class: 'view' }, h('h1', { id: 'view-title', tabindex: '-1' }, t('noToken.title')), h('p', null, t('noToken.text'))));
  navEl.hidden = true;
}

function start() {
  renderTop();
  if (!api) { showNoToken(); return; }
  window.addEventListener('hashchange', onRoute);
  api.events(onEvent);
  Object.assign(ctx.state, parseRoute());
  ctx.render();
  ctx.updateSelBar();
  ctx.refreshDrives();
  ctx.syncScan();
  // mostra o que o servidor já tem (se tiver) e pede uma medição nova por cima
  resumeServerState().then(() => ctx.refreshCleanup(false, true)).then(() => ctx.refreshCleanup(true));
}

start();
