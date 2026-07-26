import { describe, expect, it } from 'vitest';
import { frameRect, frameCol } from '../../src/web/pixi/sprites/frames.js';

describe('frameRect', () => {
  it('S 방향 0번 프레임은 원점', () => {
    expect(frameRect('S', 0, 0)).toEqual({ x: 0, y: 0, w: 32, h: 32 });
  });
  it('E 블록은 6열부터', () => {
    expect(frameRect('E', 2, 1)).toEqual({ x: 8 * 32, y: 32, w: 32, h: 32 });
  });
  it('N 블록은 12열부터, W 블록은 18열부터', () => {
    expect(frameCol('N', 5)).toBe(17);
    expect(frameCol('W', 0)).toBe(18);
  });
  it('프레임 인덱스는 0..5로 클램프', () => {
    expect(frameCol('S', 9)).toBe(5);
    expect(frameCol('S', -1)).toBe(0);
  });
});
