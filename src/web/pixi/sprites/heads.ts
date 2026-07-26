import type { CharacterId } from '../../../shared/character.js';
import type { PixelMatrix } from './types.js';
import { SPRITE_W, SPRITE_H } from './types.js';

/**
 * Hair overlays per character × direction. Overlays are 24×32 matrices where
 * only hair pixels (H, h) and outline pixels (K) are set — everything else is
 * transparent so the underlying body silhouette shows through.
 *
 * Directional cues live here rather than in the body pose:
 *   - S: bangs at front, hair sides
 *   - N: full coverage (back of head)
 *   - E/W: side profile — hair mass shifted, one temple visible
 *
 * W is generated at atlas build time by horizontal-mirroring E.
 */

function pad(row: string): string {
  if (row.length > SPRITE_W) {
    console.warn(`heads.ts: row width ${row.length} > ${SPRITE_W}, truncating — "${row}"`);
    return row.slice(0, SPRITE_W);
  }
  return row.length === SPRITE_W ? row : row + '.'.repeat(SPRITE_W - row.length);
}

/** Build a 32-row matrix from a partial map. Missing rows are transparent. */
function buildOverlay(rows: Record<number, string>): PixelMatrix {
  const out: string[] = [];
  for (let y = 0; y < SPRITE_H; y++) {
    out.push(pad(rows[y] ?? '.'.repeat(SPRITE_W)));
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// Shared head silhouette guides (row indices)
// Row 2:  top crown (8 wide, cols 8-15)
// Row 3:  upper (12 wide, cols 6-17)
// Row 4-5: max width (14 wide, cols 5-18)
// Row 6-11: face reveal area
// ────────────────────────────────────────────────────────────────

/** Front-facing hair with bangs — covers top, sides, back of head, leaves face reveal. */
function frontHair(): Record<number, string> {
  return {
    2: '........HHHHHHHH........',
    3: '......HHHHHHHHHHHH......',
    4: '.....HHHHHHHHHHHHHH.....',
    5: '.....HhHHHHHHHHHHhH.....',
    6: '.....HH..........HH.....', // bangs create face reveal opening
    7: '.....H............H.....',
    // rows 8-11 hair sides only, face middle transparent
    8: '.....H............H.....',
    9: '.....H............H.....',
    10: '......H..........H......',
  };
}

/** Fringe-with-parting front hair (asymmetric bangs across forehead). */
function frontHairParted(): Record<number, string> {
  return {
    2: '........HHHHHHHH........',
    3: '......HHHHHHHHHHHH......',
    4: '.....HHHHHHHHHHHHHH.....',
    5: '.....HhHHHHHHHHHHhH.....',
    6: '.....HHHHH...HHHHHH.....', // parted bangs on right side
    7: '.....H...............H..',
    8: '.....H............H.....',
    9: '.....H............H.....',
    10: '......H..........H......',
  };
}

/** Hood-shaped front — hair sits low, brow shadowed. */
function hoodHair(): Record<number, string> {
  return {
    1: '.......HHHHHHHHHH.......',
    2: '.....HHHHHHHHHHHHHH.....',
    3: '....HHHHHHHHHHHHHHHH....',
    4: '....HHHHHHHHHHHHHHHH....',
    5: '....HhHHHHHHHHHHHHhH....',
    6: '....HHHHH......HHHHH....', // deep hood shadow
    7: '.....H.............H....',
    8: '.....H............H.....',
    9: '.....H............H.....',
    10: '......H..........H......',
  };
}

/** Long/tied hair — extra bulk down sides, small tail. */
function longHair(): Record<number, string> {
  return {
    2: '........HHHHHHHH........',
    3: '......HHHHHHHHHHHH......',
    4: '.....HHHHHHHHHHHHHH.....',
    5: '.....HhHHHHHHHHHHhH.....',
    6: '.....HH..........HH.....',
    7: '.....H............H.....',
    8: '.....H............H.....',
    9: '.....H............H.....',
    10: '.....H............H.....',
    11: '.....H............H.....',
    12: '......H..........H......',
    13: '......HH........HH......',
  };
}

/** Back view — full head coverage, small nape triangle. */
function backHair(bulk: 'normal' | 'hood' | 'long' = 'normal'): Record<number, string> {
  const base: Record<number, string> = {
    2: '........HHHHHHHH........',
    3: '......HHHHHHHHHHHH......',
    4: '.....HHHHHHHHHHHHHH.....',
    5: '.....HHHHHHHHHHHHHH.....',
    6: '.....HHHHHHHHHHHHHH.....',
    7: '.....HHHHHHHHHHHHHH.....',
    8: '.....HHHHHHHHHHHHHH.....',
    9: '.....HHHHHHHHHHHHHH.....',
    10: '.....HHHHHHHHHHHHHH.....',
    11: '.....HHHHHHHHHHHHHH.....',
    12: '......HHHHHHHHHHHH......',
    13: '.......HHHHHHHHHH.......',
  };
  if (bulk === 'hood') {
    base[1] = '.......HHHHHHHHHH.......';
    base[2] = '.....HHHHHHHHHHHHHH.....';
    base[3] = '....HHHHHHHHHHHHHHHH....';
    base[4] = '....HHHHHHHHHHHHHHHH....';
    base[5] = '....HHHHHHHHHHHHHHHH....';
    base[14] = '........HHHHHHHH........';
  }
  if (bulk === 'long') {
    base[14] = '......HHHHHHHHHHHH......';
    base[15] = '.......HHHHHHHHHH.......'; // nape trail
  }
  return base;
}

/**
 * Side-profile hair (facing E). Hair mass shifted to back-left (viewer's left),
 * front-right shows face. Includes small "ear" of hair strand near center.
 */
function sideHair(style: 'normal' | 'hood' | 'long' | 'parted' = 'normal'): Record<number, string> {
  const base: Record<number, string> = {
    2: '........HHHHHHHH........',
    3: '......HHHHHHHHHHHH......',
    4: '.....HHHHHHHHHHHHHH.....',
    5: '.....HHHHHHHHHHHHHH.....',
    6: '.....HHHHHHHH......H....', // face reveal shifted right
    7: '.....HHHHHH........H....',
    8: '.....HHHHH.........H....',
    9: '.....HHHHH.........H....',
    10: '.....HHHHH.........H....',
    11: '.....HHHHH.........H....',
    12: '......HHHH........H.....',
    13: '.......HHH.......H......',
  };
  if (style === 'hood') {
    base[1] = '.......HHHHHHHHHH.......';
    base[2] = '.....HHHHHHHHHHHHHH.....';
    base[3] = '....HHHHHHHHHHHHHHHH....';
    base[4] = '....HHHHHHHHHHHHHHHH....';
    base[5] = '....HHHHHHHHHHHHHHHH....';
    base[6] = '....HHHHHHHHH......H....';
  }
  if (style === 'long') {
    base[13] = '......HHHHHH.....H......';
    base[14] = '......HHHHHH............';
    base[15] = '......HHHH..............';
  }
  if (style === 'parted') {
    base[6] = '.....HHHHHHHHHH....H....';
  }
  return base;
}

const KIM_STYLE = 'parted';       // PM sharp look
const PLANNER_STYLE = 'normal';   // clean cut
const TESTER_STYLE = 'normal';    // tied-back with goggles band
const DEBUGGER_STYLE = 'hood';    // hoodie
const REVIEWER_STYLE = 'parted';  // sharp side part
const DOCS_STYLE = 'long';        // long tied hair

interface HeadSet {
  S: PixelMatrix;
  N: PixelMatrix;
  E: PixelMatrix;
  W: PixelMatrix;
}

function makeHeadSet(style: 'normal' | 'hood' | 'long' | 'parted'): HeadSet {
  const s: Record<number, string> =
    style === 'parted' ? frontHairParted()
    : style === 'hood' ? hoodHair()
    : style === 'long' ? longHair()
    : frontHair();
  const n: Record<number, string> = backHair(style === 'hood' ? 'hood' : style === 'long' ? 'long' : 'normal');
  const e: Record<number, string> = sideHair(style);

  return {
    S: buildOverlay(s),
    N: buildOverlay(n),
    E: buildOverlay(e),
    // W is a placeholder; atlas mirrors E at build time.
    W: buildOverlay(e),
  };
}

export const HEADS: Record<CharacterId, HeadSet> = {
  'team-lead': makeHeadSet(KIM_STYLE),
  'planner-researcher': makeHeadSet(PLANNER_STYLE),
  'tester': makeHeadSet(TESTER_STYLE),
  'debugger': makeHeadSet(DEBUGGER_STYLE),
  'code-reviewer': makeHeadSet(REVIEWER_STYLE),
  'docs-manager': makeHeadSet(DOCS_STYLE),
};

export type { HeadSet };
