import { HttpError, reply } from '../router.js';
import { runCatalog, buildResponse, buildCleanupMap, systemDrive } from '../catalog/index.js';
import { knownLocations } from '../platform/index.js';

export function register(router, ctx) {
  const { events, state } = ctx;
  state.cleanup = state.cleanup || { running: null, result: null, items: new Map(), generatedAt: null, progress: null, error: null };
  const cl = state.cleanup;

  function startRefresh() {
    if (cl.running) return cl.running;
    const opts = ctx.catalog || {};
    let outcome = { ok: true };
    cl.error = null;
    cl.progress = null;
    cl.running = runCatalog({
      ...opts,
      onProgress: (p) => { cl.progress = p; events.broadcast('cleanup-progress', p); },
    }).then((result) => {
      cl.result = result;
      cl.items = buildCleanupMap(result.items);
      cl.generatedAt = result.generatedAt;
    }).catch((e) => { /* mantém o resultado anterior */
      cl.error = String(e?.message || e);
      outcome = { ok: false, error: cl.error };
    }).finally(() => {
      cl.running = null;
      events.broadcast('cleanup-done', outcome);
    });
    return cl.running;
  }

  router.post('/api/cleanup/refresh', async () => {
    startRefresh();
    return reply(202, {});
  });

  router.get('/api/cleanup/status', async () => ({
    running: !!cl.running,
    progress: cl.running ? cl.progress : null,
    generatedAt: cl.generatedAt,
    error: cl.running ? null : cl.error,
  }));

  router.get('/api/cleanup', async () => {
    if (!cl.result) throw new HttpError(409, 'NO_SCAN', 'O catálogo ainda não foi medido. Chame POST /api/cleanup/refresh.');
    const L = knownLocations(ctx.catalog?.env || process.env);
    const drive = await systemDrive(L);
    return buildResponse(cl.result, { drive, scanning: !!cl.running });
  });
}
