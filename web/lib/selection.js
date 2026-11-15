// Seleção acumulada entre categorias e regras do modal de confirmação.
// O servidor decide de verdade; isto só evita pedir o que ele recusaria.

export function indexItems(categories) {
  const map = new Map();
  for (const c of categories || []) {
    for (const item of c.items || []) map.set(item.id, { item, category: c });
  }
  return map;
}

export function isSelectable(item) {
  return (item.action === 'clean' || item.action === 'admin') && item.risk !== 'high' && !item.protected;
}

/** Pré-seleção do CTA: risco baixo, ação clean, sem admin, e nunca Downloads. */
export function safePreselect(categories) {
  const ids = [];
  for (const c of categories || []) {
    if (c.id === 'downloads') continue;
    for (const it of c.items || []) {
      if (it.risk === 'low' && it.action === 'clean' && !it.needsAdmin) ids.push(it.id);
    }
  }
  return ids;
}

export function canChooseMode(item) {
  return item.regenerable === true && item.action === 'clean';
}

export function createSelection() {
  const modes = new Map(); // id -> 'trash' | 'delete'
  return {
    has: (id) => modes.has(id),
    add(id) { if (!modes.has(id)) modes.set(id, 'trash'); },
    remove(id) { modes.delete(id); },
    toggle(id) { if (modes.has(id)) modes.delete(id); else modes.set(id, 'trash'); return modes.has(id); },
    clear() { modes.clear(); },
    replace(ids) { modes.clear(); for (const id of ids) modes.set(id, 'trash'); },
    setMode(id, mode) { if (modes.has(id)) modes.set(id, mode === 'delete' ? 'delete' : 'trash'); },
    rawMode: (id) => modes.get(id),
    ids: () => [...modes.keys()],
    get size() { return modes.size; },
    /** Remove ids que não existem mais ou deixaram de ser selecionáveis. */
    reconcile(index) {
      for (const id of [...modes.keys()]) {
        const e = index.get(id);
        if (!e || !isSelectable(e.item)) modes.delete(id);
      }
    },
  };
}

export function modeOf(selection, item) {
  return canChooseMode(item) && selection.rawMode(item.id) === 'delete' ? 'delete' : 'trash';
}

export function isPermanent(selection, item) {
  return item.permanent === true || modeOf(selection, item) === 'delete';
}

export function selectionTotals(selection, index) {
  let count = 0, size = 0;
  for (const id of selection.ids()) {
    const e = index.get(id);
    if (!e) continue;
    count++; size += e.item.size || 0;
  }
  return { count, size };
}

/** Modelo do modal: grupos por categoria (sem admin), seção admin e flags. */
export function buildModel(selection, categories) {
  const groups = [];
  const admin = { items: [], subtotal: 0 };
  let count = 0, total = 0, needsAck = false;
  for (const c of categories || []) {
    const lines = [];
    for (const item of c.items || []) {
      if (!selection.has(item.id) || !isSelectable(item)) continue;
      count++; total += item.size || 0;
      if (item.risk === 'medium' || isPermanent(selection, item)) needsAck = true;
      const line = {
        item,
        mode: modeOf(selection, item),
        permanent: isPermanent(selection, item),
        canChoose: canChooseMode(item),
      };
      if (item.needsAdmin || item.action === 'admin') {
        admin.items.push({ ...line, category: c });
        admin.subtotal += item.size || 0;
      } else lines.push(line);
    }
    if (lines.length) {
      groups.push({ category: c, lines, subtotal: lines.reduce((s, l) => s + (l.item.size || 0), 0) });
    }
  }
  return { groups, admin, count, total, needsAck };
}

export function canConfirm(model, ack) {
  return model.count > 0 && (!model.needsAck || ack === true);
}

export function buildRequest(selection, index) {
  const items = [];
  for (const id of selection.ids()) {
    const e = index.get(id);
    if (!e || !isSelectable(e.item)) continue;
    const x = { id, mode: modeOf(selection, e.item) };
    // o modal já avisou "Apaga de vez"; sem isso o servidor recusa (would-be-permanent)
    if (isPermanent(selection, e.item)) x.confirmPermanent = true;
    items.push(x);
  }
  return items;
}
