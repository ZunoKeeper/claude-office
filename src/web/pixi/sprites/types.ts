import type { CharacterId } from '../../../shared/character.js';

export const SPRITE_W = 24;
export const SPRITE_H = 32;

export type Direction = 'S' | 'N' | 'E' | 'W';

export type PoseKey =
  | 'stand-S' | 'stand-N' | 'stand-E' | 'stand-W'
  | 'walk1-S' | 'walk1-N' | 'walk1-E' | 'walk1-W'
  | 'walk2-S' | 'walk2-N' | 'walk2-E' | 'walk2-W'
  | 'sit' | 'type1' | 'type2';

export const ALL_POSES: PoseKey[] = [
  'stand-S', 'stand-N', 'stand-E', 'stand-W',
  'walk1-S', 'walk1-N', 'walk1-E', 'walk1-W',
  'walk2-S', 'walk2-N', 'walk2-E', 'walk2-W',
  'sit', 'type1', 'type2',
];

/** 24×32 pixel matrix stored as 32 rows of 24-character strings. */
export type PixelMatrix = readonly string[];

/** Symbol → hex color. Any symbol resolving to null or 'transparent' is skipped. */
export type Palette = Record<string, string | null>;

/** Reserved base symbols (present in shared body poses). */
export type BaseSymbol =
  | '.'  // transparent
  | 'K'  // outline (near-black)
  | 'k'  // soft outline (secondary shading)
  | 'F'  // skin base
  | 'f'  // skin shadow
  | 'S'  // shirt / outfit base
  | 's'  // shirt shadow
  | 'P'  // pants base
  | 'p'  // pants shadow
  | 'A'  // arm skin (visible when not fully sleeved)
  | 'T'  // outfit accent (tie, badge)
  | 'Z'; // shoes

/** Symbols added by head/face/accessory overlays. */
export type OverlaySymbol =
  | 'H'  // hair base
  | 'h'  // hair highlight
  | 'E'  // eye
  | 'M'  // mouth
  | 'G'  // glasses frame
  | 'a'  // accessory secondary
  | 'X'; // accessory main (avoid A collision with arm)

export type CharacterKey = CharacterId;

export interface CharacterSpriteSpec {
  palette: Palette;
  /** Head/hair overlay per direction. Same 24×32 grid, only hair pixels set (H/h). */
  head: Record<Direction, PixelMatrix>;
  /** Face overlay: eyes, mouth, glasses. Applied for S/E/W (N shows back of head only). */
  face: Record<Direction, PixelMatrix>;
  /** Optional accessory overlay per pose. */
  accessory?: Partial<Record<PoseKey, PixelMatrix>>;
}
