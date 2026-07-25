import { create } from 'zustand';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { DomainEvent } from '../../shared/events.js';

interface CharacterStoreState {
  characters: Partial<Record<CharacterId, CharacterState>>;
  connected: boolean;
  events: DomainEvent[];
  applySnapshot(list: CharacterState[]): void;
  upsert(state: CharacterState): void;
  setConnected(v: boolean): void;
  pushEvent(e: DomainEvent): void;
}

export const useCharacterStore = create<CharacterStoreState>((set) => ({
  characters: {},
  connected: false,
  events: [],
  applySnapshot: (list) => set({
    characters: Object.fromEntries(list.map((s) => [s.id, s])) as CharacterStoreState['characters'],
  }),
  upsert: (state) => set((cur) => ({ characters: { ...cur.characters, [state.id]: state } })),
  setConnected: (v) => set({ connected: v }),
  pushEvent: (e) => set((cur) => ({ events: [...cur.events.slice(-29), e] })),
}));
