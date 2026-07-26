import type { CharacterId, CharacterStatus } from './character.js';
import type { DomainEvent } from './events.js';

/** 이벤트 없이 상태만으로 발화하는 ambient 트리거의 가상 이벤트. */
export interface AmbientEvent {
  type: 'ambient';
  status: CharacterStatus;
}

export interface DialogueEntry {
  characterId: CharacterId;
  trigger: {
    eventType: DomainEvent['type'] | 'ambient';
    /** 단일 툴명 또는 목록 — 목록이면 그중 하나와 일치할 때 매칭 (예: ["Bash","PowerShell"]) */
    toolName?: string | string[];
    /** ambient 전용 — 캐릭터가 이 상태일 때만 매칭 */
    status?: CharacterStatus;
    conditions?: { queueDepthGte?: number; errorRecent?: boolean };
  };
  templates: string[];
  weight?: number;
}
