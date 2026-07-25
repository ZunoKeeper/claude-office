import { describe, it, expect, afterEach } from 'vitest';
import { startServer } from '../../src/server/index.js';

describe('bootstrap', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => { await close?.(); });

  it('serves /health and accepts a hook end-to-end', async () => {
    const app = await startServer({ port: 0 });
    close = () => app.close();
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    const hook = await app.inject({
      method: 'POST', url: '/hook', headers: { 'x-cm-event': 'SessionStart' },
      payload: { session_id: 'x', cwd: '/x' },
    });
    expect(hook.statusCode).toBe(200);
  });
});
