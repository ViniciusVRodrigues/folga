const MAX_BODY = 1024 * 1024;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

/** Resposta com status explícito: `return reply(202, {...})`. */
export const reply = (status, body) => ({ __reply: true, status, body });

export function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length });
  res.end(data);
}

export function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_BODY) { reject(new HttpError(400, 'BAD_REQUEST', 'Corpo maior que 1 MB')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!n) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'BAD_REQUEST', 'JSON inválido')); }
    });
    req.on('error', reject);
  });
}

export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler });
  };
  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    /** Devolve true se tratou a requisição. */
    async handle(req, res, url) {
      let matched = false;
      for (const r of routes) {
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        matched = true;
        if (r.method !== req.method) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        const query = Object.fromEntries(url.searchParams);
        try {
          const body = req.method === 'POST' ? await readBody(req) : undefined;
          const out = await r.handler({ req, res, params, query, body, url });
          if (res.headersSent) return true;
          if (out && out.__reply) sendJson(res, out.status, out.body);
          else sendJson(res, 200, out ?? {});
        } catch (e) {
          if (res.headersSent) { res.end(); return true; }
          if (e instanceof HttpError) sendError(res, e.status, e.code, e.message);
          else sendError(res, 500, 'INTERNAL', 'Erro interno');
        }
        return true;
      }
      if (matched) { sendError(res, 405, 'BAD_REQUEST', 'Método não permitido'); return true; }
      return false;
    },
  };
}
