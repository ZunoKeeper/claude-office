import { EventEmitter } from 'node:events';
import type { CharacterId, CharacterState, Ticket } from '../shared/character.js';
import type { DomainEvent } from '../shared/events.js';

function initial(id: CharacterId): CharacterState {
  return {
    id, status: 'idle', queue: [],
    stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 },
  };
}

export interface StateStore extends EventEmitter {
  getAll(): CharacterState[];
  get(id: CharacterId): CharacterState;
  applyEvent(id: CharacterId, event: DomainEvent, activityLabel?: string): CharacterState;
  setLine(id: CharacterId, text: string, ttlMs: number): CharacterState;
}

export function createStateStore(ids: CharacterId[]): StateStore {
  const map = new Map<CharacterId, CharacterState>();
  for (const id of ids) map.set(id, initial(id));
  const bus = new EventEmitter() as StateStore;

  function emit(id: CharacterId): CharacterState {
    const s = map.get(id)!;
    s.lastUpdatedAt = Date.now();
    bus.emit('characterUpdated', s);
    return s;
  }

  bus.getAll = () => [...map.values()];
  bus.get = (id) => map.get(id)!;

  bus.applyEvent = (id, event, label): CharacterState => {
    const s = map.get(id)!;
    switch (event.type) {
      case 'agent.start': {
        const ticket: Ticket = {
          ticketId: event.agentId, createdAt: event.ts,
          label: label ?? event.agentType,
          status: s.queue.length === 0 ? 'active' : 'queued',
        };
        s.queue.push(ticket);
        if (s.queue[0].status === 'active') s.status = 'working';
        s.currentActivity = ticket.status === 'active'
          ? { toolName: 'Agent', label: ticket.label, startedAt: event.ts } : s.currentActivity;
        break;
      }
      case 'agent.stop': {
        const idx = s.queue.findIndex((t) => t.ticketId === event.agentId);
        if (idx >= 0) s.queue.splice(idx, 1);
        if (event.success) s.stats.tasksCompleted += 1;
        else s.stats.errorsCount += 1;
        if (s.queue.length === 0) {
          s.status = event.success ? 'done' : 'error';
          s.currentActivity = undefined;
        } else {
          s.queue[0].status = 'active';
          s.status = 'working';
          s.currentActivity = { toolName: 'Agent', label: s.queue[0].label, startedAt: Date.now() };
        }
        break;
      }
      case 'tool.pre': {
        s.status = 'working';
        s.stats.toolCallsTotal += 1;
        s.currentActivity = { toolName: event.toolName, label: label ?? event.toolName, startedAt: event.ts };
        break;
      }
      case 'tool.post': {
        if (!event.success) {
          s.stats.errorsCount += 1;
          s.status = 'error';
        } else if (s.queue.length === 0) {
          s.status = 'done';
        } else {
          s.status = 'working';
        }
        s.currentActivity = undefined;
        break;
      }
      case 'session.start':
        // 로스터는 항상 자리에 있음 — session.start는 상태 리셋 트리거일 뿐
        s.status = 'idle';
        s.queue = [];
        s.currentActivity = undefined;
        break;
      case 'session.stop':
        // 세션 종료 후에도 캐릭터는 자리에 있음 (idle). 활동 상태만 리셋.
        s.status = 'idle';
        s.queue = [];
        s.currentActivity = undefined;
        break;
      default: break;
    }
    return emit(id);
  };

  bus.setLine = (id, text, ttlMs): CharacterState => {
    const s = map.get(id)!;
    s.lastLine = { text, ts: Date.now(), ttlMs };
    return emit(id);
  };

  return bus;
}
