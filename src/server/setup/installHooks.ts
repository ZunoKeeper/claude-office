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

// Claude Code는 Windows에서도 훅을 Git Bash(POSIX sh)로 실행하므로 전 플랫폼
// POSIX 문법 하나만 쓴다. cmd 문법(2>nul)을 쓰면 POSIX 셸이 `nul`을 파일명으로
// 해석해 프로젝트 루트에 nul 파일을 만들어 버린다.
export function claudeMonitorCommand(endpoint: string, eventName: string): string {
  return `curl -sS -X POST ${endpoint} -H 'X-CM-Event: ${eventName}' -H 'Content-Type: application/json' -d @- 2>/dev/null || true`;
}

export function mergeHooks(
  existing: unknown,
  endpoint: string,
  events: string[],
): SettingsJson {
  const src: SettingsJson = (existing && typeof existing === 'object') ? { ...(existing as SettingsJson) } : {};
  const out: SettingsJson = { ...src, hooks: { ...(src.hooks ?? {}) } };

  // 우리(claude-monitor)가 설치한 훅 중 더 이상 유효하지 않은 것을 먼저 제거:
  // 커맨드 포맷이 바뀐 구버전(X-CM-Event 마커는 있으나 현재 canonical 커맨드와 다름),
  // 그리고 설치 대상에서 빠진 이벤트에 남아 있는 것. 사용자 훅은 건드리지 않는다.
  const canonical = new Set(events.map((ev) => claudeMonitorCommand(endpoint, ev)));
  for (const [key, groups] of Object.entries(out.hooks!)) {
    const pruned = groups
      .map((g) => ({
        ...g,
        hooks: g.hooks.filter((h) => !h.command.includes('X-CM-Event') || canonical.has(h.command)),
      }))
      .filter((g) => g.hooks.length > 0);
    if (pruned.length === 0) delete out.hooks![key];
    else out.hooks![key] = pruned;
  }

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

// 현행 Claude Code 훅 이벤트 목록(code.claude.com/docs/en/hooks)에 존재하는 것만 사용.
// SessionEnd는 존재하지 않아 Stop(턴 종료)으로 대체.
export const DEFAULT_EVENTS = [
  'SessionStart',
  'Stop',
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
