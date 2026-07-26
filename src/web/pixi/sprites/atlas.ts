import { Texture } from 'pixi.js';
import { ALL_CHARACTER_IDS, type CharacterId } from '../../../shared/character.js';
import { composeSprite } from './compose.js';
import { ALL_POSES } from './types.js';
import type { PoseKey } from './types.js';

/**
 * 앱 시작 시 캐릭터 × 포즈 전체를 PIXI.Texture 캐시로 합성한다.
 * CharacterSprite는 프레임마다 `sprite.texture = atlas.get(...)`만 바꾼다.
 * 전제: loadSheets()가 완료된 뒤에 호출되어야 한다 (App.tsx가 게이팅).
 */

export interface CharacterAtlas {
  get(char: CharacterId, pose: PoseKey): Texture;
}

let cachedAtlas: CharacterAtlas | null = null;

/** 외모 조합이 바뀌면 호출 — 다음 buildAtlas가 새로 합성한다. */
export function invalidateAtlas(): void {
  cachedAtlas = null;
}

export function buildAtlas(): CharacterAtlas {
  if (cachedAtlas) return cachedAtlas;

  const cache = new Map<string, Texture>();

  for (const char of ALL_CHARACTER_IDS) {
    for (const pose of ALL_POSES) {
      // composeSprite가 포즈마다 새 canvas를 만든다 — Pixi는 소스 요소 단위로
      // 텍스처를 캐시하므로 canvas를 공유하면 모두 마지막 그림을 가리킨다.
      const tex = Texture.from(composeSprite(char, pose));
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
