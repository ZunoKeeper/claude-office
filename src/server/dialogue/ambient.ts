import type { CharacterId, CharacterStatus } from '../../shared/character.js';
import type { DialogueEntry } from '../../shared/dialogue.js';
import type { StateStore } from '../stateStore.js';
import { pickLine } from './pool.js';

/** 이 상태에서는 이벤트 없이도 캐릭터가 계속 혼잣말을 한다. */
const TALKATIVE: CharacterStatus[] = ['working', 'thinking', 'blocked', 'error'];

export interface AmbientOpts {
  /** 상태 폴링 주기 */
  tickMs?: number;
  /** 같은 캐릭터의 다음 대사까지 최소 간격 */
  minGapMs?: number;
  /** 최소 간격에 더해지는 랜덤 지터의 최대값 */
  jitterMs?: number;
  /** 말풍선 TTL */
  lineTtlMs?: number;
}

/**
 * 활동 중인 캐릭터가 상태에 맞는 ambient 대사를 3~6초 간격으로 계속 내뱉게
 * 하는 루프. 이벤트 트리거 대사(hookReceiver)와 별개로 동작하며, setLine이
 * 말풍선을 교체하는 구조라 서로 겹쳐도 안전하다. 반환값은 정지 함수.
 */
export function startAmbientDialogue(
  store: StateStore,
  dialogues: Map<CharacterId, DialogueEntry[]>,
  opts: AmbientOpts = {},
): () => void {
  const tickMs = opts.tickMs ?? 1000;
  const minGapMs = opts.minGapMs ?? 3200;
  const jitterMs = opts.jitterMs ?? 2800;
  const lineTtlMs = opts.lineTtlMs ?? 4500;
  const nextAt = new Map<CharacterId, number>();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const s of store.getAll()) {
      if (!TALKATIVE.includes(s.status)) {
        nextAt.delete(s.id);
        continue;
      }
      const due = nextAt.get(s.id);
      if (due === undefined) {
        // 활동 시작 직후 첫 대사는 짧은 지연 후 — 이벤트 대사와 겹침 완화
        nextAt.set(s.id, now + 1200 + Math.random() * 1500);
        continue;
      }
      if (now < due) continue;

      // MCP 툴의 원시 이름(mcp__server__tool)은 말풍선에 너무 길다 — 마지막
      // 세그먼트만 남기고 30자로 자른다.
      const shorten = (v: string): string => {
        const tail = v.replace(/^mcp__.+?__/, '');
        return tail.length > 30 ? tail.slice(0, 28) + '…' : tail;
      };
      const line = pickLine(dialogues.get(s.id) ?? [], {
        event: { type: 'ambient', status: s.status },
        queueDepth: s.queue.length,
        recentError: s.status === 'error',
        slots: {
          queueDepth: s.queue.length,
          toolName: shorten(s.currentActivity?.toolName ?? '작업'),
          label: shorten(s.currentActivity?.label ?? '작업'),
          elapsedS: s.currentActivity ? Math.max(0, Math.floor((now - s.currentActivity.startedAt) / 1000)) : 0,
          errors: s.stats.errorsCount,
          done: s.stats.tasksCompleted,
          calls: s.stats.toolCallsTotal,
        },
      });
      if (line) store.setLine(s.id, line, lineTtlMs);
      nextAt.set(s.id, now + minGapMs + Math.random() * jitterMs);
    }
  }, tickMs);

  return () => clearInterval(timer);
}
