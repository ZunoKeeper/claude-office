import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import pino, { type LoggerOptions } from 'pino';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { loadConfig } from './config/loadConfig.js';
import { loadDialogues } from './dialogue/pool.js';
import { createRouter } from './characterRouter.js';
import { createStateStore } from './stateStore.js';
import { registerHookReceiver } from './hookReceiver.js';
import { registerWsHub } from './wsHub.js';
import { registerReplayer } from './replayer.js';
import { createLogTailer } from './logTailer.js';
import { createTranscriptProcessor } from './transcriptToEvents.js';
import { installHooks } from './setup/installHooks.js';
import { loadOverrides, saveOverrides, applyOverrides, type CharacterOverrides, overridesPath } from './setup/overrides.js';
import { ALL_CHARACTER_IDS, type CharacterId } from '../shared/character.js';

const loggerOptions: LoggerOptions = {
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  level: process.env.LOG_LEVEL ?? 'info',
};
const logger = pino(loggerOptions);

export interface ServerOpts { host?: string; port?: number; configDir?: string }

export async function startServer(opts: ServerOpts = {}): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify({ logger: loggerOptions });
  await app.register(websocket);

  const configDir = opts.configDir ?? path.resolve(process.cwd(), 'config');
  const { characters: baseCharacters, rules } = await loadConfig(configDir);
  const overrides = await loadOverrides();
  let characters = applyOverrides(baseCharacters, overrides);
  const dialogues = await loadDialogues(path.join(configDir, 'dialogue'));
  const router = createRouter(rules);
  const store = createStateStore([...ALL_CHARACTER_IDS]);

  const webDist = path.resolve(process.cwd(), 'dist/web');
  if (existsSync(webDist)) {
    await app.register(staticPlugin, { root: webDist, prefix: '/' });
  }

  app.get('/health', async () => ({ ok: true }));
  app.get('/config/characters', async () => characters);

  app.patch<{ Params: { id: string }; Body: CharacterOverrides }>(
    '/config/characters/:id',
    async (req, reply) => {
      const id = req.params.id as CharacterId;
      if (!ALL_CHARACTER_IDS.includes(id)) {
        reply.code(404);
        return { ok: false, error: `unknown character: ${id}` };
      }
      const body = (req.body ?? {}) as CharacterOverrides;
      const patch: CharacterOverrides = {};
      if (typeof body.name === 'string') patch.name = body.name.trim();
      if (typeof body.role === 'string') patch.role = body.role.trim();
      if (typeof body.model === 'string') patch.model = body.model.trim();
      if (typeof body.description === 'string') patch.description = body.description.trim();
      overrides[id] = { ...(overrides[id] ?? {}), ...patch };
      characters = applyOverrides(baseCharacters, overrides);
      const target = await saveOverrides(overrides);
      return { ok: true, target, character: characters.find((c) => c.id === id) };
    },
  );

  app.get('/config/overrides-path', async () => ({ path: overridesPath() }));

  app.get('/config/models', async () => ({
    // Curated Claude Code aliases. Users can also enter a custom string in Settings.
    models: ['fable', 'opus', 'sonnet', 'haiku'],
  }));

  app.post<{ Querystring: { scope?: 'user' | 'project' }; Body: { host?: string } }>(
    '/setup/install-hooks',
    async (req) => {
      const scope = req.query.scope === 'user' ? 'user' : 'project';
      const host = req.body?.host ?? `http://${req.hostname}`;
      const endpoint = `${host}/hook`;
      const target = await installHooks(scope, endpoint);
      return { ok: true, target };
    },
  );
  const ws = registerWsHub(app, { store });
  registerHookReceiver(app, { router, store, dialogues, ws });
  registerReplayer(app, { store, router });

  if (process.env.CM_TAIL_LOGS !== '0') {
    const processors = new Map<string, ReturnType<typeof createTranscriptProcessor>>();
    const agentIdToChar = new Map<string, ReturnType<typeof router.route>>();
    const tailer = createLogTailer(path.join(homedir(), '.claude'), (sid, raw) => {
      let proc = processors.get(sid);
      if (!proc) {
        proc = createTranscriptProcessor(sid);
        processors.set(sid, proc);
      }
      const events = proc(raw);
      for (const evt of events) {
        ws?.broadcast({ kind: 'event', event: evt });
        let charId;
        if (evt.type === 'tool.pre' || evt.type === 'agent.start') {
          charId = router.route(evt);
          agentIdToChar.set(evt.agentId, charId);
        } else if (evt.type === 'tool.post' || evt.type === 'agent.stop') {
          charId = agentIdToChar.get(evt.agentId) ?? router.route(evt);
          agentIdToChar.delete(evt.agentId);
        } else {
          charId = router.route(evt);
        }
        store.applyEvent(charId, evt);

        // Virtual PL dispatch narration — makes park-planner visibly relay tasks.
        // Every agent spawn (except when PL itself is the target) triggers a
        // brief line on park-planner: "누구에게 맡깁시다".
        if (evt.type === 'agent.start' && charId !== 'park-planner') {
          const target = characters.find((c) => c.id === charId);
          const name = target?.name ?? charId;
          store.setLine('park-planner', `${name}에게 맡깁시다`, 3000);
        }
      }
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
