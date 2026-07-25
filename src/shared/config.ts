import type { CharacterId } from './character.js';

export type SeatDirection = 'N' | 'S' | 'E' | 'W';
export type SeatPose = 'stand' | 'sit' | 'type';

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  role: string;
  model?: string;
  description?: string;
  officeSeat: { x: number; y: number };
  /** Which way the character faces while at rest. Defaults to 'S'. */
  seatDirection?: SeatDirection;
  /** Resting pose while status='idle'/'off'. Defaults to 'stand'. */
  seatPose?: SeatPose;
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
