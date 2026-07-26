import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { ALL_CHARACTER_IDS, type CharacterId } from '../../shared/character.js';
import { isValidAppearance, type AppearanceDoc, type CharacterAppearance } from '../../shared/sprites.js';

const OVERRIDES_DIR = path.join(homedir(), '.claude-office');
const SPRITES_FILE = path.join(OVERRIDES_DIR, 'sprites.json');

/** PUT 바디 전체 검증. 형식이 어긋나면 null (구버전 픽셀 오버라이드 문서 포함). */
export function sanitizeAppearanceDoc(input: unknown): AppearanceDoc | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: AppearanceDoc = {};
  for (const [id, entry] of Object.entries(input as Record<string, unknown>)) {
    if (!ALL_CHARACTER_IDS.includes(id as CharacterId)) return null;
    const a = entry as CharacterAppearance;
    if (!isValidAppearance(a)) return null;
    out[id as CharacterId] = { skin: a.skin, hair: a.hair ?? null, outfit: a.outfit ?? null };
  }
  return out;
}

export async function loadSprites(): Promise<AppearanceDoc> {
  try {
    const raw = await readFile(SPRITES_FILE, 'utf8');
    return sanitizeAppearanceDoc(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

export async function saveSprites(doc: AppearanceDoc): Promise<string> {
  await mkdir(OVERRIDES_DIR, { recursive: true });
  await writeFile(SPRITES_FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return SPRITES_FILE;
}
