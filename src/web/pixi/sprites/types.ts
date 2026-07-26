export { FRAME_W as SPRITE_W, FRAME_H as SPRITE_H } from './frames.js';
export type { Direction } from './frames.js';
import type { Direction } from './frames.js';

/** MetroCity 시트 기반 포즈 — 걷기는 6프레임 사이클. */
export type PoseKey =
  | `stand-${Direction}`
  | `walk${1 | 2 | 3 | 4 | 5 | 6}-${Direction}`
  | 'sit' | 'type1' | 'type2';

const DIRS: Direction[] = ['S', 'N', 'E', 'W'];

export const ALL_POSES: PoseKey[] = [
  ...DIRS.map((d) => `stand-${d}` as PoseKey),
  ...([1, 2, 3, 4, 5, 6] as const).flatMap((n) => DIRS.map((d) => `walk${n}-${d}` as PoseKey)),
  'sit', 'type1', 'type2',
];

/** 포즈 → 시트 프레임 매핑. 앉기/타이핑 전용 프레임이 시트에 없어
 *  stand-S로 대체하고, type2만 1px 아래로 내려 타이핑 움직임을 흉내낸다. */
export function poseToFrame(pose: PoseKey): { dir: Direction; frame: number; yOff: number } {
  if (pose === 'sit' || pose === 'type1') return { dir: 'S', frame: 0, yOff: 0 };
  if (pose === 'type2') return { dir: 'S', frame: 0, yOff: 1 };
  const [kind, dir] = pose.split('-') as [string, Direction];
  if (kind === 'stand') return { dir, frame: 0, yOff: 0 };
  return { dir, frame: Number(kind.slice(4)) - 1, yOff: 0 };
}
