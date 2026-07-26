import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadDestinationsBase, applyDestinationOverrides } from '../../src/server/setup/destinations.js';

const CONFIG_DIR = path.resolve(process.cwd(), 'config');

describe('tool destinations', () => {
  it('loads base destinations from config', async () => {
    const base = await loadDestinationsBase(CONFIG_DIR);
    expect(base.length).toBeGreaterThan(0);
    const pantry = base.find((d) => d.id === 'pantry');
    expect(pantry?.tools).toContain('Bash');
    expect(pantry?.tools).toContain('PowerShell');
  });

  it('returns [] for a directory without the config file', async () => {
    const base = await loadDestinationsBase(path.join(CONFIG_DIR, 'no-such-dir'));
    expect(base).toEqual([]);
  });

  it('applies coordinate overrides without touching label/tools', async () => {
    const base = await loadDestinationsBase(CONFIG_DIR);
    const merged = applyDestinationOverrides(base, { pantry: { x: 111, y: 222 } });
    const pantry = merged.find((d) => d.id === 'pantry')!;
    expect(pantry.x).toBe(111);
    expect(pantry.y).toBe(222);
    expect(pantry.label).toBe(base.find((d) => d.id === 'pantry')!.label);
    // 오버라이드 없는 항목은 그대로
    const meeting = merged.find((d) => d.id === 'meeting')!;
    expect(meeting.x).toBe(base.find((d) => d.id === 'meeting')!.x);
  });
});
