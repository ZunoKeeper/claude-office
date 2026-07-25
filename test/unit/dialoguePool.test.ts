import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadDialogues, pickLine } from '../../src/server/dialogue/pool.js';

const DIR = path.resolve(process.cwd(), 'config/dialogue');

describe('dialoguePool', () => {
  it('loads 9 character pools', async () => {
    const pools = await loadDialogues(DIR);
    expect(pools.size).toBe(9);
  });

  it('picks a session.start line for kim-team-lead', async () => {
    const pools = await loadDialogues(DIR);
    const line = pickLine(pools.get('kim-team-lead')!, {
      event: { type: 'session.start', ts: 0, sessionId: 's', cwd: '/' },
      queueDepth: 0, recentError: false, slots: {},
    });
    expect(line).toMatch(/오늘도|자,/);
  });

  it('respects queueDepthGte condition', async () => {
    const pools = await loadDialogues(DIR);
    const line = pickLine(pools.get('lee-researcher')!, {
      event: { type: 'agent.start', ts: 0, sessionId: 's', agentType: 'Explore', agentId: 'a' },
      queueDepth: 3, recentError: false,
      slots: { queueDepth: 3 },
    });
    expect(line).toMatch(/3개 물려있어요/);
  });

  it('fills template slots from context', async () => {
    const pools = await loadDialogues(DIR);
    const line = pickLine(pools.get('yu-dev')!, {
      event: { type: 'tool.pre', ts: 0, sessionId: 's', agentId: 'a', toolName: 'Write', input: {} },
      queueDepth: 0, recentError: false,
      slots: { fileName: 'app.ts' },
    });
    expect(line).toContain('app.ts');
  });

  it('returns null when no candidate matches', async () => {
    const pools = await loadDialogues(DIR);
    const line = pickLine(pools.get('kim-team-lead')!, {
      event: { type: 'task.created', ts: 0, sessionId: 's', taskId: 't', subject: '' },
      queueDepth: 0, recentError: false, slots: {},
    });
    expect(line).toBeNull();
  });
});
