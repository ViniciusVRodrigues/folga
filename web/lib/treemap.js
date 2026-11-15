// Treemap "squarified" (Bruls, Huizing, van Wijk, 2000). Puro, sem DOM.
function worst(row, side) {
  let sum = 0, max = -Infinity, min = Infinity;
  for (const a of row) { sum += a; if (a > max) max = a; if (a < min) min = a; }
  const s2 = side * side, t2 = sum * sum;
  return Math.max((s2 * max) / t2, t2 / (s2 * min));
}

/**
 * @param {{value:number}[]} items valores > 0 (os demais são descartados)
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns cada item com x, y, w, h; a soma das áreas é a área de rect
 */
export function squarify(items, rect) {
  const list = items.filter((i) => i && i.value > 0).sort((a, b) => b.value - a.value);
  const { x, y, w, h } = rect;
  if (!list.length || !(w > 0) || !(h > 0)) return [];
  const total = list.reduce((s, i) => s + i.value, 0);
  const k = (w * h) / total;
  const areas = list.map((i) => i.value * k);
  const out = [];
  let cx = x, cy = y, cw = w, ch = h;
  let i = 0;
  while (i < list.length) {
    const side = Math.min(cw, ch);
    const row = [areas[i]];
    let j = i + 1;
    while (j < list.length && worst([...row, areas[j]], side) <= worst(row, side)) {
      row.push(areas[j]); j++;
    }
    const sum = row.reduce((s, a) => s + a, 0);
    const last = j >= list.length;
    if (cw >= ch) {
      const rw = last ? cw : sum / ch;
      let yy = cy;
      row.forEach((a, n) => {
        const rh = n === row.length - 1 ? cy + ch - yy : a / rw;
        out.push({ ...list[i + n], x: cx, y: yy, w: rw, h: rh });
        yy += rh;
      });
      cx += rw; cw -= rw;
    } else {
      const rh = last ? ch : sum / cw;
      let xx = cx;
      row.forEach((a, n) => {
        const rw = n === row.length - 1 ? cx + cw - xx : a / rh;
        out.push({ ...list[i + n], x: xx, y: cy, w: rw, h: rh });
        xx += rw;
      });
      cy += rh; ch -= rh;
    }
    i = j;
  }
  return out;
}

/** Junta em "resto" o que ocuparia menos de `minFraction` do total. */
export function groupSmall(items, minFraction = 0.004) {
  const total = items.reduce((s, i) => s + (i.value > 0 ? i.value : 0), 0);
  if (!total) return { items: [], rest: { count: 0, value: 0 } };
  const keep = [];
  const rest = { count: 0, value: 0 };
  for (const it of items) {
    if (!(it.value > 0)) continue;
    if (it.value / total < minFraction) { rest.count++; rest.value += it.value; } else keep.push(it);
  }
  return { items: keep, rest };
}
