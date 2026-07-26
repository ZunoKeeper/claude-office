import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { WaypointMap, WaypointPoint } from '../../shared/config.js';

const OVERRIDES_DIR = path.join(homedir(), '.claude-office');
const WAYPOINTS_FILE = path.join(OVERRIDES_DIR, 'waypoints.json');

/** 씬 논리 좌표계 경계 — 좌표는 저장 시 이 범위로 클램프된다. */
const MAX_X = 920;
const MAX_Y = 510;
const MAX_POINTS = 12;

export async function loadWaypoints(): Promise<WaypointMap> {
  try {
    const raw = await readFile(WAYPOINTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as WaypointMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveWaypoints(map: WaypointMap): Promise<string> {
  await mkdir(OVERRIDES_DIR, { recursive: true });
  await writeFile(WAYPOINTS_FILE, JSON.stringify(map, null, 2) + '\n', 'utf8');
  return WAYPOINTS_FILE;
}

/** PUT 바디의 points를 검증·정규화한다. 형식이 어긋나면 null. */
export function sanitizePoints(input: unknown): WaypointPoint[] | null {
  if (!Array.isArray(input) || input.length > MAX_POINTS) return null;
  const out: WaypointPoint[] = [];
  for (const p of input) {
    const { x, y } = (p ?? {}) as { x?: unknown; y?: unknown };
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    out.push({
      x: Math.round(Math.max(0, Math.min(MAX_X, x))),
      y: Math.round(Math.max(0, Math.min(MAX_Y, y))),
    });
  }
  return out;
}
