import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import pino from 'pino';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from './config/loadConfig.js';
import { loadDialogues } from './dialogue/pool.js';
import { createRouter } from './characterRouter.js';
import { createStateStore } from './stateStore.js';
import { registerHookReceiver } from './hookReceiver.js';
import { registerWsHub } from './wsHub.js';
import { ALL_CHARACTER_IDS } from '../shared/character.js';

const logger = pino({
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  level: process.env.LOG_LEVEL ?? 'info',
});

export interface ServerOpts { host?: string; port?: number; configDir?: string }

export async function startServer(opts: ServerOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger });
  await app.register(websocket);

  const configDir = opts.configDir ?? path.resolve(process.cwd(), 'config');
  const { rules } = await loadConfig(configDir);
  const dialogues = await loadDialogues(path.join(configDir, 'dialogue'));
  const router = createRouter(rules);
  const store = createStateStore([...ALL_CHARACTER_IDS]);

  const webDist = path.resolve(process.cwd(), 'dist/web');
  if (existsSync(webDist)) {
    await app.register(staticPlugin, { root: webDist, prefix: '/' });
  }

  app.get('/health', async () => ({ ok: true }));
  const ws = registerWsHub(app, { store });
  registerHookReceiver(app, { router, store, dialogues, ws });

  const host = opts.host ?? process.env.HOST ?? '0.0.0.0';
  const port = opts.port ?? Number(process.env.PORT ?? 4000);
  if (port > 0) await app.listen({ host, port });
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer().catch((err) => { logger.error(err); process.exit(1); });
}
