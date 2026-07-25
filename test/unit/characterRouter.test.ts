import { describe, it, expect } from 'vitest';
import { createRouter } from '../../src/server/characterRouter.js';
import type { ActivityRule } from '../../src/shared/config.js';
import type { DomainEvent } from '../../src/shared/events.js';

const rules: ActivityRule[] = [
  { characterId: 'yu-dev', priority: 100, match: { toolName: ['Write', 'Edit'], filePathPattern: '\\.(ts|py)$' } },
  { characterId: 'seo-designer', priority: 100, match: { toolName: ['Write', 'Edit'], filePathPattern: '\\.css$' } },
  { characterId: 'han-qa', priority: 110, match: { toolName: ['Bash'], bashCommandPattern: 'pytest' } },
];

const router = createRouter(rules);

function ev(overrides: Partial<Extract<DomainEvent, { type: 'tool.pre' }>>): DomainEvent {
  return { type: 'tool.pre', ts: 0, sessionId: 's', agentId: 'a', toolName: 'Write', input: {}, ...overrides };
}

describe('characterRouter', () => {
  it('agent.start(Plan) → park-planner', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'Plan', agentId: 'a' })).toBe('park-planner');
  });

  it('agent.start(Explore) → lee-researcher', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'Explore', agentId: 'a' })).toBe('lee-researcher');
  });

  it('agent.start(general-purpose) → jung-newbie', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'general-purpose', agentId: 'a' })).toBe('jung-newbie');
  });

  it('Write .ts → yu-dev', () => {
    expect(router.route(ev({ toolName: 'Write', input: { file_path: '/a/b.ts' } }))).toBe('yu-dev');
  });

  it('Write .css → seo-designer', () => {
    expect(router.route(ev({ toolName: 'Write', input: { file_path: '/a/x.css' } }))).toBe('seo-designer');
  });

  it('Bash pytest → han-qa', () => {
    expect(router.route(ev({ toolName: 'Bash', input: { command: 'pytest tests/' } }))).toBe('han-qa');
  });

  it('unknown → kim-team-lead (fallback)', () => {
    expect(router.route(ev({ toolName: 'MysteryTool', input: {} }))).toBe('kim-team-lead');
  });

  it('session.start → kim-team-lead', () => {
    expect(router.route({ type: 'session.start', ts: 0, sessionId: 's', cwd: '/' })).toBe('kim-team-lead');
  });
});
