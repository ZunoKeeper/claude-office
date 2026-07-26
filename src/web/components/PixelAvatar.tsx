import { useEffect, useRef } from 'react';
import type { CharacterId } from '../../shared/character.js';
import { composeSprite } from '../pixi/sprites/compose.js';
import { SPRITE_H, SPRITE_W } from '../pixi/sprites/types.js';
import type { PoseKey } from '../pixi/sprites/types.js';

interface Props {
  id: CharacterId;
  size?: number;
  pose?: PoseKey;
}

export function PixelAvatar({ id, size = 48, pose = 'stand-S' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
    try {
      ctx.drawImage(composeSprite(id, pose), 0, 0);
    } catch {
      // 시트 미로드(App이 로딩을 게이팅하므로 정상 흐름에선 발생하지 않음)
    }
  });
  return (
    <canvas
      ref={ref}
      width={SPRITE_W}
      height={SPRITE_H}
      className="pixel-avatar"
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }}
    />
  );
}
