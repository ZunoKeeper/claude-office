import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerHookReceiver } from '../../src/server/hookReceiver.js';
import { createRouter } from '../../src/server/characterRouter.js';
import { createStateStore } from '../../src/server/stateStore.js';
import { loadDialogues } from '../../src/server/dialogue/pool.js';
import { loadConfig } from '../../src/server/config/loadConfig.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';
import path from 'node:path';

const CONFIG = path.resolve(process.cwd(), 'config');

describe('POST /hook', () => {
  let app: ReturnType<typeof Fastify>;

  afterEach(async () => { await app?.close(); });

  it('accepts SessionStart and updates lee state on later SubagentStart', async () => {
    const { rules } = await loadConfig(CONFIG);
    const dialogues = await loadDialogues(path.join(CONFIG, 'dialogue'));
    const router = createRouter(rules);
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    app = Fastify();
    registerHookReceiver(app, { router, store, dialogues });

    await app.inject({
      method: 'POST', url: '/hook', headers: { 'x-cm-event': 'SessionStart' },
      payload: { session_id: 's1', cwd: '/proj' },
    }).then((r) => expect(r.statusCode).toBe(200));

    const r2 = await app.inject({
      method: 'POST', url: '/hook', headers: { 'x-cm-event': 'SubagentStart' },
      payload: { session_id: 's1', agent_id: 'a1', agent_type: 'Explore' },
    });
    expect(r2.statusCode).toBe(200);
    expect(store.get('lee-researcher').status).toBe('working');
    expect(store.get('lee-researcher').queue).toHaveLength(1);
  });

  it('malformed payload returns 200 (never blocks Claude Code)', async () => {
    const { rules } = await loadConfig(CONFIG);
    const dialogues = await loadDialogues(path.join(CONFIG, 'dialogue'));
    app = Fastify();
    registerHookReceiver(app, {
      router: createRouter(rules),
      store: createStateStore([...ALL_CHARACTER_IDS]),
      dialogues,
    });
    const r = await app.inject({
      method: 'POST', url: '/hook', headers: { 'x-cm-event': 'PreToolUse' },
      payload: 'not-json', // invalid
    });
    expect(r.statusCode).toBe(200);
  });
});
