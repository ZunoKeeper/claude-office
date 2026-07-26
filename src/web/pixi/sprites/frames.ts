export const FRAME_W = 32;
export const FRAME_H = 32;
export type Direction = 'S' | 'N' | 'E' | 'W';

/** 시트 내 방향별 시작 열. W(18–23)는 E(6–11)의 좌우 미러 프레임. */
const DIR_BLOCK: Record<Direction, number> = { S: 0, E: 6, N: 12, W: 18 };

export function frameCol(dir: Direction, frame: number): number {
  const f = Math.min(5, Math.max(0, Math.floor(frame)));
  return DIR_BLOCK[dir] + f;
}

export interface FrameRect { x: number; y: number; w: number; h: number }

/** 시트 픽셀 좌표 — row는 시트 내 배리에이션(피부톤·헤어·의상) 행. */
export function frameRect(dir: Direction, frame: number, row: number): FrameRect {
  return { x: frameCol(dir, frame) * FRAME_W, y: row * FRAME_H, w: FRAME_W, h: FRAME_H };
}
