import type { CharacterId } from './character.js';
import type { DomainEvent } from './events.js';

export interface DialogueEntry {
  characterId: CharacterId;
  trigger: {
    eventType: DomainEvent['type'];
    toolName?: string;
    conditions?: { queueDepthGte?: number; errorRecent?: boolean };
  };
  templates: string[];
  weight?: number;
}
