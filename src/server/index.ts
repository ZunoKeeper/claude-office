import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import pino, { type LoggerOptions } from 'pino';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import chokidar from 'chokidar';
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
import { collectCapabilities } from './env/capabilities.js';
import { loadOverrides, saveOverrides, applyOverrides, type CharacterOverrides, overridesPath } from './setup/overrides.js';
import { ALL_CHARACTER_IDS, type CharacterId } from '../shared/character.js';
import type { DomainEvent } from '../shared/events.js';

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
  let { characters: baseCharacters, rules } = await loadConfig(configDir);
  const overrides = await loadOverrides();
  let characters = applyOverrides(baseCharacters, overrides);
  const dialogues = await loadDialogues(path.join(configDir, 'dialogue'));
  // Router is wrapped in a stable object so `characterRouter.route` calls
  // dispatch to whichever inner router is current — lets us hot-swap rules
  // without re-registering hook/replayer handlers.
  let innerRouter = createRouter(rules);
  const router = {
    route: (event: DomainEvent): CharacterId => innerRouter.route(event),
  };
  const store = createStateStore([...ALL_CHARACTER_IDS]);

  const webDist = path.resolve(process.cwd(), 'dist/web');
  if (existsSync(webDist)) {
    await app.register(staticPlugin, { root: webDist, prefix: '/' });
  }

  const ws = registerWsHub(app, { store });

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
      if (body.officeSeat && typeof body.officeSeat.x === 'number' && typeof body.officeSeat.y === 'number') {
        patch.officeSeat = {
          x: Math.round(body.officeSeat.x),
          y: Math.round(body.officeSeat.y),
        };
      }
      if (body.seatDirection && ['N', 'S', 'E', 'W'].includes(body.seatDirection)) {
        patch.seatDirection = body.seatDirection;
      }
      if (body.seatPose && ['stand', 'sit', 'type'].includes(body.seatPose)) {
        patch.seatPose = body.seatPose;
      }
      overrides[id] = { ...(overrides[id] ?? {}), ...patch };
      characters = applyOverrides(baseCharacters, overrides);
      const target = await saveOverrides(overrides);
      // Nudge every connected client to re-fetch so the new seat propagates
      // instantly to all open dashboards.
      ws.broadcast({ kind: 'configUpdated' });
      return { ok: true, target, character: characters.find((c) => c.id === id) };
    },
  );

  app.get('/config/overrides-path', async () => ({ path: overridesPath() }));

  const MODEL_FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'];

  app.get('/config/models', async () => ({ models: MODEL_FAMILIES }));

  // 스킬/플러그인은 세션 중 거의 불변 — 기동 시 1회 수집해 캐시
  const capabilities = await collectCapabilities({
    homeDir: homedir(),
    projectDir: process.cwd(),
    models: MODEL_FAMILIES,
  });
  app.get('/env/capabilities', async () => capabilities);

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
  registerHookReceiver(app, { router, store, dialogues, ws });
  registerReplayer(app, { store, router });

  // Hot-reload config JSONs so seat/rule edits take effect without a full
  // server restart. On any change we re-read, swap the router internals, and
  // notify clients so they re-fetch /config/characters.
  const configWatcher = chokidar.watch(
    [path.join(configDir, 'characters.json'), path.join(configDir, 'activityRules.json')],
    { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 } },
  );
  configWatcher.on('change', async () => {
    try {
      const reloaded = await loadConfig(configDir);
      baseCharacters = reloaded.characters;
      rules = reloaded.rules;
      characters = applyOverrides(baseCharacters, overrides);
      innerRouter = createRouter(rules);
      ws?.broadcast({ kind: 'configUpdated' });
      app.log.info('config hot-reloaded');
    } catch (err) {
      app.log.warn({ err }, 'config reload failed — keeping previous config');
    }
  });
  app.addHook('onClose', async () => { await configWatcher.close(); });

  if (process.env.CM_TAIL_LOGS !== '0') {
    const processors = new Map<string, ReturnType<typeof createTranscriptProcessor>>();
    // Two maps for agentId → character:
    //   agentIdToChar (transient) — deleted on agent.stop, used for queue routing
    //   agentIdToCharPersistent — never deleted, used for subagent model attribution
    //     (subagent JSONLs may be processed after the parent Agent already completed,
    //     so we cannot rely on the transient map alone)
    const agentIdToChar = new Map<string, ReturnType<typeof router.route>>();
    const agentIdToCharPersistent = new Map<string, ReturnType<typeof router.route>>();
    // Buffer for models seen from subagent JSONLs BEFORE the parent Agent
    // mapping arrived. Drained whenever agentIdToCharPersistent gets a new entry.
    const pendingSubagentModels = new Map<string, string>();

    function drainPendingModel(agentId: string): void {
      const model = pendingSubagentModels.get(agentId);
      const target = agentIdToCharPersistent.get(agentId);
      if (model && target) {
        store.setModel(target, model);
        pendingSubagentModels.delete(agentId);
      }
    }

    function attributeModel(raw: unknown, filePath: string): void {
      const record = raw as { type?: string; message?: { model?: string } } | null;
      if (!record || record.type !== 'assistant') return;
      const model = record.message?.model;
      if (typeof model !== 'string' || !model) return;

      const subagentMatch = /\/subagents\/agent-([a-zA-Z0-9_-]+)\.jsonl$/.exec(filePath);
      if (subagentMatch) {
        const agentId = subagentMatch[1];
        const target = agentIdToCharPersistent.get(agentId);
        if (target) {
          store.setModel(target, model);
        } else {
          // Parent mapping not yet processed — buffer until agent.start arrives.
          pendingSubagentModels.set(agentId, model);
        }
      } else {
        // Main session JSONL (e.g., ~/.claude/projects/<cwd>/<sessionId>.jsonl)
        store.setModel('kim-team-lead', model);
      }
    }

    // Extract subagent id → charId link from Agent tool_result content.
    // The subagent JSONL filename is `agent-<subagentId>.jsonl`, and the
    // subagentId is announced inside the parent's tool_result content as
    // `agentId: <hex>`. We map the parent's tool_use_id back to a charId via
    // agentIdToCharPersistent (which was set on the corresponding agent.start
    // using tool_use.id as the key).
    function linkSubagentIdIfPresent(raw: unknown): void {
      const record = raw as {
        type?: string;
        message?: { content?: Array<{ type?: string; tool_use_id?: string; content?: unknown }> };
      } | null;
      if (!record || record.type !== 'user') return;
      const blocks = record.message?.content;
      if (!Array.isArray(blocks)) return;
      for (const block of blocks) {
        if (block?.type !== 'tool_result') continue;
        const toolUseId = block.tool_use_id;
        if (!toolUseId) continue;
        const charId = agentIdToCharPersistent.get(toolUseId);
        if (!charId) continue; // not an Agent tool_use we tracked
        const text = typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content ?? '');
        const m = /agentId[:\s]*([a-fA-F0-9]{12,})/.exec(text);
        if (!m) continue;
        const subagentId = m[1];
        // Mirror the mapping so subagent JSONL model attribution finds it
        agentIdToCharPersistent.set(subagentId, charId);
        drainPendingModel(subagentId);
      }
    }

    function modelOfAssistantRecord(raw: unknown): string | null {
      const record = raw as { type?: string; message?: { model?: string } } | null;
      if (!record || record.type !== 'assistant') return null;
      const m = record.message?.model;
      return typeof m === 'string' && m ? m : null;
    }

    const tailer = createLogTailer(path.join(homedir(), '.claude'), (sid, raw, filePath) => {
      attributeModel(raw, filePath);
      linkSubagentIdIfPresent(raw);
      const rawModel = modelOfAssistantRecord(raw);

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
          agentIdToCharPersistent.set(evt.agentId, charId);
          drainPendingModel(evt.agentId);
        } else if (evt.type === 'tool.post' || evt.type === 'agent.stop') {
          charId = agentIdToChar.get(evt.agentId) ?? router.route(evt);
          agentIdToChar.delete(evt.agentId);
        } else {
          charId = router.route(evt);
        }
        store.applyEvent(charId, evt);

        // Attribute the source record's model to the routed character too,
        // so activity-based characters (yu-dev, han-qa, seo-designer, choi-office)
        // reflect the actual model that executed their work.
        if (rawModel && (evt.type === 'tool.pre' || evt.type === 'agent.start')) {
          store.setModel(charId, rawModel);
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

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer().catch((err) => { logger.error(err); process.exit(1); });
}
