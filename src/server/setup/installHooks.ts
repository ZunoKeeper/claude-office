import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

export interface CommandHook {
  type: 'command';
  command: string;
  async?: boolean;
  timeout?: number;
}

export interface HookGroup {
  matcher?: string;
  hooks: CommandHook[];
}

export interface SettingsJson {
  env?: Record<string, string>;
  hooks?: Record<string, HookGroup[]>;
  [k: string]: unknown;
}

function claudeMonitorCommand(endpoint: string, eventName: string): string {
  return `curl -sS -X POST ${endpoint} -H 'X-CM-Event: ${eventName}' -H 'Content-Type: application/json' -d @- 2>/dev/null || true`;
}

export function mergeHooks(existing: unknown, endpoint: string, events: string[]): SettingsJson {
  const src: SettingsJson = (existing && typeof existing === 'object') ? { ...(existing as SettingsJson) } : {};
  const out: SettingsJson = { ...src, hooks: { ...(src.hooks ?? {}) } };
  for (const ev of events) {
    const groups: HookGroup[] = [...(out.hooks![ev] ?? [])];
    const cmd = claudeMonitorCommand(endpoint, ev);
    const exists = groups.some((g) => g.hooks.some((h) => h.command === cmd));
    if (exists) continue;
    let firstEmpty = groups.find((g) => !g.matcher);
    if (!firstEmpty) {
      firstEmpty = { matcher: '', hooks: [] };
      groups.push(firstEmpty);
    }
    firstEmpty.hooks.push({ type: 'command', command: cmd, async: true, timeout: 5 });
    out.hooks![ev] = groups;
  }
  return out;
}

export const DEFAULT_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'SubagentStart',
  'SubagentStop',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'TaskCreated',
  'TaskCompleted',
];

export async function installHooks(
  scope: 'user' | 'project',
  endpoint: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const target = scope === 'user'
    ? path.join(homedir(), '.claude', 'settings.json')
    : path.join(cwd, '.claude', 'settings.json');
  let existing: SettingsJson = {};
  try {
    const raw = await readFile(target, 'utf8');
    existing = JSON.parse(raw) as SettingsJson;
  } catch {
    /* file missing or invalid — start fresh */
  }
  const merged = mergeHooks(existing, endpoint, DEFAULT_EVENTS);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  return target;
}
