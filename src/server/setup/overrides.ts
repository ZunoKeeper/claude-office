import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { CharacterId } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

const OVERRIDES_DIR = path.join(homedir(), '.claude-office');
const OVERRIDES_FILE = path.join(OVERRIDES_DIR, 'overrides.json');

/** Fields users are allowed to override via the settings screen or the
 *  in-app edit-mode drag. Role/description stay derived from the router
 *  config so they're not editable here. Seat + direction go here (rather
 *  than characters.json) because they're per-user layout, not a code-level
 *  behavior change. */
export type OverridableField = 'name' | 'officeSeat' | 'seatDirection';
export type CharacterOverrides = Partial<Pick<CharacterConfig, OverridableField>>;
export type OverrideMap = Partial<Record<CharacterId, CharacterOverrides>>;

export async function loadOverrides(): Promise<OverrideMap> {
  try {
    const raw = await readFile(OVERRIDES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as OverrideMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveOverrides(overrides: OverrideMap): Promise<string> {
  await mkdir(OVERRIDES_DIR, { recursive: true });
  await writeFile(OVERRIDES_FILE, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
  return OVERRIDES_FILE;
}

export function applyOverrides(base: CharacterConfig[], overrides: OverrideMap): CharacterConfig[] {
  return base.map((c) => {
    const o = overrides[c.id];
    if (!o) return c;
    return { ...c, ...o };
  });
}

export function overridesPath(): string {
  return OVERRIDES_FILE;
}
