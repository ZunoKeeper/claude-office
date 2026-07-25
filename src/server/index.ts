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

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer().catch((err) => { logger.error(err); process.exit(1); });
}
