import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import pino from 'pino';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { loadConfig } from './config/loadConfig.js';
import { loadDialogues } from './dialogue/pool.js';
import { createRouter } from './characterRouter.js';
import { createStateStore } from './stateStore.js';
import { registerHookReceiver } from './hookReceiver.js';
import { registerWsHub } from './wsHub.js';
import { createLogTailer } from './logTailer.js';
import { normalizeHook } from './eventNormalizer.js';
import { ALL_CHARACTER_IDS } from '../shared/character.js';
import type { HookEventName, HookPayload } from '../shared/events.js';

const logger = pino({
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  level: process.env.LOG_LEVEL ?? 'info',
});

export interface ServerOpts { host?: string; port?: number; configDir?: string }

export async function startServer(opts: ServerOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger });
  await app.register(websocket);

  const configDir = opts.configDir ?? path.resolve(process.cwd(), 'config');
  const { characters, rules } = await loadConfig(configDir);
  const dialogues = await loadDialogues(path.join(configDir, 'dialogue'));
  const router = createRouter(rules);
  const store = createStateStore([...ALL_CHARACTER_IDS]);

  const webDist = path.resolve(process.cwd(), 'dist/web');
  if (existsSync(webDist)) {
    await app.register(staticPlugin, { root: webDist, prefix: '/' });
  }

  app.get('/health', async () => ({ ok: true }));
  app.get('/config/characters', async () => characters);
  const ws = registerWsHub(app, { store });
  registerHookReceiver(app, { router, store, dialogues, ws });

  if (process.env.CM_TAIL_LOGS === '1') {
    const tailer = createLogTailer(path.join(homedir(), '.claude'), (sid, raw) => {
      const obj = raw as {
        type?: string;
        tool_use?: { name?: string; input?: unknown };
        agent_type?: string;
        content?: string;
      };
      let name: HookEventName | null = null;
      if (obj.type === 'assistant' && obj.tool_use) name = 'PreToolUse';
      else if (obj.type === 'tool_result') name = 'PostToolUse';
      else if (obj.type === 'user') name = 'UserPromptSubmit';
      if (!name) return;
      const payload: HookPayload = {
        session_id: sid,
        tool_name: obj.tool_use?.name,
        tool_input: obj.tool_use?.input,
        prompt: obj.content,
      };
      const evt = normalizeHook(name, payload, Date.now());
      if (!evt) return;
      ws?.broadcast({ kind: 'event', event: evt });
      const charId = router.route(evt);
      store.applyEvent(charId, evt);
    });
    await tailer.start();
    app.addHook('onClose', async () => { await tailer.stop(); });
  }

  const host = opts.host ?? process.env.HOST ?? '0.0.0.0';
  const port = opts.port ?? Number(process.env.PORT ?? 4000);
  if (port > 0) await app.listen({ host, port });
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer().catch((err) => { logger.error(err); process.exit(1); });
}
