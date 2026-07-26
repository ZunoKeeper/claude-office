import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStateStore } from '../../src/server/stateStore.js';
import { startAmbientDialogue } from '../../src/server/dialogue/ambient.js';
import { pickLine } from '../../src/server/dialogue/pool.js';
import type { DialogueEntry } from '../../src/shared/dialogue.js';
import type { CharacterId } from '../../src/shared/character.js';

const POOL: DialogueEntry[] = [
  { characterId: 'team-lead', trigger: { eventType: 'ambient', status: 'working' }, templates: ['일하는 중'] },
  { characterId: 'team-lead', trigger: { eventType: 'ambient', status: 'error' }, templates: ['에러 잡는 중'] },
  { characterId: 'team-lead', trigger: { eventType: 'ambient', status: 'idle' }, templates: ['커피나 한 잔'] },
];

function dialogues(): Map<CharacterId, DialogueEntry[]> {
  const m = new Map<CharacterId, DialogueEntry[]>();
  m.set('team-lead', POOL);
  return m;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ambient trigger matching', () => {
  it('matches only the entry for the current status', () => {
    const ctx = { queueDepth: 0, recentError: false, slots: {} };
    expect(pickLine(POOL, { ...ctx, event: { type: 'ambient', status: 'working' } })).toBe('일하는 중');
    expect(pickLine(POOL, { ...ctx, event: { type: 'ambient', status: 'error' } })).toBe('에러 잡는 중');
    expect(pickLine(POOL, { ...ctx, event: { type: 'ambient', status: 'thinking' } })).toBeNull();
  });

  it('matches toolName given as an array (Bash/PowerShell 겸용)', () => {
    const pool: DialogueEntry[] = [
      { characterId: 'tester', trigger: { eventType: 'tool.pre', toolName: ['Bash', 'PowerShell'] }, templates: ['테스트!'] },
    ];
    const ctx = { queueDepth: 0, recentError: false, slots: {} };
    const ev = (toolName: string) =>
      ({ type: 'tool.pre', ts: 0, sessionId: 's', agentId: 'a', toolName, input: {} }) as const;
    expect(pickLine(pool, { ...ctx, event: ev('PowerShell') })).toBe('테스트!');
    expect(pickLine(pool, { ...ctx, event: ev('Bash') })).toBe('테스트!');
    expect(pickLine(pool, { ...ctx, event: ev('Read') })).toBeNull();
  });
});

describe('startAmbientDialogue', () => {
  it('emits lines repeatedly while a character stays active', () => {
    vi.useFakeTimers();
    const store = createStateStore(['team-lead']);
    store.applyEvent('team-lead', { type: 'tool.pre', ts: Date.now(), sessionId: 's', agentId: 'a', toolName: 'Edit', input: {} });
    expect(store.get('team-lead').status).toBe('working');

    const stop = startAmbientDialogue(store, dialogues(), { tickMs: 100, minGapMs: 500, jitterMs: 0, lineTtlMs: 1000 });
    try {
      // 첫 due 등록(최대 2.7s) + 발화까지 진행
      vi.advanceTimersByTime(3000);
      const first = store.get('team-lead').lastLine;
      expect(first?.text).toBe('일하는 중');

      vi.advanceTimersByTime(600);
      const second = store.get('team-lead').lastLine;
      expect(second?.ts).toBeGreaterThan(first!.ts);
    } finally {
      stop();
    }
  });

  it('idle 캐릭터는 느린 케이던스로 잡담한다', () => {
    vi.useFakeTimers();
    const store = createStateStore(['team-lead']);
    expect(store.get('team-lead').status).toBe('idle');

    const stop = startAmbientDialogue(store, dialogues(), {
      tickMs: 100, minGapMs: 200, jitterMs: 0, idleMinGapMs: 2000, idleJitterMs: 0,
    });
    try {
      // 첫 idle 발화 지연(idleMinGap의 0.4~1.0배) 안에서는 침묵
      vi.advanceTimersByTime(500);
      expect(store.get('team-lead').lastLine).toBeUndefined();
      // 지연 상한 이후에는 발화
      vi.advanceTimersByTime(2500);
      expect(store.get('team-lead').lastLine?.text).toBe('커피나 한 잔');
    } finally {
      stop();
    }
  });

  it('idle 잡담 풀이 없는 캐릭터는 여전히 침묵한다', () => {
    vi.useFakeTimers();
    const store = createStateStore(['tester']);
    const m = new Map<CharacterId, DialogueEntry[]>();
    m.set('tester', [
      { characterId: 'tester', trigger: { eventType: 'ambient', status: 'working' }, templates: ['일하는 중'] },
    ]);
    const stop = startAmbientDialogue(store, m, { tickMs: 100, idleMinGapMs: 500, idleJitterMs: 0 });
    try {
      vi.advanceTimersByTime(5000);
      expect(store.get('tester').lastLine).toBeUndefined();
    } finally {
      stop();
    }
  });

  it('활동 상태로 바뀌면 활동 케이던스로 발화한다 (idle due가 남아있어도)', () => {
    vi.useFakeTimers();
    const store = createStateStore(['team-lead']);
    const stop = startAmbientDialogue(store, dialogues(), {
      tickMs: 100, minGapMs: 200, jitterMs: 0, idleMinGapMs: 60000, idleJitterMs: 0,
    });
    try {
      vi.advanceTimersByTime(1000); // idle due는 아직 한참 남음
      store.applyEvent('team-lead', { type: 'tool.pre', ts: Date.now(), sessionId: 's', agentId: 'a', toolName: 'Edit', input: {} });
      vi.advanceTimersByTime(3000); // 활동 첫 발화(≤2.7s) 경과
      expect(store.get('team-lead').lastLine?.text).toBe('일하는 중');
    } finally {
      stop();
    }
  });
});
