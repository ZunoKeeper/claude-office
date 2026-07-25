import type { CharacterId } from '../../shared/character.js';

/**
 * Shared pixel-art matrix data for the 6-character roster.
 * Consumed by PixelAvatar.tsx (grid) and pixi/CharacterSprite.ts (office).
 * All sprites are 16 wide x 20 tall.
 * Palette legend:
 *   H = hair / hood       F = skin              E = eye
 *   M = mouth             G = glasses frame     S = shirt / outfit
 *   T = accent            A = accessory main    B = accessory dark
 *   K = outline           . = transparent
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

/** kim-team-lead — PM, glasses + tie */
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

/** planner-researcher — blueprint / clipboard, sharp look */
const planner: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#1e40af', S: '#1d4ed8', T: '#facc15', A: '#e0f2fe', B: '#0369a1' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHHHHHHHK....',
    '..KHKKKKKKHK....',
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
    '.KSSAAAAAAASSK..',
    '.KSSABBBBBBASSK.',
    '.KSSABBBBBBASSK.',
    '.KSSAAAAAAASSK..',
    '.KKKKKKKKKKKKKK.',
  ],
};

/** tester — lab coat + safety goggles + flask */
const tester: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#065f46', S: '#f0fdf4', T: '#10b981', G: '#22d3ee', A: '#10b981', B: '#065f46' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHFFFFFFHK....',
    '..KHFFFFFFFK....',
    '..KFGGGGGGFK....',   // wide safety goggles band
    '..KFGEEFEEGFK...',
    '..KFGGGGGGFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSTSSSSSTSSSK.',   // lab coat lapel
    '.KSSSSSSSSSSSSK.',
    '.KSSSSAAAASSSK..',   // flask
    '.KSSSABBBBASSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

/** debugger — dark hoodie + magnifier, hacker vibe */
const debuggr: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#111827', S: '#0f172a', A: '#f59e0b', B: '#7c2d12', G: '#22c55e' },
  pixels: [
    '................',
    '..KKKKKKKKKK....',
    '.KHHHHHHHHHHK...',
    '.KHHHHHHHHHHK...',
    '.KHHHHHHHHHHK...',
    '.KHHFFFFFFHHK...',
    '.KHFFFFFFFFHK...',
    '.KHFGEFFFEGFHK..',   // green terminal-glow eyes
    '.KHFFFFFFFFHK...',
    '.KFFFFFFFFFFK...',
    '.KFFFFMMFFFFK...',
    '..KFFFFFFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKHHHHHHHHKK..',
    '.KHHHHHHHHHHHHK.',
    '.KHHHAABAAAAAHK.',   // magnifier
    '.KHHHABBBAAAAHK.',
    '.KHHHAABAAAAAHK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

/** code-reviewer — glasses + red pen, careful */
const reviewer: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#7f1d1d', S: '#fef2f2', T: '#dc2626', G: OUTLINE, A: '#dc2626', B: '#7f1d1d' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
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
    '.KSSSSTTSSSSSK..',   // red tie
    '.KSSSSTTSSSSSK..',
    '.KSSAAAAAAASSK..',   // review sheet
    '.KSSABBBBBASSK..',
    '.KSSAAAAAAASSK..',
    '.KKKKKKKKKKKKKK.',
  ],
};

/** docs-manager — book + bookish vibe, tied hair */
const docs: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#78350f', S: '#a16207', T: '#fef3c7', A: '#fef3c7', B: '#78350f' },
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
    '.KSSAAAAAAASSK..',   // book cover
    '.KSSABTTBTTASSK.',   // book pages line
    '.KSSABTTBTTASSK.',
    '.KSSAAAAAAASSK..',
    '.KKKKKKKKKKKKKK.',
  ],
};

export const CHARACTERS: Record<CharacterId, CharSpec> = {
  'kim-team-lead': kim,
  'planner-researcher': planner,
  'tester': tester,
  'debugger': debuggr,
  'code-reviewer': reviewer,
  'docs-manager': docs,
};
