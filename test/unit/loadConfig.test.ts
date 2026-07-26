import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadConfig } from '../../src/server/config/loadConfig.js';

const CONFIG_DIR = path.resolve(process.cwd(), 'config');

describe('loadConfig', () => {
  it('loads 6 characters', async () => {
    const { characters } = await loadConfig(CONFIG_DIR);
    expect(characters).toHaveLength(6);
    expect(characters.map((c) => c.id)).toContain('team-lead');
  });

  it('loads activity rules sorted by priority desc', async () => {
    const { rules } = await loadConfig(CONFIG_DIR);
    expect(rules.length).toBeGreaterThan(0);
    for (let i = 1; i < rules.length; i++) {
      expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
    }
  });

  it('rejects unknown character id in rules', async () => {
    await expect(loadConfig(CONFIG_DIR + '/__does_not_exist__')).rejects.toThrow();
  });
});
