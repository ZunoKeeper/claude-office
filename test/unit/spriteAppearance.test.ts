import { describe, expect, it } from 'vitest';
import { sanitizeAppearanceDoc } from '../../src/server/setup/sprites.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';
import { DEFAULT_APPEARANCES, isValidAppearance } from '../../src/shared/sprites.js';

describe('sanitizeAppearanceDoc', () => {
  it('유효한 문서를 통과시킨다', () => {
    const doc = { 'team-lead': { skin: 2, hair: { sheet: 'hairs', row: 7 }, outfit: null } };
    expect(sanitizeAppearanceDoc(doc)).toEqual(doc);
  });
  it('skin 범위 초과 거부', () => {
    expect(sanitizeAppearanceDoc({ tester: { skin: 6, hair: null, outfit: null } })).toBeNull();
  });
  it('모르는 시트/행 초과 거부', () => {
    expect(sanitizeAppearanceDoc({ tester: { skin: 0, hair: { sheet: 'nope', row: 0 }, outfit: null } })).toBeNull();
    expect(sanitizeAppearanceDoc({ tester: { skin: 0, hair: null, outfit: { sheet: 'suit', row: 4 } } })).toBeNull();
  });
  it('모르는 캐릭터 id 거부', () => {
    expect(sanitizeAppearanceDoc({ ghost: { skin: 0, hair: null, outfit: null } })).toBeNull();
  });
  it('구버전 픽셀 오버라이드 문서 거부', () => {
    expect(sanitizeAppearanceDoc({ bodies: { stand: [] } })).toBeNull();
  });
  it('hair/outfit 생략은 null로 정규화', () => {
    expect(sanitizeAppearanceDoc({ tester: { skin: 1 } })).toEqual({
      tester: { skin: 1, hair: null, outfit: null },
    });
  });
});

describe('DEFAULT_APPEARANCES', () => {
  it('모든 캐릭터가 유효한 기본 외모를 가진다', () => {
    for (const id of ALL_CHARACTER_IDS) expect(isValidAppearance(DEFAULT_APPEARANCES[id])).toBe(true);
  });
});
