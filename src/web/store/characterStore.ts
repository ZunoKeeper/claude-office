import { create } from 'zustand';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { DomainEvent } from '../../shared/events.js';

interface CharacterStoreState {
  characters: Partial<Record<CharacterId, CharacterState>>;
  connected: boolean;
  events: DomainEvent[];
  configVersion: number;
  /** 스프라이트 오버라이드가 갱신될 때마다 증가 — 아바타·씬 재합성 트리거 */
  spritesVersion: number;
  applySnapshot(list: CharacterState[]): void;
  upsert(state: CharacterState): void;
  setConnected(v: boolean): void;
  pushEvent(e: DomainEvent): void;
  bumpConfigVersion(): void;
  bumpSpritesVersion(): void;
}

export const useCharacterStore = create<CharacterStoreState>((set) => ({
  characters: {},
  connected: false,
  events: [],
  configVersion: 0,
  spritesVersion: 0,
  applySnapshot: (list) => set({
    characters: Object.fromEntries(list.map((s) => [s.id, s])) as CharacterStoreState['characters'],
  }),
  upsert: (state) => set((cur) => ({ characters: { ...cur.characters, [state.id]: state } })),
  setConnected: (v) => set({ connected: v }),
  pushEvent: (e) => set((cur) => ({ events: [...cur.events.slice(-29), e] })),
  bumpConfigVersion: () => set((cur) => ({ configVersion: cur.configVersion + 1 })),
  bumpSpritesVersion: () => set((cur) => ({ spritesVersion: cur.spritesVersion + 1 })),
}));
