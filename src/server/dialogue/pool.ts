import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ALL_CHARACTER_IDS, type CharacterId } from '../../shared/character.js';
import type { DialogueEntry } from '../../shared/dialogue.js';
import type { DomainEvent } from '../../shared/events.js';

export interface DialogueContext {
  event: DomainEvent;
  queueDepth: number;
  recentError: boolean;
  slots: Record<string, string | number>;
}

export async function loadDialogues(dir: string): Promise<Map<CharacterId, DialogueEntry[]>> {
  const files = await readdir(dir);
  const map = new Map<CharacterId, DialogueEntry[]>();
  for (const id of ALL_CHARACTER_IDS) map.set(id, []);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const id = f.replace(/\.json$/, '') as CharacterId;
    if (!ALL_CHARACTER_IDS.includes(id)) continue;
    const raw = await readFile(path.join(dir, f), 'utf8');
    map.set(id, JSON.parse(raw) as DialogueEntry[]);
  }
  return map;
}

function matches(entry: DialogueEntry, ctx: DialogueContext): boolean {
  const t = entry.trigger;
  if (t.eventType !== ctx.event.type) return false;
  if (t.toolName) {
    const tn = (ctx.event as Extract<DomainEvent, { toolName: string }>).toolName;
    if (tn !== t.toolName) return false;
  }
  if (t.conditions?.queueDepthGte !== undefined && ctx.queueDepth < t.conditions.queueDepthGte) return false;
  if (t.conditions?.errorRecent && !ctx.recentError) return false;
  return true;
}

function renderTemplate(tpl: string, slots: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key: string) => (key in slots ? String(slots[key]) : '…'));
}

export function pickLine(pool: DialogueEntry[], ctx: DialogueContext): string | null {
  const candidates = pool.filter((e) => matches(e, ctx));
  if (candidates.length === 0) return null;

  // Prefer entries with conditions (more specific) over generic ones
  const withConditions = candidates.filter((e) => e.trigger.conditions);
  const preferred = withConditions.length > 0 ? withConditions : candidates;

  const totalWeight = preferred.reduce((s, c) => s + (c.weight ?? 1), 0);
  let r = Math.random() * totalWeight;
  let chosen = preferred[0];
  for (const c of preferred) {
    r -= c.weight ?? 1;
    if (r <= 0) { chosen = c; break; }
  }
  const tpl = chosen.templates[Math.floor(Math.random() * chosen.templates.length)];
  return renderTemplate(tpl, ctx.slots);
}
