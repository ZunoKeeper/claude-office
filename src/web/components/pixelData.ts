import type { CharacterId } from '../../shared/character.js';

/**
 * Shared pixel-art matrix data for the 9 characters.
 * Consumed by:
 *   - PixelAvatar.tsx (renders as inline SVG rects in the DOM grid)
 *   - pixi/CharacterSprite.ts (renders as PixiJS Graphics rects in the office scene)
 *
 * Every character is a 16 wide x 20 tall matrix. Legend (shared unless overridden):
 *   H = hair / hood        F = skin              E = eye (near-black)
 *   M = mouth (dark)       G = glasses frame     S = shirt / outfit
 *   T = accent             A = accessory main    B = accessory dark
 *   K = outline            . = transparent
 */

const OUTLINE = '#1a1a1a';
const SKIN = '#ffe0b8';
const EYE = '#111';
const MOUTH = '#3a1810';

export type Palette = Record<string, string>;

const BASE_PALETTE: Palette = {
  '.': 'transparent',
  K: OUTLINE,
  F: SKIN,
  E: EYE,
  M: MOUTH,
};

export interface CharSpec {
  pixels: string[];
  palette: Palette;
}

const kim: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#7c3aed', S: '#f8fafc', T: '#dc2626', G: OUTLINE },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHFFFFFFHK....',
    '..KHFFFFFFFK....',
    '..KFGGFFGGFK....',
    '..KFGEFFGEFK....',
    '..KFGGFFGGFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSTTSSSSSK.',
    '.KSSSSSTTSSSSSK.',
    '.KSSSSSTTSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const park: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#1e40af', S: '#2563eb', T: '#f59e0b' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHKKKKHHK....',
    '..KHKHHHHKHK....',
    '..KHFFFFFFHK....',
    '..KHFFFFFFFK....',
    '..KFFEFFEFFK....',
    '..KFFFFFFFFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSTSSSSSTSSSK.',
    '.KSSTTSSSSTTSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const lee: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#0d9488', S: '#14b8a6', G: OUTLINE, A: '#94a3b8' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHKHHK.....',
    '..KHHKHHKHHK....',
    '..KHKHHHHKHK....',
    '..KHFFFFFFHK....',
    '..KHFFFFFFFK....',
    '..KFGGFFGGFK....',
    '..KFGEFFGEFK....',
    '..KFGGFFGGFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSAAAASSSSK.',
    '.KSSSABAABASSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const yu: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#f97316', S: '#7c2d12', A: '#111', B: '#f97316' },
  pixels: [
    '................',
    '..KKKKKKKKKK....',
    '.KHHHHHHHHHHK...',
    '.KHHHHHHHHHHK...',
    '.KHHHHHHHHHHK...',
    '.KHHFFFFFFHHK...',
    '.KHFFFFFFFFHK...',
    'AKFFEFFFFEFFKA..',
    'ABFFFFFFFFFFBA..',
    'ABFFFFFFFFFFBA..',
    '.KFFFFFMMFFFK...',
    '..KFFFFFFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKHHHHHHHHKK..',
    '.KHHHHHHHHHHHHK.',
    '.KHHHHHHHHHHHHK.',
    '.KHHHHHHHHHHHHK.',
    '.KHHHHHHHHHHHHK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const han: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#be185d', S: '#831843', G: OUTLINE, A: '#f5f5dc', B: '#111' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHFFFFFFHK....',
    '..KFGGFFGGFK....',
    '..KFGEFFGEFK....',
    '..KFGGFFGGFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSAAAAAASSSSK.',
    '.KSSABBBBBASSSSK',
    '.KSSABBBBBASSSSK',
    '.KSSAAAAAASSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const seo: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#c026d3', S: '#a21caf', A: '#f5deb3', B: '#e11d48' },
  pixels: [
    '................',
    '...KKKKKKKK.....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHHK...',
    '..KHHHHHHHHHK...',
    '..KHHFFFFFHHK...',
    '..KHFFFFFFFHK...',
    '..KHFEFFFFEFK...',
    '..KHFFFFFFFFK...',
    '..KFFFFFFFFFK...',
    '..KFFFMMMFFFK...',
    '...KFFFFFFFK....',
    '....KFFFFFK.....',
    '.....KFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSAAABBBAASSK.',
    '.KSSAAABBBAASSK.',
    '.KSSSSSSSSSSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const jo: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#94a3b8', S: '#1e293b', T: '#7f1d1d', A: '#7f4f14' },
  pixels: [
    '................',
    '.....KKKK.......',
    '....KHHHHK......',
    '...KHHHHHHK.....',
    '...KHFFFFHHK....',
    '...KFFFFFFFK....',
    '..KKFFFFFFFK....',
    '..KFFEFFFFEFK...',
    '..KFFFFFFFFFK...',
    '..KFFFFFFFFFK...',
    '..KFFFFMMFFFK...',
    '...KFFFFFFFK....',
    '....KFFFFFK.....',
    '.....KFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSTTTTTTSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSSAAAAAAASSK.',
    '.KSSSABBBBBASSSK',
    '.KKKKKKKKKKKKKK.',
  ],
};

const jung: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#16a34a', S: '#facc15', A: '#111', B: '#facc15' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHHHHHHHK....',
    '.KHHHHHHHHHHK...',
    '..KHFFFFFFHHK...',
    '..KHFFFFFFFHK...',
    'AKFFEEFFEEFFKA..',
    'ABFFFFFFFFFFBA..',
    '.KFFFFFFFFFFK...',
    '.KFFFMMMMFFFK...',
    '..KFFFFFFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const choi: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#eab308', S: '#78716c', T: '#22c55e', A: '#f5f5dc' },
  pixels: [
    '................',
    '.....KKKKK......',
    '....KHHHHHK.....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHFFFFFFHK....',
    '..KHFEFFFEFK....',
    '..KFFFFFFFFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSAAAAAAASSSK.',
    '.KSSATTTTTASSSK.',
    '.KSSATTTTTASSSK.',
    '.KSSAAAAAAASSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

export const CHARACTERS: Record<CharacterId, CharSpec> = {
  'kim-team-lead': kim,
  'park-planner': park,
  'lee-researcher': lee,
  'yu-dev': yu,
  'han-qa': han,
  'seo-designer': seo,
  'jo-senior': jo,
  'jung-newbie': jung,
  'choi-office': choi,
};
