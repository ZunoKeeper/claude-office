import type { CharacterId } from './character.js';

export type SeatDirection = 'N' | 'S' | 'E' | 'W';
export type SeatPose = 'stand' | 'sit' | 'type';

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  role: string;
  model?: string;
  description?: string;
  officeSeat: { x: number; y: number };
  /** Which way the character faces while at rest. Defaults to 'S'. */
  seatDirection?: SeatDirection;
  /** Resting pose while status='idle'/'off'. Defaults to 'stand'. */
  seatPose?: SeatPose;
  spriteSheet: string;
}

/** 툴 실행 시 캐릭터가 걸어가는 목적지. 좌표는 오피스 씬의 920×510 논리
 *  좌표계 기준이라 화면 스케일과 무관하게 유지된다. */
export interface ToolDestination {
  id: string;
  label: string;
  x: number;
  y: number;
  /** 이 목적지로 이동을 트리거하는 툴 이름들 */
  tools: string[];
}

/** 걷기 경유점 하나 (920×510 논리 좌표). */
export interface WaypointPoint { x: number; y: number }

/** 캐릭터 → 목적지 id → 경유점 목록. 자리→경유점들→목적지 순서로 걷고,
 *  돌아올 때는 역순. 항목이 없으면 직선 이동. */
export type WaypointMap = Partial<Record<CharacterId, Record<string, WaypointPoint[]>>>;

export interface ActivityRule {
  characterId: CharacterId;
  match: {
    toolName?: string[];
    filePathPattern?: string;
    bashCommandPattern?: string;
    webFetchUrlPattern?: string;
  };
  priority: number;
}
