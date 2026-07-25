import { describe, it, expect } from 'vitest';
import { createStateStore } from '../../src/server/stateStore.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';

const ids = [...ALL_CHARACTER_IDS];

describe('stateStore', () => {
  it('initializes all characters as idle (at their desks) with empty queue', () => {
    const s = createStateStore(ids);
    for (const id of ids) {
      expect(s.get(id).status).toBe('idle');
      expect(s.get(id).queue).toEqual([]);
    }
  });

  it('session.stop resets to idle (character stays at desk, not off)', () => {
    const s = createStateStore(ids);
    s.applyEvent('kim-team-lead', { type: 'agent.start', ts: 1, sessionId: 's', agentType: 'Plan', agentId: 'a1' });
    s.applyEvent('kim-team-lead', { type: 'session.stop', ts: 2, sessionId: 's' });
    const st = s.get('kim-team-lead');
    expect(st.status).toBe('idle');
    expect(st.queue).toEqual([]);
    expect(st.currentActivity).toBeUndefined();
  });

  it('agent.start → status=working, adds active ticket', () => {
    const s = createStateStore(ids);
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 1, sessionId: 's', agentType: 'Explore', agentId: 'a1' }, 'find kafka');
    const st = s.get('lee-researcher');
    expect(st.status).toBe('working');
    expect(st.queue).toHaveLength(1);
    expect(st.queue[0]).toMatchObject({ ticketId: 'a1', status: 'active' });
  });

  it('second agent.start on same char → queued ticket', () => {
    const s = createStateStore(ids);
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 1, sessionId: 's', agentType: 'Explore', agentId: 'a1' }, 'x');
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 2, sessionId: 's', agentType: 'Explore', agentId: 'a2' }, 'y');
    expect(s.get('lee-researcher').queue.map((t) => t.status)).toEqual(['active', 'queued']);
  });

  it('agent.stop removes active ticket and promotes next', () => {
    const s = createStateStore(ids);
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 1, sessionId: 's', agentType: 'Explore', agentId: 'a1' });
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 2, sessionId: 's', agentType: 'Explore', agentId: 'a2' });
    s.applyEvent('lee-researcher', { type: 'agent.stop', ts: 3, sessionId: 's', agentId: 'a1', success: true });
    const st = s.get('lee-researcher');
    expect(st.queue).toHaveLength(1);
    expect(st.queue[0]).toMatchObject({ ticketId: 'a2', status: 'active' });
    expect(st.status).toBe('working');
  });

  it('empty queue after final stop → status=done, stats increment', () => {
    const s = createStateStore(ids);
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 1, sessionId: 's', agentType: 'Explore', agentId: 'a1' });
    s.applyEvent('lee-researcher', { type: 'agent.stop', ts: 2, sessionId: 's', agentId: 'a1', success: true });
    const st = s.get('lee-researcher');
    expect(st.status).toBe('done');
    expect(st.stats.tasksCompleted).toBe(1);
  });

  it('tool.post failure increments errorsCount', () => {
    const s = createStateStore(ids);
    s.applyEvent('yu-dev', { type: 'tool.post', ts: 1, sessionId: 's', agentId: 'a', toolName: 'Write', success: false });
    expect(s.get('yu-dev').stats.errorsCount).toBe(1);
    expect(s.get('yu-dev').status).toBe('error');
  });

  it('setLine updates lastLine', () => {
    const s = createStateStore(ids);
    const st = s.setLine('kim-team-lead', '안녕', 3000);
    expect(st.lastLine?.text).toBe('안녕');
    expect(st.lastLine?.ttlMs).toBe(3000);
  });

  it('applyEvent stamps lastUpdatedAt on the affected character', () => {
    const s = createStateStore(ids);
    const before = Date.now();
    s.applyEvent('yu-dev', { type: 'tool.pre', ts: 1, sessionId: 's', agentId: 'a', toolName: 'Write', input: {} });
    const st = s.get('yu-dev');
    expect(st.lastUpdatedAt).toBeGreaterThanOrEqual(before);
    expect(st.lastUpdatedAt).toBeLessThanOrEqual(Date.now());
  });
});
