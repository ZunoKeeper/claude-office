import type { CharacterId } from './character.js';

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  role: string;
  model?: string;
  description?: string;
  officeSeat: { x: number; y: number };
  spriteSheet: string;
}

export interface ActivityRule {
  characterId: CharacterId;
  match: {
    toolName?: string[];
    filePathPattern?: string;
    bashCommandPattern?: string;
    webFetchUrlPattern?: string;
  };
  priority: number;
}
