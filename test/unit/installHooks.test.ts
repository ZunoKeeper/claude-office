import { describe, it, expect } from 'vitest';
import { mergeHooks } from '../../src/server/setup/installHooks.js';

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
