import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import ndjson from 'ndjson';
import type { StateStore } from './stateStore.js';
import type { createRouter } from './characterRouter.js';
import { normalizeHook } from './eventNormalizer.js';
import type { HookEventName, HookPayload } from '../shared/events.js';

interface Deps {
  store: StateStore;
  router: ReturnType<typeof createRouter>;
}

interface ReplayState {
  file: string | null;
  running: boolean;
  index: number;
  total: number;
  speed: number;
}

interface RawEvent {
  type?: string;
  tool_use?: { name?: string; input?: unknown };
  session_id?: string;
  content?: string;
  agent_type?: string;
  agent_id?: string;
  tool_response?: { success?: boolean };
}

export function registerReplayer(app: FastifyInstance, deps: Deps): void {
  const state: ReplayState = { file: null, running: false, index: 0, total: 0, speed: 1 };
  let abort = false;

  app.post('/replay/start', async (req, reply) => {
    const body = (req.body ?? {}) as { file?: string; speed?: number };
    const file = typeof body.file === 'string' ? body.file.trim() : '';
    if (!file) {
      reply.code(400);
      return { ok: false, error: 'file required' };
    }
    try {
      await access(file);
    } catch {
      reply.code(400);
      return { ok: false, error: `file not readable: ${file}` };
    }
    abort = false;
    state.file = file;
    state.running = true;
    state.index = 0;
    state.total = 0;
    state.speed = body.speed ?? 1;

    const events: RawEvent[] = [];
    await new Promise<void>((resolve) => {
      const rs = createReadStream(file);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      rs.on('error', (err) => {
        app.log.warn({ err, file }, 'replayer: read stream error');
        finish();
      });
      rs.pipe(ndjson.parse({ strict: false }))
        .on('data', (o: unknown) => events.push(o as RawEvent))
        .on('end', finish)
        .on('error', (err) => {
          app.log.warn({ err, file }, 'replayer: parse error');
          finish();
        });
    });
    state.total = events.length;

    const speed = state.speed;
    const gap = Math.max(1, Math.floor(1000 / speed));

    (async () => {
      for (const obj of events) {
        if (abort) break;
        let name: HookEventName | null = null;
        if (obj.type === 'assistant' && obj.tool_use) name = 'PreToolUse';
        else if (obj.type === 'tool_result') name = 'PostToolUse';
        else if (obj.type === 'user') name = 'UserPromptSubmit';
        if (name) {
          const payload: HookPayload = {
            session_id: obj.session_id,
            tool_name: obj.tool_use?.name,
            tool_input: obj.tool_use?.input,
            prompt: obj.content,
            agent_type: obj.agent_type,
            agent_id: obj.agent_id,
            tool_response: obj.tool_response,
          };
          const evt = normalizeHook(name, payload, Date.now());
          if (evt) deps.store.applyEvent(deps.router.route(evt), evt);
        }
        state.index += 1;
        await new Promise((r) => setTimeout(r, gap));
      }
      state.running = false;
    })().catch(() => {
      state.running = false;
    });

    return { ok: true, total: state.total };
  });

  app.post('/replay/stop', async () => {
    abort = true;
    state.running = false;
    return { ok: true };
  });

  app.get('/replay/status', async () => state);
}
