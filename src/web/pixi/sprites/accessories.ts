import type { CharacterId } from '../../../shared/character.js';
import type { Direction, PixelMatrix } from './types.js';
import { SPRITE_W, SPRITE_H } from './types.js';

/**
 * Per-character accessory overlays: glasses, ties, chest items.
 * G = frame (color from palette, e.g. tester's cyan goggles vs kim's black glasses).
 * T = accent (tie color from palette).
 */

function pad(row: string): string {
  if (row.length > SPRITE_W) {
    console.warn(`accessories.ts: row width ${row.length} > ${SPRITE_W}, truncating — "${row}"`);
    return row.slice(0, SPRITE_W);
  }
  return row.length === SPRITE_W ? row : row + '.'.repeat(SPRITE_W - row.length);
}

function build(rows: Record<number, string>): PixelMatrix {
  const out: string[] = [];
  for (let y = 0; y < SPRITE_H; y++) {
    out.push(pad(rows[y] ?? '.'.repeat(SPRITE_W)));
  }
  return out;
}

const empty = build({});

const glassesS = build({
  7: '........GGGGGGGG........',
  8: '........G..GG..G........',
  9: '........GGGGGGGG........',
});

const glassesE = build({
  7: '.............GGGG.......',
  8: '.............G..G.......',
  9: '.............GGGG.......',
});

const tieS = build({
  17: '...........TT...........',
  18: '..........TTTT..........',
  19: '..........TTTT..........',
  20: '..........TTTT..........',
  21: '...........TT...........',
});

const badgeS = build({
  19: '..............aX........', // small chest badge (cols 14-15)
  20: '..............aX........',
});

/** Combine two overlays (later takes precedence). */
function combine(a: PixelMatrix, b: PixelMatrix): PixelMatrix {
  const out: string[] = [];
  for (let y = 0; y < SPRITE_H; y++) {
    const ra = a[y] ?? '.'.repeat(SPRITE_W);
    const rb = b[y] ?? '.'.repeat(SPRITE_W);
    let row = '';
    for (let x = 0; x < SPRITE_W; x++) {
      const cb = rb[x] ?? '.';
      row += cb !== '.' ? cb : (ra[x] ?? '.');
    }
    out.push(row);
  }
  return out;
}

type AccessorySet = Record<Direction, PixelMatrix>;

/** kim — glasses + red tie (front only). */
const kim: AccessorySet = {
  S: combine(glassesS, tieS),
  N: empty,
  E: glassesE,
  W: glassesE,
};

/** planner — clean, no accessory but a small clipboard badge on chest. */
const planner: AccessorySet = {
  S: badgeS,
  N: empty,
  E: empty,
  W: empty,
};

/** tester — safety goggles (G becomes cyan via palette). */
const tester: AccessorySet = {
  S: glassesS,
  N: empty,
  E: glassesE,
  W: glassesE,
};

/** debugger — hoodie covers head; no extra accessory. */
const dbg: AccessorySet = {
  S: empty,
  N: empty,
  E: empty,
  W: empty,
};

/** reviewer — glasses + red tie, same as kim structure. */
const reviewer: AccessorySet = {
  S: combine(glassesS, tieS),
  N: empty,
  E: glassesE,
  W: glassesE,
};

/** docs — no glasses, but a small collar item. */
const docs: AccessorySet = {
  S: build({
    16: '...........XX...........',
    17: '..........XaaX..........',
  }),
  N: empty,
  E: empty,
  W: empty,
};

export const ACCESSORIES: Record<CharacterId, AccessorySet> = {
  'kim-team-lead': kim,
  'planner-researcher': planner,
  'tester': tester,
  'debugger': dbg,
  'code-reviewer': reviewer,
  'docs-manager': docs,
};
