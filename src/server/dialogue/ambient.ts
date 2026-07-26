import type { CharacterId, CharacterStatus } from '../../shared/character.js';
import type { DialogueEntry } from '../../shared/dialogue.js';
import type { StateStore } from '../stateStore.js';
import { pickLine } from './pool.js';

/** 이 상태에서는 이벤트 없이도 캐릭터가 계속 혼잣말을 한다. */
const TALKATIVE: CharacterStatus[] = ['working', 'thinking', 'blocked', 'error'];

export interface AmbientOpts {
  /** 상태 폴링 주기 */
  tickMs?: number;
  /** 같은 캐릭터의 다음 대사까지 최소 간격 (활동 상태) */
  minGapMs?: number;
  /** 최소 간격에 더해지는 랜덤 지터의 최대값 (활동 상태) */
  jitterMs?: number;
  /** idle 잡담의 최소 간격 — 배회와 어울리게 활동 상태보다 훨씬 느리게 */
  idleMinGapMs?: number;
  /** idle 잡담 지터 최대값 */
  idleJitterMs?: number;
  /** 말풍선 TTL */
  lineTtlMs?: number;
}

/** 발화 케이던스 그룹 — 그룹이 바뀌면 다음 발화 시각을 다시 잡는다. */
type Cadence = 'active' | 'idle';

function cadenceOf(status: CharacterStatus): Cadence | null {
  if (TALKATIVE.includes(status)) return 'active';
  if (status === 'idle') return 'idle';
  return null;
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
  const idleMinGapMs = opts.idleMinGapMs ?? 20000;
  const idleJitterMs = opts.idleJitterMs ?? 25000;
  const lineTtlMs = opts.lineTtlMs ?? 4500;
  const nextAt = new Map<CharacterId, { at: number; cadence: Cadence }>();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const s of store.getAll()) {
      const cadence = cadenceOf(s.status);
      if (cadence === null) {
        nextAt.delete(s.id);
        continue;
      }
      const due = nextAt.get(s.id);
      if (due === undefined || due.cadence !== cadence) {
        // 케이던스 진입 직후 첫 대사 — 활동은 짧게(이벤트 대사와 겹침 완화),
        // idle은 배회 시작 시간대(15~60초)와 어울리게 더 길게 기다린다.
        const first = cadence === 'active'
          ? 1200 + Math.random() * 1500
          : idleMinGapMs * 0.4 + Math.random() * (idleMinGapMs * 0.6 + idleJitterMs * 0.4);
        nextAt.set(s.id, { at: now + first, cadence });
        continue;
      }
      if (now < due.at) continue;

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
      const gap = cadence === 'active'
        ? minGapMs + Math.random() * jitterMs
        : idleMinGapMs + Math.random() * idleJitterMs;
      nextAt.set(s.id, { at: now + gap, cadence });
    }
  }, tickMs);

  return () => clearInterval(timer);
}
