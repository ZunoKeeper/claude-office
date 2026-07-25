import type { CharacterId } from '../../../shared/character.js';
import type { Palette } from './types.js';

const OUTLINE = '#1a1a1a';
const OUTLINE_SOFT = '#3a2a1a';
const SKIN = '#ffd9a8';
const SKIN_SHADE = '#d99b6c';
const EYE = '#111111';
const MOUTH = '#7a2d1f';
const PANTS = '#2a3b52';
const PANTS_SHADE = '#1a2438';
const SHOES = '#1a1a1a';

const BASE: Palette = {
  '.': null,
  K: OUTLINE,
  k: OUTLINE_SOFT,
  F: SKIN,
  f: SKIN_SHADE,
  A: SKIN,
  P: PANTS,
  p: PANTS_SHADE,
  Z: SHOES,
  E: EYE,
  M: MOUTH,
};

export const PALETTES: Record<CharacterId, Palette> = {
  'kim-team-lead': {
    ...BASE,
    H: '#6d28d9', h: '#4c1d95',
    S: '#f8fafc', s: '#cbd5e1',
    T: '#dc2626',
    G: OUTLINE,
    X: '#dc2626', a: '#7f1d1d',
  },
  'planner-researcher': {
    ...BASE,
    H: '#1e3a8a', h: '#172554',
    S: '#3b82f6', s: '#1d4ed8',
    T: '#facc15',
    G: '#f8fafc',
    X: '#e0f2fe', a: '#0369a1',
  },
  'tester': {
    ...BASE,
    H: '#065f46', h: '#064e3b',
    S: '#f8fafc', s: '#cbd5e1',
    T: '#10b981',
    G: '#22d3ee',
    X: '#10b981', a: '#065f46',
  },
  'debugger': {
    ...BASE,
    H: '#111827', h: '#030712',
    S: '#0f172a', s: '#020617',
    T: '#f59e0b',
    G: '#22c55e',
    X: '#f59e0b', a: '#7c2d12',
  },
  'code-reviewer': {
    ...BASE,
    H: '#7f1d1d', h: '#450a0a',
    S: '#fef2f2', s: '#fecaca',
    T: '#dc2626',
    G: OUTLINE,
    X: '#dc2626', a: '#7f1d1d',
  },
  'docs-manager': {
    ...BASE,
    H: '#92400e', h: '#78350f',
    S: '#c2410c', s: '#7c2d12',
    T: '#fef3c7',
    G: OUTLINE,
    X: '#fef3c7', a: '#78350f',
  },
};
