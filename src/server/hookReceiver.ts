import type { FastifyInstance } from 'fastify';
import { normalizeHook } from './eventNormalizer.js';
import type { HookEventName, HookPayload } from '../shared/events.js';
import type { createRouter } from './characterRouter.js';
import type { StateStore } from './stateStore.js';
import { pickLine, type DialogueContext } from './dialogue/pool.js';
import type { CharacterId } from '../shared/character.js';
import type { DialogueEntry } from '../shared/dialogue.js';
import type { DomainEvent } from '../shared/events.js';
import type { WsBroadcaster } from './wsHub.js';

interface Deps {
  router: ReturnType<typeof createRouter>;
  store: StateStore;
  dialogues: Map<CharacterId, DialogueEntry[]>;
  ws?: WsBroadcaster;
}

function slotsFor(
  event: DomainEvent,
  charState: { queue: unknown[]; stats: { errorsCount: number } },
): Record<string, string | number> {
  const slots: Record<string, string | number> = {};
  slots.queueDepth = charState.queue.length;
  if (event.type === 'tool.pre') {
    const io = (event.input ?? {}) as Record<string, unknown>;
    if (typeof io.file_path === 'string') slots.fileName = io.file_path.split(/[\\/]/).pop() ?? '';
    if (typeof io.command === 'string') slots.command = io.command.slice(0, 40);
    if (typeof io.pattern === 'string') slots.pattern = io.pattern;
  }
  if (event.type === 'user.prompt') slots.promptFirst20 = event.text.slice(0, 20);
  if (event.type === 'agent.start') {
    slots.agentType = event.agentType;
    slots.promptFirst25 = (event.prompt ?? '').slice(0, 25);
  }
  return slots;
}

export function registerHookReceiver(app: FastifyInstance, deps: Deps): void {
  // Accept any content-type so malformed / non-JSON payloads never block Claude Code
  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/hook', async (req, reply) => {
    const eventName = String(req.headers['x-cm-event'] ?? '') as HookEventName;
    let payload: HookPayload;
    try {
      payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as HookPayload;
    } catch {
      reply.code(200); return { ok: false, reason: 'invalid-json' };
    }
    const evt = normalizeHook(eventName, payload ?? {}, Date.now());
    if (!evt) { reply.code(200); return { ok: false, reason: 'unnormalizable' }; }
    deps.ws?.broadcast({ kind: 'event', event: evt });
    const charId = deps.router.route(evt);
    const charBefore = deps.store.get(charId);
    const slots = slotsFor(evt, charBefore);
    const recentError = charBefore.stats.errorsCount > 0 && charBefore.status === 'error';
    const line = pickLine(deps.dialogues.get(charId) ?? [], {
      event: evt, queueDepth: charBefore.queue.length, recentError, slots,
    } as DialogueContext);
    deps.store.applyEvent(charId, evt);
    if (line) deps.store.setLine(charId, line, 4000);
    reply.code(200);
    return { ok: true };
  });
}
