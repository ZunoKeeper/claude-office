export type DomainEvent =
  | { type: 'session.start';   ts: number; sessionId: string; cwd: string }
  | { type: 'session.stop';    ts: number; sessionId: string }
  | { type: 'user.prompt';     ts: number; sessionId: string; text: string }
  | { type: 'agent.start';     ts: number; sessionId: string; agentType: string; agentId: string; parentAgentId?: string; prompt?: string }
  | { type: 'agent.stop';      ts: number; sessionId: string; agentId: string; success: boolean }
  | { type: 'tool.pre';        ts: number; sessionId: string; agentId: string; toolName: string; input: unknown }
  | { type: 'tool.post';       ts: number; sessionId: string; agentId: string; toolName: string; success: boolean; durationMs?: number }
  | { type: 'task.created';    ts: number; sessionId: string; taskId: string; subject: string }
  | { type: 'task.completed';  ts: number; sessionId: string; taskId: string }
  | { type: 'mcp.call';        ts: number; sessionId: string; serverName: string; toolName: string; input: unknown }
  | { type: 'mcp.result';      ts: number; sessionId: string; serverName: string; toolName: string; success: boolean };

export type HookEventName =
  | 'SessionStart' | 'Stop'
  | 'UserPromptSubmit'
  | 'SubagentStart' | 'SubagentStop'
  | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'
  | 'TaskCreated' | 'TaskCompleted';

export interface HookPayload {
  session_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: { success?: boolean; error?: string };
  agent_type?: string;
  agent_id?: string;
  parent_agent_id?: string;
  prompt?: string;
  cwd?: string;
  task_id?: string;
  subject?: string;
  [k: string]: unknown;
}
