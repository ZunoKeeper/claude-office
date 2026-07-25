import type { CharacterState } from '../../shared/character.js';
import { StatusBadge } from './StatusBadge.js';
import { SpeechBubble } from './SpeechBubble.js';
import { TicketQueue } from './TicketQueue.js';
import { PixelAvatar } from './PixelAvatar.js';
import { useNow, formatRelative } from '../hooks/useNow.js';

interface Props {
  state: CharacterState;
  name: string;
  role: string;
  description?: string;
}

/** Trim Anthropic's full model IDs to a short pill: `claude-opus-4-7` → `opus-4-7`. */
function shortenModel(m?: string): string | null {
  if (!m) return null;
  const trimmed = m.replace(/^claude-/, '').replace(/-\d{8}$/, '');
  return trimmed || null;
}

export function CharacterCard({ state, name, role, description }: Props) {
  const now = useNow(1000);
  const updatedAgo = state.lastUpdatedAt ? formatRelative(now - state.lastUpdatedAt) : '—';
  const activityElapsed = state.currentActivity
    ? Math.max(0, Math.floor((now - state.currentActivity.startedAt) / 1000))
    : null;
  const isFresh = state.lastUpdatedAt && now - state.lastUpdatedAt < 1500;
  const modelLabel = shortenModel(state.currentModel);

  return (
    <div className={`desk ${state.status === 'error' ? 'error' : ''} status-${state.status}`}>
      <div className="desk-header">
        <div className="desk-name-block">
          <div className="avatar-frame">
            <PixelAvatar id={state.id} size={40} />
          </div>
          <div className="desk-title">
            <span className="name">
              {name}
              {isFresh && <span className="live-dot" title="방금 업데이트됨" />}
            </span>
            <span className="role">{role}</span>
            {modelLabel ? (
              <span className="model-badge live" title={`관측된 실제 모델: ${state.currentModel}`}>
                ◈ {modelLabel}
              </span>
            ) : (
              <span className="model-badge unknown" title="아직 이 캐릭터의 모델이 관측되지 않음">
                ◈ 대기
              </span>
            )}
          </div>
        </div>
        <StatusBadge status={state.status} />
      </div>

      {description && <div className="desk-description">{description}</div>}

      {state.currentActivity && (
        <div className="activity">
          {state.currentActivity.toolName}: {state.currentActivity.label}
          {activityElapsed !== null && <span className="activity-elapsed"> · {activityElapsed}s</span>}
        </div>
      )}

      {state.lastLine && (
        <SpeechBubble text={state.lastLine.text} ts={state.lastLine.ts} ttlMs={state.lastLine.ttlMs} />
      )}

      <TicketQueue tickets={state.queue} />

      <div className="stats">
        <span className="stat-queue" title="큐 티켓 개수">{state.queue.length}</span>
        <span className="stat-done" title="완료한 작업">{state.stats.tasksCompleted}</span>
        <span className="stat-calls" title="총 툴 호출 수">{state.stats.toolCallsTotal}</span>
        <span className="stat-err" title="오류 발생 수">{state.stats.errorsCount}</span>
        <span className="stat-time" title="마지막 상태 갱신 시각">{updatedAgo}</span>
      </div>
    </div>
  );
}
