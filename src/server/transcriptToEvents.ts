import type { DomainEvent } from '../shared/events.js';

/**
 * Convert a Claude Code JSONL transcript record into zero or more DomainEvents.
 *
 * Real Claude Code format (as of 2026-07):
 * - sessionId (camelCase), uuid, timestamp (ISO 8601)
 * - type: 'user' | 'assistant' | 'attachment' | 'file-history-snapshot' | ...
 * - user with message.content = string → user text prompt (UserPromptSubmit)
 * - user with message.content = [{type:'tool_result',...}] → PostToolUse (or agent.stop) per result
 * - assistant with message.content = [{type:'tool_use',name,input,id},...] → PreToolUse per tool
 *   Special case: tool_use name='Agent' with input.subagent_type → SubagentStart
 *
 * Because tool_result records only carry tool_use_id (no name/context), a stateful
 * processor is provided via createTranscriptProcessor(). It tracks tool_use_id →
 * { toolName, isAgent } so tool_result records emit the correct event type
 * (tool.post vs agent.stop) with the original toolName preserved.
 *
 * Also supports the older flat format for backward compat with v1 fixtures:
 * - session_id (snake_case), type='user' with `content` field, top-level `tool_use`
 */

interface RawRecord {
  type?: string;
  sessionId?: string;
  session_id?: string;
  timestamp?: string;
  uuid?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  content?: string;
  tool_use?: { id?: string; name?: string; input?: unknown };
  tool_use_id?: string;
  agent_type?: string;
  agent_id?: string;
  tool_response?: { success?: boolean };
}

interface ContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

function toTs(record: RawRecord, fallback: number): number {
  if (record.timestamp) {
    const t = Date.parse(record.timestamp);
    if (!Number.isNaN(t)) return t;
  }
  return fallback;
}

function sessionOf(record: RawRecord, fallback: string): string {
  return record.sessionId ?? record.session_id ?? fallback;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export interface ToolContext {
  toolName: string;
  isAgent: boolean;
}

/**
 * Stateful processor that remembers tool_use_id → context so tool_result records
 * can be resolved back to the original tool. Use one processor per session
 * (e.g., one per JSONL file) to avoid cross-session collisions.
 */
export function createTranscriptProcessor(fallbackSessionId: string) {
  const toolContext = new Map<string, ToolContext>();

  return function process(raw: unknown, fallbackTs: number = Date.now()): DomainEvent[] {
    return transcriptRecordToEvents(raw, fallbackSessionId, fallbackTs, toolContext);
  };
}

export function transcriptRecordToEvents(
  raw: unknown,
  fallbackSessionId: string,
  fallbackTs: number = Date.now(),
  toolContext?: Map<string, ToolContext>,
): DomainEvent[] {
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as RawRecord;
  const sessionId = sessionOf(record, fallbackSessionId);
  const ts = toTs(record, fallbackTs);
  const events: DomainEvent[] = [];

  const message = record.message;
  const messageContent = message && typeof message === 'object' ? message.content : undefined;

  if (record.type === 'user') {
    if (isString(messageContent)) {
      events.push({ type: 'user.prompt', ts, sessionId, text: messageContent });
    } else if (isString(record.content)) {
      // Legacy flat format
      events.push({ type: 'user.prompt', ts, sessionId, text: record.content });
    } else if (Array.isArray(messageContent)) {
      for (const block of messageContent as ContentBlock[]) {
        if (block?.type !== 'tool_result') continue;
        const toolUseId = block.tool_use_id ?? 'main';
        const success = block.is_error !== true;
        const ctx = toolContext?.get(toolUseId);
        if (ctx?.isAgent) {
          events.push({
            type: 'agent.stop',
            ts,
            sessionId,
            agentId: toolUseId,
            success,
          });
          toolContext?.delete(toolUseId);
        } else {
          events.push({
            type: 'tool.post',
            ts,
            sessionId,
            agentId: toolUseId,
            toolName: ctx?.toolName ?? 'unknown',
            success,
          });
          toolContext?.delete(toolUseId);
        }
      }
    }
    return events;
  }

  if (record.type === 'assistant') {
    if (Array.isArray(messageContent)) {
      for (const block of messageContent as ContentBlock[]) {
        if (block?.type !== 'tool_use') continue;
        const toolName = block.name ?? 'unknown';
        const input = block.input ?? {};
        const agentId = block.id ?? 'main';
        // Agent tool spawn → SubagentStart
        if (toolName === 'Agent' || toolName === 'Task') {
          const subagentType = typeof input.subagent_type === 'string' ? input.subagent_type : 'general-purpose';
          const prompt = typeof input.description === 'string'
            ? input.description
            : typeof input.prompt === 'string' ? input.prompt : undefined;
          events.push({
            type: 'agent.start',
            ts,
            sessionId,
            agentType: subagentType,
            agentId,
            prompt,
          });
          toolContext?.set(agentId, { toolName, isAgent: true });
        } else {
          events.push({
            type: 'tool.pre',
            ts,
            sessionId,
            agentId,
            toolName,
            input,
          });
          toolContext?.set(agentId, { toolName, isAgent: false });
        }
      }
      return events;
    }
    // Legacy flat format
    if (record.tool_use?.name) {
      events.push({
        type: 'tool.pre',
        ts,
        sessionId,
        agentId: record.tool_use.id ?? 'main',
        toolName: record.tool_use.name,
        input: record.tool_use.input,
      });
    }
    return events;
  }

  // Legacy tool_result at top level
  if (record.type === 'tool_result') {
    events.push({
      type: 'tool.post',
      ts,
      sessionId,
      agentId: record.tool_use_id ?? 'main',
      toolName: 'unknown',
      success: true,
    });
    return events;
  }

  return events;
}
