import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { CharacterId } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

const OVERRIDES_DIR = path.join(homedir(), '.claude-office');
const OVERRIDES_FILE = path.join(OVERRIDES_DIR, 'overrides.json');

/** Fields users are allowed to override via the settings screen.
 *  As of the "actual-model-only" pass, only `name` is editable — role and
 *  description are behavior-derived and should stay in sync with the router
 *  configuration, so we hardcode them in config/characters.json. */
export type OverridableField = 'name';
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
