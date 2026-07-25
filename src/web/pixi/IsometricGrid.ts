export const TILE_W = 64;
export const TILE_H = 32;

export function screenXY(
  tileX: number,
  tileY: number,
  originX = 512,
  originY = 80,
): { x: number; y: number } {
  return {
    x: originX + (tileX - tileY) * (TILE_W / 2),
    y: originY + (tileX + tileY) * (TILE_H / 2),
  };
}
