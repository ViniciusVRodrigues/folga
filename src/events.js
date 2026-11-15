/** Hub de Server-Sent Events. */
export function createEvents({ heartbeatMs = 15000 } = {}) {
  const clients = new Set();
  let timer = null;

  function startTimer() {
    if (timer) return;
    timer = setInterval(() => {
      for (const res of clients) res.write(': ping\n\n');
    }, heartbeatMs);
    timer.unref?.();
  }
  function stopTimer() {
    if (timer && clients.size === 0) { clearInterval(timer); timer = null; }
  }

  return {
    add(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      clients.add(res);
      startTimer();
      const drop = () => { clients.delete(res); stopTimer(); };
      req.on('close', drop);
      res.on('close', drop);
    },
    broadcast(event, data) {
      const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) res.write(msg);
    },
    get size() { return clients.size; },
    closeAll() {
      for (const res of clients) res.end();
      clients.clear();
      stopTimer();
    },
  };
}
