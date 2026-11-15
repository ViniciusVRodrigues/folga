// Formatação pt-BR: bytes (base 1024), datas relativas e caminhos longos.
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
const DAY = 86400000;

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const dtf = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

export function formatInt(n) {
  return nf0.format(Number.isFinite(n) ? n : 0);
}

export function formatBytes(n) {
  let v = Number.isFinite(n) && n > 0 ? n : 0;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++; }
  let f = i === 0 || v >= 100 ? nf0 : nf1;
  // 1023,96 KB arredonda para 1024: promove para a unidade seguinte.
  if (i < UNITS.length - 1 && Number(v.toFixed(f === nf0 ? 0 : 1)) >= 1024) {
    v /= 1024; i++; f = nf1;
  }
  return f.format(v) + ' ' + UNITS[i];
}

export function formatPercent(fraction) {
  return pct.format(Number.isFinite(fraction) ? fraction : 0);
}

export function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dtf.format(d);
}

export function formatRelative(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const days = Math.max(0, Math.floor((now - t) / DAY));
  if (days < 30) return rtf.format(-days, 'day');
  if (days < 365) return rtf.format(-Math.floor(days / 30.44), 'month');
  return rtf.format(-Math.floor(days / 365.25), 'year');
}

// Mantém o começo e o fim do caminho, com elipse no meio.
export function middleEllipsis(s, max = 48) {
  const str = String(s ?? '');
  if (str.length <= max || max < 5) return str;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return str.slice(0, head) + '…' + str.slice(str.length - tail);
}

export function baseName(p) {
  const parts = String(p).split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(p);
}
