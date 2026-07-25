import type { CharacterId } from '../../shared/character.js';
import { composeSprite } from '../pixi/sprites/compose.js';
import type { PoseKey } from '../pixi/sprites/types.js';

interface Props {
  id: CharacterId;
  size?: number;
  pose?: PoseKey;
}

export function PixelAvatar({ id, size = 48, pose = 'stand-S' }: Props) {
  const { matrix, palette, width, height } = composeSprite(id, pose);
  const rects: JSX.Element[] = [];
  for (let y = 0; y < height; y++) {
    const row = matrix[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!ch || ch === '.') continue;
      const color = palette[ch];
      if (!color) continue;
      rects.push(<rect key={`${y}-${x}`} x={x} y={y} width={1} height={1} fill={color} />);
    }
  }
  const scaledHeight = Math.round((size * height) / width);
  return (
    <svg
      className="pixel-avatar"
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={scaledHeight}
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated', display: 'block' }}
    >
      {rects}
    </svg>
  );
}
