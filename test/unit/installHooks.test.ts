import { describe, it, expect } from 'vitest';
import { mergeHooks, claudeMonitorCommand, DEFAULT_EVENTS } from '../../src/server/setup/installHooks.js';

describe('mergeHooks', () => {
  const endpoint = 'http://localhost:4000/hook';
  const events = ['SessionStart', 'PreToolUse'];

  it('adds hooks section when missing', () => {
    const out = mergeHooks({}, endpoint, events);
    expect(out.hooks?.SessionStart).toBeDefined();
    expect(out.hooks?.PreToolUse).toBeDefined();
  });

  it('does not duplicate on second call (idempotent)', () => {
    const first = mergeHooks({}, endpoint, events);
    const second = mergeHooks(first, endpoint, events);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('preserves unrelated existing hooks', () => {
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: '', hooks: [{ type: 'command' as const, command: 'echo user-hook' }] },
        ],
      },
    };
    const out = mergeHooks(existing, endpoint, events);
    expect(out.hooks!.SessionStart[0].hooks[0].command).toBe('echo user-hook');
    const cmDto = out.hooks!.SessionStart[0].hooks.find(
      (h) => 'command' in h && h.command.includes('X-CM-Event: SessionStart'),
    );
    expect(cmDto).toBeDefined();
  });

  it('preserves non-hooks fields', () => {
    const out = mergeHooks({ env: { FOO: 'bar' } }, endpoint, events);
    expect(out.env).toEqual({ FOO: 'bar' });
  });
});

describe('DEFAULT_EVENTS', () => {
  it('only uses hook events that exist in current Claude Code', () => {
    expect(DEFAULT_EVENTS).not.toContain('SessionEnd'); // 현행 훅 이벤트 목록에 없음
    expect(DEFAULT_EVENTS).toContain('Stop');
  });
});

describe('stale claude-monitor hook pruning', () => {
  const endpoint = 'http://localhost:4000/hook';

  it('removes outdated CM commands but keeps user hooks', () => {
    const outdated = "curl -sS -X POST http://localhost:4000/hook -H 'X-CM-Event: SessionStart' -d @- 2>/dev/null";
    const existing = {
      hooks: {
        SessionStart: [{
          matcher: '',
          hooks: [
            { type: 'command' as const, command: outdated },
            { type: 'command' as const, command: 'echo user-hook' },
          ],
        }],
      },
    };
    const out = mergeHooks(existing, endpoint, ['SessionStart']);
    const cmds = out.hooks!.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
    expect(cmds).toContain('echo user-hook');
    expect(cmds.filter((c) => c.includes('X-CM-Event')))
      .toEqual([claudeMonitorCommand(endpoint, 'SessionStart')]);
  });

  it('replaces legacy 2>nul (cmd-dialect) hooks — POSIX 셸에서 nul 파일을 만드는 구버전', () => {
    const legacyWin = 'curl -sS -X POST http://localhost:4000/hook -H "X-CM-Event: SessionStart" -H "Content-Type: application/json" -d @- 2>nul';
    const existing = {
      hooks: {
        SessionStart: [{
          matcher: '',
          hooks: [{ type: 'command' as const, command: legacyWin }],
        }],
      },
    };
    const out = mergeHooks(existing, endpoint, ['SessionStart']);
    const cmds = out.hooks!.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
    expect(cmds).toEqual([claudeMonitorCommand(endpoint, 'SessionStart')]);
    expect(cmds[0]).not.toContain('2>nul');
  });

  it('drops CM hooks registered for events no longer installed', () => {
    const existing = {
      hooks: {
        SessionEnd: [{
          matcher: '',
          hooks: [{ type: 'command' as const, command: claudeMonitorCommand(endpoint, 'SessionEnd') }],
        }],
      },
    };
    const out = mergeHooks(existing, endpoint, ['SessionStart']);
    expect(out.hooks!.SessionEnd).toBeUndefined();
    expect(out.hooks!.SessionStart).toBeDefined();
  });
});

describe('claudeMonitorCommand', () => {
  const endpoint = 'http://localhost:4000/hook';

  it('generates a POSIX sh command on every platform (훅은 Windows에서도 Git Bash로 실행됨)', () => {
    const cmd = claudeMonitorCommand(endpoint, 'SessionStart');
    expect(cmd).toContain("-H 'X-CM-Event: SessionStart'");
    expect(cmd).toContain('2>/dev/null || true');
    expect(cmd).not.toContain('2>nul');
  });

  it('mergeHooks embeds the POSIX command', () => {
    const out = mergeHooks({}, endpoint, ['SessionStart']);
    const cmd = out.hooks!.SessionStart[0].hooks[0].command;
    expect(cmd).toContain('2>/dev/null || true');
  });
});
