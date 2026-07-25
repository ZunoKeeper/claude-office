import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ALL_CHARACTER_IDS, type CharacterId } from '../../shared/character.js';
import type { CharacterConfig, ActivityRule } from '../../shared/config.js';

const KNOWN = new Set<CharacterId>(ALL_CHARACTER_IDS);

export async function loadConfig(dir: string): Promise<{ characters: CharacterConfig[]; rules: ActivityRule[] }> {
  const [charsRaw, rulesRaw] = await Promise.all([
    readFile(path.join(dir, 'characters.json'), 'utf8'),
    readFile(path.join(dir, 'activityRules.json'), 'utf8'),
  ]);
  const characters = JSON.parse(charsRaw) as CharacterConfig[];
  const rules = JSON.parse(rulesRaw) as ActivityRule[];

  for (const c of characters) {
    if (!KNOWN.has(c.id)) throw new Error(`Unknown character id: ${c.id}`);
  }
  for (const r of rules) {
    if (!KNOWN.has(r.characterId)) throw new Error(`Rule references unknown character: ${r.characterId}`);
  }

  rules.sort((a, b) => b.priority - a.priority);
  return { characters, rules };
}
