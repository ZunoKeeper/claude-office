import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import path from 'node:path';
import { createStateStore } from '../../src/server/stateStore.js';
import { createRouter } from '../../src/server/characterRouter.js';
import { registerReplayer } from '../../src/server/replayer.js';
import { loadConfig } from '../../src/server/config/loadConfig.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';

const CONFIG = path.resolve(process.cwd(), 'config');
const FIX = path.resolve(process.cwd(), 'test/fixtures/jsonl/sample-session.jsonl');

describe('replayer', () => {
  let app: ReturnType<typeof Fastify>;
  afterEach(async () => {
    await app?.close();
  });

  it('POST /replay/start reads jsonl and dispatches events at speed=1000', async () => {
    const { rules } = await loadConfig(CONFIG);
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    const router = createRouter(rules);
    app = Fastify();
    registerReplayer(app, { store, router });
    const res = await app.inject({
      method: 'POST',
      url: '/replay/start',
      payload: { file: FIX, speed: 1000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, total: 3 });
    await new Promise((r) => setTimeout(r, 250));
    const status = await app.inject({ method: 'GET', url: '/replay/status' });
    expect(status.json()).toMatchObject({ file: FIX });
  });

  it('POST /replay/stop halts replay and status reflects it', async () => {
    const { rules } = await loadConfig(CONFIG);
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    const router = createRouter(rules);
    app = Fastify();
    registerReplayer(app, { store, router });
    await app.inject({
      method: 'POST',
      url: '/replay/start',
      payload: { file: FIX, speed: 1 },
    });
    const stop = await app.inject({ method: 'POST', url: '/replay/stop' });
    expect(stop.statusCode).toBe(200);
    expect(stop.json()).toMatchObject({ ok: true });
    const status = await app.inject({ method: 'GET', url: '/replay/status' });
    expect(status.json()).toMatchObject({ running: false });
  });

  it('POST /replay/start without file returns 400', async () => {
    const { rules } = await loadConfig(CONFIG);
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    const router = createRouter(rules);
    app = Fastify();
    registerReplayer(app, { store, router });
    const res = await app.inject({
      method: 'POST',
      url: '/replay/start',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
