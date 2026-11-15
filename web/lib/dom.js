// Helper mínimo para montar DOM sem innerHTML e sem estilos inline (CSP).
const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPS = new Set(['checked', 'value', 'disabled', 'open', 'selected', 'indeterminate', 'textContent']);

export function h(tag, props, ...kids) {
  const svg = tag.startsWith('svg:');
  const el = svg ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'vars') for (const [n, val] of Object.entries(v)) el.style.setProperty(n, String(val));
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const PATHS = {
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  'check-circle': ['M8.5 12.5l2.5 2.5 4.5-5', 'M12 3a9 9 0 100 18 9 9 0 000-18z'],
  'alert-triangle': ['M12 3.5L2.5 20h19L12 3.5z', 'M12 10v4.5', 'M12 17.5v.01'],
  'octagon-x': ['M8 3h8l5 5v8l-5 5H8l-5-5V8z', 'M9.5 9.5l5 5', 'M14.5 9.5l-5 5'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  flame: ['M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z'],
  folder: ['M3 6h6l2 2h10v11H3z'],
  sun: ['M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5'],
  moon: ['M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z'],
  copy: ['M9 9h11v11H9z', 'M5 15V4h11'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  up: ['M12 19V6', 'M6 11l6-6 6 6'],
  refresh: ['M20 11a8 8 0 10-2.3 6.3', 'M20 4v7h-7'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10'],
  pie: ['M12 3v9h9', 'M20.5 15A9 9 0 1112 3'],
  broom: ['M14 3l7 7', 'M4 20l6-6', 'M10 14l-6 6 4-1 5-5z', 'M9 9l6 6'],
  search: ['M11 4a7 7 0 100 14 7 7 0 000-14z', 'M16 16l5 5'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'],
  lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 018 0v3'],
  info: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 11v6', 'M12 7.5v.01'],
  list: ['M8 6h12M8 12h12M8 18h12', 'M4 6v.01M4 12v.01M4 18v.01'],
};

export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', ('icon ' + cls).trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of PATHS[name] || []) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}
