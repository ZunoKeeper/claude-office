import type { CharacterId } from '../../shared/character.js';
import { CHARACTERS } from './pixelData.js';

interface Props {
  id: CharacterId;
  size?: number;
}

export function PixelAvatar({ id, size = 48 }: Props) {
  const spec = CHARACTERS[id];
  if (!spec) return null;
  const height = spec.pixels.length;
  const width = spec.pixels[0]?.length ?? 0;
  const rects: JSX.Element[] = [];
  for (let y = 0; y < height; y++) {
    const row = spec.pixels[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = spec.palette[ch];
      if (!color || color === 'transparent') continue;
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
