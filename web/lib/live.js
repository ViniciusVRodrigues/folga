// Anunciador para aria-live: no máximo uma mutação a cada `interval` ms.
export function createAnnouncer(el, { interval = 2000, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let last = -Infinity;
  let pending = null;
  let timer = null;
  function flush() {
    timer = null;
    if (pending == null) return;
    el.textContent = pending;
    pending = null;
    last = now();
  }
  return {
    announce(msg) {
      pending = msg;
      const wait = last + interval - now();
      if (wait <= 0) {
        if (timer) { clearTimer(timer); timer = null; }
        flush();
      } else if (!timer) timer = setTimer(flush, wait);
    },
  };
}
