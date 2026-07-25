import { describe, it, expect } from 'vitest';
import { transcriptRecordToEvents, createTranscriptProcessor } from '../../src/server/transcriptToEvents.js';

describe('transcriptRecordToEvents', () => {
  const fallback = 's-fallback';

  it('real user text prompt → user.prompt', () => {
    const record = {
      type: 'user',
      sessionId: 'sess-1',
      timestamp: '2026-07-25T08:54:36.567Z',
      message: { role: 'user', content: '기본 언어 설정을 한글로 바꿔줘' },
    };
    const events = transcriptRecordToEvents(record, fallback);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'user.prompt',
      sessionId: 'sess-1',
      text: '기본 언어 설정을 한글로 바꿔줘',
    });
    expect(events[0].ts).toBe(Date.parse('2026-07-25T08:54:36.567Z'));
  });

  it('real assistant with tool_use blocks → one tool.pre per block', () => {
    const record = {
      type: 'assistant',
      sessionId: 'sess-1',
      timestamp: '2026-07-25T08:54:43.324Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '...' },
          { type: 'tool_use', id: 'toolu_A', name: 'Bash', input: { command: 'ls', description: 'list' } },
          { type: 'tool_use', id: 'toolu_B', name: 'Read', input: { file_path: '/a.ts' } },
        ],
      },
    };
    const events = transcriptRecordToEvents(record, fallback);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'tool.pre', toolName: 'Bash', agentId: 'toolu_A' });
    expect(events[1]).toMatchObject({ type: 'tool.pre', toolName: 'Read', agentId: 'toolu_B' });
  });

  it('assistant Agent tool_use → agent.start with subagent_type', () => {
    const record = {
      type: 'assistant',
      sessionId: 'sess-1',
      timestamp: '2026-07-25T08:55:00Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_C',
            name: 'Agent',
            input: { subagent_type: 'claude-code-guide', description: 'Verify hook install' },
          },
        ],
      },
    };
    const events = transcriptRecordToEvents(record, fallback);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'agent.start',
      agentType: 'claude-code-guide',
      agentId: 'toolu_C',
      prompt: 'Verify hook install',
    });
  });

  it('user tool_result → tool.post with success derived from is_error', () => {
    const record = {
      type: 'user',
      sessionId: 'sess-1',
      timestamp: '2026-07-25T08:55:05Z',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_A', content: 'output', is_error: false },
          { type: 'tool_result', tool_use_id: 'toolu_B', content: 'err', is_error: true },
        ],
      },
    };
    const events = transcriptRecordToEvents(record, fallback);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'tool.post', agentId: 'toolu_A', success: true });
    expect(events[1]).toMatchObject({ type: 'tool.post', agentId: 'toolu_B', success: false });
  });

  it('non-tool assistant record (only thinking/text) yields no events', () => {
    const record = {
      type: 'assistant',
      sessionId: 'sess-1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }, { type: 'thinking', thinking: '...' }] },
    };
    expect(transcriptRecordToEvents(record, fallback)).toEqual([]);
  });

  it('unrelated types (attachment, permission-mode) yield no events', () => {
    expect(transcriptRecordToEvents({ type: 'attachment', sessionId: 's' }, fallback)).toEqual([]);
    expect(transcriptRecordToEvents({ type: 'permission-mode', sessionId: 's' }, fallback)).toEqual([]);
    expect(transcriptRecordToEvents({ type: 'file-history-snapshot', sessionId: 's' }, fallback)).toEqual([]);
  });

  it('missing sessionId falls back to filename-derived id', () => {
    const record = { type: 'user', message: { role: 'user', content: 'hi' } };
    const events = transcriptRecordToEvents(record, 'derived-from-filename');
    expect(events[0].sessionId).toBe('derived-from-filename');
  });

  it('supports legacy flat fixture format (session_id + top-level content/tool_use)', () => {
    const userLegacy = { type: 'user', session_id: 's-fix', content: 'start' };
    const assistantLegacy = {
      type: 'assistant', session_id: 's-fix',
      tool_use: { name: 'Grep', input: { pattern: 'foo' } },
    };
    const toolResultLegacy = { type: 'tool_result', session_id: 's-fix', tool_use_id: 't1' };
    expect(transcriptRecordToEvents(userLegacy, 'x')).toHaveLength(1);
    expect(transcriptRecordToEvents(assistantLegacy, 'x')[0]).toMatchObject({ type: 'tool.pre', toolName: 'Grep' });
    expect(transcriptRecordToEvents(toolResultLegacy, 'x')[0]).toMatchObject({ type: 'tool.post' });
  });

  it('handles malformed records gracefully', () => {
    expect(transcriptRecordToEvents(null, 'x')).toEqual([]);
    expect(transcriptRecordToEvents(undefined, 'x')).toEqual([]);
    expect(transcriptRecordToEvents('not an object', 'x')).toEqual([]);
    expect(transcriptRecordToEvents({ type: 'user' /* no message, no content */ }, 'x')).toEqual([]);
  });

  describe('createTranscriptProcessor (stateful)', () => {
    it('tool_result following a Bash tool_use produces tool.post with recovered toolName', () => {
      const proc = createTranscriptProcessor('sess-1');
      const pre = proc({
        type: 'assistant', sessionId: 'sess-1',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_X', name: 'Bash', input: { command: 'ls' } }] },
      });
      expect(pre[0]).toMatchObject({ type: 'tool.pre', toolName: 'Bash' });
      const post = proc({
        type: 'user', sessionId: 'sess-1',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_X', is_error: false }] },
      });
      expect(post).toHaveLength(1);
      expect(post[0]).toMatchObject({ type: 'tool.post', toolName: 'Bash', success: true, agentId: 'toolu_X' });
    });

    it('tool_result following an Agent tool_use produces agent.stop (not tool.post)', () => {
      const proc = createTranscriptProcessor('sess-1');
      proc({
        type: 'assistant', sessionId: 'sess-1',
        message: { role: 'assistant', content: [{
          type: 'tool_use', id: 'toolu_A', name: 'Agent',
          input: { subagent_type: 'general-purpose', description: 'do a thing' },
        }] },
      });
      const post = proc({
        type: 'user', sessionId: 'sess-1',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_A', is_error: false }] },
      });
      expect(post).toHaveLength(1);
      expect(post[0]).toMatchObject({ type: 'agent.stop', agentId: 'toolu_A', success: true });
    });

    it('unmatched tool_result (no prior tool_use) falls back to tool.post with toolName=unknown', () => {
      const proc = createTranscriptProcessor('sess-1');
      const post = proc({
        type: 'user', sessionId: 'sess-1',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_ORPHAN', is_error: true }] },
      });
      expect(post[0]).toMatchObject({ type: 'tool.post', toolName: 'unknown', success: false });
    });

    it('context is consumed on tool_result (repeated result yields fallback)', () => {
      const proc = createTranscriptProcessor('sess-1');
      proc({
        type: 'assistant', sessionId: 'sess-1',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_Z', name: 'Read', input: {} }] },
      });
      const first = proc({
        type: 'user', sessionId: 'sess-1',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_Z' }] },
      });
      expect(first[0]).toMatchObject({ toolName: 'Read' });
      const second = proc({
        type: 'user', sessionId: 'sess-1',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_Z' }] },
      });
      expect(second[0]).toMatchObject({ toolName: 'unknown' });
    });
  });
});
