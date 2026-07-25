import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { loadDialogues, pickLine } from '../../src/server/dialogue/pool.js';

const DIR = path.resolve(process.cwd(), 'config/dialogue');

describe('dialoguePool', () => {
  it('loads 6 character pools', async () => {
    const pools = await loadDialogues(DIR);
    expect(pools.size).toBe(6);
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
    // Mock Math.random to force selection of the conditional line
    // (both generic and conditional entries match, we want the conditional one)
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      const line = pickLine(pools.get('code-reviewer')!, {
        event: { type: 'agent.start', ts: 0, sessionId: 's', agentType: 'general-purpose', agentId: 'a' },
        queueDepth: 3, recentError: false,
        slots: { queueDepth: 3 },
      });
      expect(line).toMatch(/3개 리뷰 대기중/);
    } finally {
      spy.mockRestore();
    }
  });

  it('fills template slots from context', async () => {
    const pools = await loadDialogues(DIR);
    // docs-manager's tool.pre template uses {fileName}
    const line = pickLine(pools.get('docs-manager')!, {
      event: { type: 'tool.pre', ts: 0, sessionId: 's', agentId: 'a', toolName: 'Write', input: {} },
      queueDepth: 0, recentError: false,
      slots: { fileName: 'README.md' },
    });
    // Either template may be picked; the {fileName}-slot template contains "README.md"
    // and the alternate is a static "문서 갱신할게요". Loop until we hit the slotted one.
    // For determinism, verify at least one of the two templates renders — the test
    // asserts the slotted template ran when its output contains 'README.md'.
    // With just 2 templates and random pick, either result is acceptable so long as
    // the result is not null. We check the slot-rendered case with a small retry.
    let hit = line?.includes('README.md') ?? false;
    for (let i = 0; i < 20 && !hit; i++) {
      const l = pickLine(pools.get('docs-manager')!, {
        event: { type: 'tool.pre', ts: 0, sessionId: 's', agentId: 'a', toolName: 'Write', input: {} },
        queueDepth: 0, recentError: false,
        slots: { fileName: 'README.md' },
      });
      if (l?.includes('README.md')) { hit = true; break; }
    }
    expect(hit).toBe(true);
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
