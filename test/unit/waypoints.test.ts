import { describe, it, expect } from 'vitest';
import { sanitizePoints } from '../../src/server/setup/waypoints.js';

describe('sanitizePoints', () => {
  it('rounds and clamps valid points to the 920×510 stage', () => {
    expect(sanitizePoints([{ x: 100.6, y: -5 }, { x: 999, y: 511 }])).toEqual([
      { x: 101, y: 0 },
      { x: 920, y: 510 },
    ]);
  });

  it('accepts an empty array (경로 삭제)', () => {
    expect(sanitizePoints([])).toEqual([]);
  });

  it('rejects non-arrays and malformed points', () => {
    expect(sanitizePoints(undefined)).toBeNull();
    expect(sanitizePoints('nope')).toBeNull();
    expect(sanitizePoints([{ x: 1 }])).toBeNull();
    expect(sanitizePoints([{ x: 'a', y: 2 }])).toBeNull();
    expect(sanitizePoints([{ x: Infinity, y: 2 }])).toBeNull();
  });

  it('rejects more than 12 points', () => {
    const pts = Array.from({ length: 13 }, (_, i) => ({ x: i, y: i }));
    expect(sanitizePoints(pts)).toBeNull();
  });
});
