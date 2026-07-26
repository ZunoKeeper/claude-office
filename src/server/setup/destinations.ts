import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ToolDestination } from '../../shared/config.js';

const OVERRIDES_DIR = path.join(homedir(), '.claude-office');
const DEST_OVERRIDES_FILE = path.join(OVERRIDES_DIR, 'destinationOverrides.json');

/** 좌표만 사용자별로 오버라이드한다 — 라벨/툴 매핑은 config가 원본. */
export type DestinationOverrideMap = Partial<Record<string, { x: number; y: number }>>;

export async function loadDestinationsBase(configDir: string): Promise<ToolDestination[]> {
  try {
    const raw = await readFile(path.join(configDir, 'toolDestinations.json'), 'utf8');
    const parsed = JSON.parse(raw) as ToolDestination[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadDestinationOverrides(): Promise<DestinationOverrideMap> {
  try {
    const raw = await readFile(DEST_OVERRIDES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DestinationOverrideMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveDestinationOverrides(overrides: DestinationOverrideMap): Promise<string> {
  await mkdir(OVERRIDES_DIR, { recursive: true });
  await writeFile(DEST_OVERRIDES_FILE, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
  return DEST_OVERRIDES_FILE;
}

export function applyDestinationOverrides(
  base: ToolDestination[],
  overrides: DestinationOverrideMap,
): ToolDestination[] {
  return base.map((d) => {
    const o = overrides[d.id];
    if (!o) return d;
    return { ...d, x: o.x, y: o.y };
  });
}
