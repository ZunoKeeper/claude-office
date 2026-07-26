import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadWaypointsBase, mergeWaypoints, sanitizePoints } from '../../src/server/setup/waypoints.js';

const CONFIG_DIR = path.resolve(process.cwd(), 'config');

describe('waypoints base + merge', () => {
  it('저장소 기본 경유점(config/waypoints.json)을 로드한다', async () => {
    const base = await loadWaypointsBase(CONFIG_DIR);
    expect(Object.keys(base).length).toBeGreaterThan(0);
    // 배포 기본값: 모든 항목이 실제 존재하는 목적지를 가리킨다
    for (const routes of Object.values(base)) {
      for (const [destId, points] of Object.entries(routes)) {
        expect(['dashboard', 'library', 'pantry']).toContain(destId);
        expect(points.length).toBeGreaterThan(0);
      }
    }
  });

  it('config 파일이 없으면 {} 반환', async () => {
    expect(await loadWaypointsBase(path.join(CONFIG_DIR, 'no-such-dir'))).toEqual({});
  });

  it('사용자 편집분이 목적지 단위로 기본값을 덮어쓴다', () => {
    const base = {
      'team-lead': { pantry: [{ x: 1, y: 1 }], library: [{ x: 2, y: 2 }] },
    };
    const over = {
      'team-lead': { pantry: [{ x: 9, y: 9 }] },
      tester: { dashboard: [{ x: 5, y: 5 }] },
    };
    expect(mergeWaypoints(base, over)).toEqual({
      'team-lead': { pantry: [{ x: 9, y: 9 }], library: [{ x: 2, y: 2 }] },
      tester: { dashboard: [{ x: 5, y: 5 }] },
    });
  });
});

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
