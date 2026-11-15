// Aplica o tema salvo antes de pintar, para não piscar.
try {
  const saved = localStorage.getItem('folga.theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch { /* sem localStorage */ }
