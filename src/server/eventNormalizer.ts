import type { DomainEvent, HookEventName, HookPayload } from '../shared/events.js';

export function normalizeHook(name: HookEventName, p: HookPayload, ts: number): DomainEvent | null {
  const sid = p.session_id;
  if (!sid && name !== 'SessionStart') return null;

  switch (name) {
    case 'SessionStart':
      if (!sid) return null;
      return { type: 'session.start', ts, sessionId: sid, cwd: p.cwd ?? '' };
    case 'SessionEnd':
      return { type: 'session.stop', ts, sessionId: sid! };
    case 'UserPromptSubmit':
      return { type: 'user.prompt', ts, sessionId: sid!, text: String(p.prompt ?? '') };
    case 'SubagentStart':
      if (!p.agent_id || !p.agent_type) return null;
      return {
        type: 'agent.start', ts, sessionId: sid!,
        agentType: p.agent_type, agentId: p.agent_id,
        parentAgentId: p.parent_agent_id, prompt: p.prompt,
      };
    case 'SubagentStop':
      if (!p.agent_id) return null;
      return { type: 'agent.stop', ts, sessionId: sid!, agentId: p.agent_id, success: p.tool_response?.success !== false };
    case 'PreToolUse':
      if (!p.tool_name) return null;
      return { type: 'tool.pre', ts, sessionId: sid!, agentId: p.agent_id ?? 'main', toolName: p.tool_name, input: p.tool_input };
    case 'PostToolUse':
    case 'PostToolUseFailure':
      if (!p.tool_name) return null;
      return {
        type: 'tool.post', ts, sessionId: sid!, agentId: p.agent_id ?? 'main',
        toolName: p.tool_name, success: name === 'PostToolUse',
      };
    case 'TaskCreated':
      if (!p.task_id) return null;
      return { type: 'task.created', ts, sessionId: sid!, taskId: p.task_id, subject: p.subject ?? '' };
    case 'TaskCompleted':
      if (!p.task_id) return null;
      return { type: 'task.completed', ts, sessionId: sid!, taskId: p.task_id };
    default:
      return null;
  }
}
