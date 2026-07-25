import type { CharacterId } from '../../../shared/character.js';
import { bodyStand, bodyWalk1, bodyWalk2, bodySit, bodyType1, bodyType2 } from './bodyPoses.js';
import { HEADS } from './heads.js';
import { FACES } from './faces.js';
import { ACCESSORIES } from './accessories.js';
import { PALETTES } from './palettes.js';
import type { Direction, Palette, PixelMatrix, PoseKey } from './types.js';
import { SPRITE_H, SPRITE_W } from './types.js';

/**
 * Pure matrix composition — no DOM, no Pixi. Used by:
 *   - atlas.ts (browser, wraps result in a canvas → PIXI.Texture)
 *   - PixelAvatar.tsx (SVG portrait for grid cards)
 */

export function extractDirection(pose: PoseKey): Direction {
  if (pose.endsWith('-N')) return 'N';
  if (pose.endsWith('-E')) return 'E';
  if (pose.endsWith('-W')) return 'W';
  return 'S';
}

export function pickBody(pose: PoseKey): PixelMatrix {
  if (pose === 'sit') return bodySit;
  if (pose === 'type1') return bodyType1;
  if (pose === 'type2') return bodyType2;
  if (pose.startsWith('walk1')) return bodyWalk1;
  if (pose.startsWith('walk2')) return bodyWalk2;
  return bodyStand;
}

function stampLayer(rows: string[], overlay: PixelMatrix): void {
  for (let y = 0; y < SPRITE_H; y++) {
    const src = overlay[y];
    if (!src) continue;
    const dst = rows[y];
    let next = '';
    for (let x = 0; x < SPRITE_W; x++) {
      const c = src[x] ?? '.';
      next += c !== '.' ? c : (dst[x] ?? '.');
    }
    rows[y] = next;
  }
}

function mirrorMatrix(rows: string[]): string[] {
  return rows.map((r) => r.split('').reverse().join(''));
}

export interface Composed {
  matrix: string[];
  palette: Palette;
  width: number;
  height: number;
}

export function composeSprite(char: CharacterId, pose: PoseKey): Composed {
  const dir = extractDirection(pose);
  const body = pickBody(pose);
  const head = HEADS[char][dir];
  const face = FACES[dir];
  const acc = ACCESSORIES[char][dir];
  // Layer order: body → head → face → accessory. When facing W the whole
  // composite mirrors so that E-authored overlays (heads.ts, faces.ts,
  // accessories.ts all use the E matrix for W) end up on the correct side.
  // Asymmetric S-only accessories (planner's chest badge) never hit the mirror
  // path because their S/N/E/W sets are empty for the mirrored directions.
  const rows = [...body];
  stampLayer(rows, head);
  stampLayer(rows, face);
  stampLayer(rows, acc);
  const finalRows = dir === 'W' ? mirrorMatrix(rows) : rows;
  return {
    matrix: finalRows,
    palette: PALETTES[char],
    width: SPRITE_W,
    height: SPRITE_H,
  };
}
