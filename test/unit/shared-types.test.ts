import { describe, it, expectTypeOf } from 'vitest';
import type { DomainEvent } from '../../src/shared/events.js';
import type { CharacterState, CharacterId, CharacterStatus } from '../../src/shared/character.js';
import type { WsMessage } from '../../src/shared/ws.js';

describe('shared types', () => {
  it('DomainEvent discriminates on type', () => {
    const e: DomainEvent = { type: 'session.start', ts: 1, sessionId: 's', cwd: '/' };
    expectTypeOf(e.type).toEqualTypeOf<DomainEvent['type']>();
  });

  it('CharacterState has queue array', () => {
    const s: CharacterState = {
      id: 'kim-team-lead' as CharacterId,
      status: 'idle' as CharacterStatus,
      queue: [],
      stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 },
    };
    expectTypeOf(s.queue).toBeArray();
  });

  it('WsMessage snapshot carries characters', () => {
    const m: WsMessage = { kind: 'snapshot', characters: [], sessions: [] };
    expectTypeOf(m.kind).toBeString();
  });
});
