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

  it('agent.start(Explore) → planner-researcher (Anthropic exploration agent)', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'Explore', agentId: 'a' })).toBe('planner-researcher');
  });

  it('agent.start(claude-code-guide) → docs-manager (내장 가이드 에이전트)', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'claude-code-guide', agentId: 'a' })).toBe('docs-manager');
  });

  it('agent.start(qa-verifier) → tester (관측되는 플러그인 에이전트)', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'qa-verifier', agentId: 'a' })).toBe('tester');
  });

  it('agent.start(stabilizer) → debugger (관측되는 플러그인 에이전트)', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'stabilizer', agentId: 'a' })).toBe('debugger');
  });

  it('agent.start(statusline-setup) → team-lead (명시 매핑)', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'statusline-setup', agentId: 'a' })).toBe('team-lead');
  });

  it('agent.start(unknown type) → team-lead (fallback)', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'mystery-agent', agentId: 'a' })).toBe('team-lead');
  });

  it('제거된 고아 정의(tester/debugger 정확명)는 폴백으로 라우팅', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'tester', agentId: 'a' })).toBe('team-lead');
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'docs-manager', agentId: 'a' })).toBe('team-lead');
  });

  it('agent.start(general-purpose) → code-reviewer', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'general-purpose', agentId: 'a' })).toBe('code-reviewer');
  });

  it('Write .ts → team-lead (no code-file rule; falls back)', () => {
    expect(router.route(ev({ toolName: 'Write', input: { file_path: '/a/b.ts' } }))).toBe('team-lead');
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

  it('unknown → team-lead (fallback)', () => {
    expect(router.route(ev({ toolName: 'MysteryTool', input: {} }))).toBe('team-lead');
  });

  it('session.start → team-lead', () => {
    expect(router.route({ type: 'session.start', ts: 0, sessionId: 's', cwd: '/' })).toBe('team-lead');
  });
});
