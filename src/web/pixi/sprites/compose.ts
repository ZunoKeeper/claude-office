import type { CharacterId } from '../../../shared/character.js';
import {
  DEFAULT_APPEARANCES, isValidAppearance,
  type AppearanceDoc, type CharacterAppearance,
} from '../../../shared/sprites.js';
import { FRAME_H, FRAME_W, frameRect } from './frames.js';
import { getSheet } from './sheets.js';
import { poseToFrame, type PoseKey } from './types.js';

/**
 * MetroCity 시트 합성 — 그림자 → 몸통(피부) → 의상 → 헤어 순서로
 * 32×32 캔버스에 겹쳐 그린다. atlas.ts(씬 텍스처)와 PixelAvatar(카드),
 * AppearanceEditor(설정창 미리보기)가 공유한다.
 */

let activeDoc: AppearanceDoc = {};

/** 서버 저장 문서 주입 — App.tsx가 /config/sprites 취득 시 호출. */
export function setAppearances(doc: AppearanceDoc | null | undefined): void {
  activeDoc = doc ?? {};
}

export function getAppearance(char: CharacterId): CharacterAppearance {
  const a = activeDoc[char];
  return a && isValidAppearance(a) ? a : DEFAULT_APPEARANCES[char];
}

export function composeFrame(a: CharacterAppearance, pose: PoseKey): HTMLCanvasElement {
  const { dir, frame, yOff } = poseToFrame(pose);
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('compose: 2D context unavailable');
  ctx.imageSmoothingEnabled = false;
  // 그림자는 단일 프레임이고 타이핑 오프셋의 영향을 받지 않는다.
  ctx.drawImage(getSheet('shadow'), 0, 0);
  const layers: Array<{ sheet: string; row: number }> = [{ sheet: 'body', row: a.skin }];
  if (a.outfit) layers.push(a.outfit);
  if (a.hair) layers.push(a.hair);
  for (const { sheet, row } of layers) {
    const r = frameRect(dir, frame, row);
    ctx.drawImage(getSheet(sheet), r.x, r.y, r.w, r.h, 0, yOff, r.w, r.h);
  }
  return canvas;
}

export function composeSprite(char: CharacterId, pose: PoseKey): HTMLCanvasElement {
  return composeFrame(getAppearance(char), pose);
}
