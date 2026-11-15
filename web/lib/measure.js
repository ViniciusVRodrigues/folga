// Progresso da medição do catálogo (evento cleanup-progress: { category, done, total }).
export function measureFraction(p) {
  if (!p || !p.total) return 0;
  return Math.max(0, Math.min(1, p.done / p.total));
}
