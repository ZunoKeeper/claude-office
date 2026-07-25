import { describe, it, expect } from 'vitest';
import { createRouter } from '../../src/server/characterRouter.js';
import type { ActivityRule } from '../../src/shared/config.js';
import type { DomainEvent } from '../../src/shared/events.js';

const rules: ActivityRule[] = [
  { characterId: 'docs-manager', priority: 105, match: { toolName: ['Write', 'Edit'], filePathPattern: '\\.md$' } },
  { characterId: 'tester', priority: 120, match: { toolName: ['Bash'], bashCommandPattern: 'pytest' } },
  { characterId: 'debugger', priority: 115, match: { toolName: ['Bash'], bashCommandPattern: '\\bgrep\\b' } },
];

const router = createRouter(rules);

function ev(overrides: Partial<Extract<DomainEvent, { type: 'tool.pre' }>>): DomainEvent {
  return { type: 'tool.pre', ts: 0, sessionId: 's', agentId: 'a', toolName: 'Write', input: {}, ...overrides };
}

describe('characterRouter', () => {
  it('agent.start(Plan) → planner-researcher', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'Plan', agentId: 'a' })).toBe('planner-researcher');
  });

  it('agent.start(unknown type) → kim-team-lead (fallback)', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'Explore', agentId: 'a' })).toBe('kim-team-lead');
  });

  it('agent.start(general-purpose) → code-reviewer', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'general-purpose', agentId: 'a' })).toBe('code-reviewer');
  });

  it('Write .ts → kim-team-lead (no code-file rule; falls back)', () => {
    expect(router.route(ev({ toolName: 'Write', input: { file_path: '/a/b.ts' } }))).toBe('kim-team-lead');
  });

  it('Write .md → docs-manager', () => {
    expect(router.route(ev({ toolName: 'Write', input: { file_path: '/proj/README.md' } }))).toBe('docs-manager');
  });

  it('Bash pytest → tester', () => {
    expect(router.route(ev({ toolName: 'Bash', input: { command: 'pytest tests/' } }))).toBe('tester');
  });

  it('Bash grep → debugger', () => {
    expect(router.route(ev({ toolName: 'Bash', input: { command: 'grep -r foo src/' } }))).toBe('debugger');
  });

  it('unknown → kim-team-lead (fallback)', () => {
    expect(router.route(ev({ toolName: 'MysteryTool', input: {} }))).toBe('kim-team-lead');
  });

  it('session.start → kim-team-lead', () => {
    expect(router.route({ type: 'session.start', ts: 0, sessionId: 's', cwd: '/' })).toBe('kim-team-lead');
  });
});
