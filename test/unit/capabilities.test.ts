import { describe, it, expect } from 'vitest';
import { mergePlugins, parseSkillMd, routerAgentTypes } from '../../src/server/env/capabilities.js';

describe('mergePlugins', () => {
  const installed = {
    plugins: {
      'superpowers@claude-plugins-official': [
        { scope: 'user', installPath: 'C:\\cache\\superpowers\\6.1.1', version: '6.1.1' },
      ],
      'harness@harness-marketplace': [
        { scope: 'project', installPath: 'C:\\cache\\harness\\1.2.0', version: '1.2.0' },
      ],
      'github@claude-plugins-official': [
        { scope: 'user', installPath: 'C:\\cache\\github\\unknown', version: 'unknown' },
      ],
    },
  };
  const enabled = {
    'superpowers@claude-plugins-official': true,
    'github@claude-plugins-official': true,
    // harness는 미포함 → 비활성
  };

  it('returns only enabled plugins with parsed name/marketplace', () => {
    const out = mergePlugins(installed, enabled);
    expect(out.map((p) => p.name).sort()).toEqual(['github', 'superpowers']);
    const sp = out.find((p) => p.name === 'superpowers')!;
    expect(sp.marketplace).toBe('claude-plugins-official');
    expect(sp.version).toBe('6.1.1');
    expect(sp.installPath).toContain('superpowers');
  });

  it('tolerates malformed inputs', () => {
    expect(mergePlugins(null, null)).toEqual([]);
    expect(mergePlugins({ plugins: 'oops' }, {})).toEqual([]);
    expect(mergePlugins({ plugins: { 'a@b': [] } }, { 'a@b': true })).toEqual([]);
  });
});

describe('parseSkillMd', () => {
  it('reads name/description from frontmatter', () => {
    const md = '---\nname: brainstorming\ndescription: Explores user intent before implementation\n---\n\n# Body';
    const s = parseSkillMd(md, 'dir-name', 'superpowers');
    expect(s).toEqual({ name: 'brainstorming', source: 'superpowers', description: 'Explores user intent before implementation' });
  });

  it('falls back to directory name without frontmatter', () => {
    const s = parseSkillMd('# no frontmatter', 'my-skill', 'user');
    expect(s.name).toBe('my-skill');
    expect(s.source).toBe('user');
    expect(s.description).toBeUndefined();
  });
});

describe('routerAgentTypes', () => {
  it('exposes router map entries with builtin flag', () => {
    const types = routerAgentTypes();
    const plan = types.find((t) => t.type === 'Plan')!;
    expect(plan.characterId).toBe('planner-researcher');
    expect(plan.builtin).toBe(true);
    expect(plan.source).toBe('router');
    const qa = types.find((t) => t.type === 'qa-verifier')!;
    expect(qa.builtin).toBe(false);
    expect(qa.characterId).toBe('tester');
    expect(types.length).toBeGreaterThanOrEqual(8);
  });
});
