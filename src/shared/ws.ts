import type { CharacterState } from './character.js';
import type { DomainEvent } from './events.js';

export interface SessionSummary {
  sessionId: string;
  cwd: string;
  startedAt: number;
  stoppedAt?: number;
  eventCount: number;
}

export type WsMessage =
  | { kind: 'snapshot'; characters: CharacterState[]; sessions: SessionSummary[] }
  | { kind: 'characterUpdated'; state: CharacterState }
  | { kind: 'sessionUpdated'; session: SessionSummary }
  | { kind: 'event'; event: DomainEvent };
