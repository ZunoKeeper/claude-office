import type { CharacterId } from '../shared/character.js';
import type { ActivityRule } from '../shared/config.js';
import type { DomainEvent } from '../shared/events.js';

const AGENT_TYPE_MAP: Record<string, CharacterId> = {
  Plan: 'park-planner',
  Explore: 'lee-researcher',
  'general-purpose': 'jung-newbie',
  'claude-code-guide': 'jo-senior',
  'statusline-setup': 'choi-office',
};

const FALLBACK: CharacterId = 'kim-team-lead';

function matchRule(rule: ActivityRule, toolName: string, input: unknown): boolean {
  const m = rule.match;
  if (m.toolName && !m.toolName.includes(toolName)) return false;
  const io = (input ?? {}) as Record<string, unknown>;
  if (m.filePathPattern) {
    const fp = typeof io.file_path === 'string' ? io.file_path : '';
    if (!new RegExp(m.filePathPattern).test(fp)) return false;
  }
  if (m.bashCommandPattern) {
    const cmd = typeof io.command === 'string' ? io.command : '';
    if (!new RegExp(m.bashCommandPattern).test(cmd)) return false;
  }
  if (m.webFetchUrlPattern) {
    const url = typeof io.url === 'string' ? io.url : '';
    if (!new RegExp(m.webFetchUrlPattern).test(url)) return false;
  }
  return true;
}

export function createRouter(rules: ActivityRule[]) {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  return {
    route(event: DomainEvent): CharacterId {
      switch (event.type) {
        case 'agent.start':
        case 'agent.stop': {
          const at = event.type === 'agent.start' ? event.agentType : undefined;
          return at && AGENT_TYPE_MAP[at] ? AGENT_TYPE_MAP[at] : FALLBACK;
        }
        case 'tool.pre':
        case 'tool.post': {
          for (const r of sorted) {
            if (matchRule(r, event.toolName, (event as Extract<DomainEvent, { type: 'tool.pre' }>).input)) {
              return r.characterId;
            }
          }
          return FALLBACK;
        }
        default:
          return FALLBACK;
      }
    },
  };
}
