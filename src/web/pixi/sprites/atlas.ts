import { Texture } from 'pixi.js';
import { ALL_CHARACTER_IDS, type CharacterId } from '../../../shared/character.js';
import { composeSprite } from './compose.js';
import { ALL_POSES, SPRITE_H, SPRITE_W } from './types.js';
import type { Palette, PoseKey } from './types.js';

/**
 * At app startup composites 6 characters × 15 poses = 90 PIXI.Texture in a
 * cache. CharacterSprite then just swaps `sprite.texture = atlas.get(...)`
 * per frame — no per-pixel Graphics redraw hot path.
 */

export interface CharacterAtlas {
  get(char: CharacterId, pose: PoseKey): Texture;
}

function paintMatrixToCanvas(rows: string[], palette: Palette, ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
  for (let y = 0; y < SPRITE_H; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = row[x];
      if (!ch || ch === '.') continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

let cachedAtlas: CharacterAtlas | null = null;

export function buildAtlas(): CharacterAtlas {
  if (cachedAtlas) return cachedAtlas;

  const cache = new Map<string, Texture>();

  for (const char of ALL_CHARACTER_IDS) {
    for (const pose of ALL_POSES) {
      const { matrix, palette } = composeSprite(char, pose);
      // Fresh canvas per pose — Pixi caches textures by source element, so a
      // shared canvas would make every texture point to the last paint.
      const canvas = document.createElement('canvas');
      canvas.width = SPRITE_W;
      canvas.height = SPRITE_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('atlas: 2D context unavailable');
      ctx.imageSmoothingEnabled = false;
      paintMatrixToCanvas(matrix, palette, ctx);
      const tex = Texture.from(canvas);
      tex.source.scaleMode = 'nearest';
      cache.set(`${char}|${pose}`, tex);
    }
  }

  cachedAtlas = {
    get(char, pose) {
      const t = cache.get(`${char}|${pose}`);
      if (!t) throw new Error(`atlas: missing texture for ${char}|${pose}`);
      return t;
    },
  };
  return cachedAtlas;
}
