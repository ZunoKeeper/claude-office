import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeHook } from '../../src/server/eventNormalizer.js';

const FIX = path.resolve(process.cwd(), 'test/fixtures/hooks');
async function fx<T = unknown>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(FIX, name), 'utf8'));
}

describe('normalizeHook', () => {
  const ts = 1_700_000_000_000;

  it('SessionStart → session.start', async () => {
    const e = normalizeHook('SessionStart', await fx('session-start.json'), ts);
    expect(e).toEqual({ type: 'session.start', ts, sessionId: 'sess-abc', cwd: '/home/u/proj' });
  });

  it('PreToolUse → tool.pre', async () => {
    const e = normalizeHook('PreToolUse', await fx('pretool-write.json'), ts);
    expect(e).toMatchObject({ type: 'tool.pre', toolName: 'Write', agentId: 'agt-1' });
  });

  it('SubagentStart → agent.start with parent', async () => {
    const e = normalizeHook('SubagentStart', await fx('subagent-start.json'), ts);
    expect(e).toMatchObject({ type: 'agent.start', agentType: 'Explore', parentAgentId: 'agt-1' });
  });

  it('TaskCreated → task.created', async () => {
    const e = normalizeHook('TaskCreated', await fx('task-created.json'), ts);
    expect(e).toMatchObject({ type: 'task.created', taskId: 'task-9', subject: 'refactor login' });
  });

  it('missing session_id returns null', () => {
    expect(normalizeHook('PreToolUse', {}, ts)).toBeNull();
  });
});
