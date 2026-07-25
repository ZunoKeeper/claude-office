/**
 * 2:1 isometric projection.
 *
 * World coordinates: flat pixel plane, e.g. seat positions in config are
 * `(worldX, worldY)`. World +x is east, +y is south (screen-down), +z is up.
 *
 * Screen: canvas pixels. Screen +x is right, +y is down.
 *
 * Projection:
 *   screenX = originX + (worldX - worldY) * scaleX
 *   screenY = originY + (worldX + worldY) * scaleY - worldZ
 *
 * scaleX / scaleY = 2 gives the classic diamond tile look. A 1×1 world square
 * projects to a rhombus of width 2·scaleX = 1 and height 2·scaleY = 0.5 —
 * exactly the 2:1 aspect ratio.
 *
 * With scale (0.5, 0.25) the entire world rectangle
 * (0..1000, 0..600) lands in canvas coords roughly (212..1012, 60..460),
 * fitting inside the 1024×640 office canvas with margin for wall height above.
 */

export interface IsoPoint { x: number; y: number }

export const ISO_SCALE_X = 0.5;
export const ISO_SCALE_Y = 0.25;
export const ISO_ORIGIN_X = 512;
export const ISO_ORIGIN_Y = 90;

export function worldToScreen(worldX: number, worldY: number, worldZ = 0): IsoPoint {
  return {
    x: ISO_ORIGIN_X + (worldX - worldY) * ISO_SCALE_X,
    y: ISO_ORIGIN_Y + (worldX + worldY) * ISO_SCALE_Y - worldZ,
  };
}

/**
 * Invert worldToScreen assuming worldZ=0 (character standing on the floor).
 * Used by the ticker so the depth sort tracks the sprite's current screen
 * position throughout a walking tween, not just its destination.
 */
export function screenToWorld(screenX: number, screenY: number): IsoPoint {
  const dx = (screenX - ISO_ORIGIN_X) / ISO_SCALE_X; // = wx - wy
  const dy = (screenY - ISO_ORIGIN_Y) / ISO_SCALE_Y; // = wx + wy
  return { x: (dx + dy) / 2, y: (dy - dx) / 2 };
}

/**
 * Depth key for painter's-algorithm sorting. Objects further "south" or "east"
 * in the world sit closer to the camera and should render on top. Using
 * (worldX + worldY) sorts diagonals-of-equal-depth together, which matches
 * how the projection stacks pixels along the ISO_SCALE_Y axis.
 */
export function depthKey(worldX: number, worldY: number): number {
  return worldX + worldY;
}
