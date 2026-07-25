import { create } from 'zustand';
import type { CharacterId, CharacterState } from '../../shared/character.js';

interface CharacterStoreState {
  characters: Partial<Record<CharacterId, CharacterState>>;
  connected: boolean;
  applySnapshot(list: CharacterState[]): void;
  upsert(state: CharacterState): void;
  setConnected(v: boolean): void;
}

export const useCharacterStore = create<CharacterStoreState>((set) => ({
  characters: {},
  connected: false,
  applySnapshot: (list) => set({
    characters: Object.fromEntries(list.map((s) => [s.id, s])) as CharacterStoreState['characters'],
  }),
  upsert: (state) => set((cur) => ({ characters: { ...cur.characters, [state.id]: state } })),
  setConnected: (v) => set({ connected: v }),
}));
