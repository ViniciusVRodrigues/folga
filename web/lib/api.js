// Cliente da API do contrato. Mesma interface do mock (mock-api.js).
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const EVENTS = ['scan-progress', 'scan-done', 'cleanup-progress', 'cleanup-done', 'clean-progress', 'clean-done'];

export function createApi(token) {
  async function call(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { 'X-Token': token, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('NETWORK', 'Sem conexão com o Folga.', 0);
    }
    let data = null;
    try { data = await res.json(); } catch { /* corpo vazio */ }
    if (!res.ok) {
      const e = data && data.error;
      throw new ApiError(e?.code || 'ERROR', e?.message || 'Erro', res.status);
    }
    return data;
  }
  const q = (o) => new URLSearchParams(o).toString();
  return {
    mock: false,
    drives: () => call('GET', '/api/drives'),
    scan: (path) => call('POST', '/api/scan', { path }),
    cancelScan: () => call('POST', '/api/scan/cancel', {}),
    tree: (path, limit = 200) => call('GET', '/api/tree?' + q({ path, limit })),
    largeFiles: (min = 524288000) => call('GET', '/api/large-files?' + q({ min })),
    cleanupRefresh: () => call('POST', '/api/cleanup/refresh', {}),
    cleanup: () => call('GET', '/api/cleanup'),
    open: (itemId, kind) => call('POST', '/api/open', { itemId, kind }),
    adminScript: (ids) => call('GET', '/api/admin-script?' + q({ items: ids.join(',') })),
    clean: (items) => call('POST', '/api/clean', { items }),
    job: (jobId) => call('GET', '/api/clean/' + encodeURIComponent(jobId)),
    emptyBin: () => call('POST', '/api/recycle-bin/empty', { confirm: true }),
    /** handler(nome, dados). Devolve a função que fecha a conexão. */
    events(handler) {
      const es = new EventSource('/api/events?' + q({ t: token }));
      for (const name of EVENTS) {
        es.addEventListener(name, (ev) => {
          let data = {};
          try { data = JSON.parse(ev.data); } catch { /* ignora */ }
          handler(name, data);
        });
      }
      return () => es.close();
    },
  };
}
