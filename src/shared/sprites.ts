import type { CharacterId } from './character.js';

/** 스프라이트 조합 파트 참조 — sheet는 카탈로그 키, row는 시트 내 행. */
export interface SpritePartRef { sheet: string; row: number }

export interface CharacterAppearance {
  /** 몸통 시트 행(피부톤) 0..SKIN_COUNT-1 */
  skin: number;
  /** null = 민머리 */
  hair: SpritePartRef | null;
  /** null = 기본(속옷) */
  outfit: SpritePartRef | null;
}

/** 캐릭터(에이전트)별 저장 문서 — ~/.claude-office/sprites.json */
export type AppearanceDoc = Partial<Record<CharacterId, CharacterAppearance>>;

export const SKIN_COUNT = 6;
export const HAIR_SHEETS: Readonly<Record<string, number>> = { hairs: 8, 'hair-gold': 5 };
export const OUTFIT_SHEETS: Readonly<Record<string, number>> = {
  suit: 4, suit1: 5, outfit1: 1, outfit2: 1, outfit3: 1, outfit4: 1, outfit5: 1, outfit6: 1,
};

function isValidPart(ref: SpritePartRef | null | undefined, sheets: Readonly<Record<string, number>>): boolean {
  if (ref === null || ref === undefined) return true;
  if (typeof ref !== 'object') return false;
  const rows = sheets[ref.sheet];
  return rows !== undefined && Number.isInteger(ref.row) && ref.row >= 0 && ref.row < rows;
}

export function isValidAppearance(a: CharacterAppearance): boolean {
  return !!a && typeof a === 'object'
    && Number.isInteger(a.skin) && a.skin >= 0 && a.skin < SKIN_COUNT
    && isValidPart(a.hair, HAIR_SHEETS)
    && isValidPart(a.outfit, OUTFIT_SHEETS);
}

/** 에이전트별 기본 외모 — 서로 구분되는 조합. */
export const DEFAULT_APPEARANCES: Record<CharacterId, CharacterAppearance> = {
  'team-lead':          { skin: 0, hair: { sheet: 'hairs', row: 0 }, outfit: { sheet: 'suit', row: 0 } },
  'planner-researcher': { skin: 1, hair: { sheet: 'hair-gold', row: 0 }, outfit: { sheet: 'suit1', row: 2 } },
  'tester':             { skin: 2, hair: { sheet: 'hairs', row: 2 }, outfit: { sheet: 'outfit1', row: 0 } },
  'debugger':           { skin: 3, hair: { sheet: 'hairs', row: 6 }, outfit: { sheet: 'suit', row: 1 } },
  'code-reviewer':      { skin: 4, hair: { sheet: 'hairs', row: 3 }, outfit: { sheet: 'suit1', row: 0 } },
  'docs-manager':       { skin: 5, hair: { sheet: 'hairs', row: 1 }, outfit: { sheet: 'outfit4', row: 0 } },
};
