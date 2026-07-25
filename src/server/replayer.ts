import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import ndjson from 'ndjson';
import type { StateStore } from './stateStore.js';
import type { createRouter } from './characterRouter.js';
import { createTranscriptProcessor } from './transcriptToEvents.js';

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

    const rawRecords: unknown[] = [];
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
        .on('data', (o: unknown) => rawRecords.push(o))
        .on('end', finish)
        .on('error', (err) => {
          app.log.warn({ err, file }, 'replayer: parse error');
          finish();
        });
    });
    state.total = rawRecords.length;

    const speed = state.speed;
    const gap = Math.max(1, Math.floor(1000 / speed));
    const fallbackSid = path.basename(file, '.jsonl');
    const proc = createTranscriptProcessor(fallbackSid);
    const agentIdToChar = new Map<string, ReturnType<typeof deps.router.route>>();

    (async () => {
      for (const raw of rawRecords) {
        if (abort) break;
        const events = proc(raw);
        for (const evt of events) {
          let charId;
          if (evt.type === 'tool.pre' || evt.type === 'agent.start') {
            charId = deps.router.route(evt);
            agentIdToChar.set(evt.agentId, charId);
          } else if (evt.type === 'tool.post' || evt.type === 'agent.stop') {
            charId = agentIdToChar.get(evt.agentId) ?? deps.router.route(evt);
            agentIdToChar.delete(evt.agentId);
          } else {
            charId = deps.router.route(evt);
          }
          deps.store.applyEvent(charId, evt);
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
