import type { CharacterId } from '../shared/character.js';
import type { ActivityRule } from '../shared/config.js';
import type { DomainEvent } from '../shared/events.js';

// 서브에이전트 타입 → 담당 캐릭터. 성격(하는 일) 기준으로 매칭한다.
// 이 머신의 ~/.claude 환경(내장 5종 + transcript에서 관측되는 플러그인 타입)과
// 동기화되어야 함 — .claude/agents 디렉터리는 user/project 어디에도 없으므로
// 정확명(exact-name) repo 서브에이전트 항목은 두지 않는다.
export const AGENT_TYPE_MAP: Record<string, CharacterId> = {
  // Claude Code 내장 (code.claude.com/docs/en/subagents)
  Plan: 'planner-researcher',            // 계획 수립
  Explore: 'planner-researcher',         // 코드 탐색
  'general-purpose': 'code-reviewer',    // SDD 리뷰 워크플로 등 범용 멀티스텝
  'claude-code-guide': 'docs-manager',   // 문서/가이드 Q&A
  'statusline-setup': 'team-lead',   // 설정 헬퍼 — 메인 폴백에 명시
  // 플러그인/하네스 제공 — 이 머신 transcript에서 실제 관측되는 타입
  claude: 'team-lead',               // 범용 워커 (FleetView 기본)
  'tech-lead': 'planner-researcher',     // 설계 판단
  'qa-verifier': 'tester',               // 검증/QA
  stabilizer: 'debugger',                // 안정화/오류 대응
  'feature-dev': 'team-lead',        // 기능 구현 (메인 구현 라인)
  'ux-designer': 'docs-manager',         // 산출물/디자인 문서
};

export const BUILTIN_AGENT_TYPES: ReadonlySet<string> = new Set(['Plan', 'Explore', 'general-purpose']);

const FALLBACK: CharacterId = 'team-lead';

function matchRule(rule: ActivityRule, toolName: string, input: unknown): boolean {
  const m = rule.match;
  if (m.toolName && !m.toolName.includes(toolName)) return false;
  const io = (input ?? {}) as Record<string, unknown>;
  if (m.filePathPattern) {
    const fp = typeof io.file_path === 'string' ? io.file_path : '';
    if (!new RegExp(m.filePathPattern).test(fp)) return false;
  }
  if (m.bashCommandPattern) {
    const cmd = typeof io.command === 'string' ? io.command : '';
    if (!new RegExp(m.bashCommandPattern).test(cmd)) return false;
  }
  if (m.webFetchUrlPattern) {
    const url = typeof io.url === 'string' ? io.url : '';
    if (!new RegExp(m.webFetchUrlPattern).test(url)) return false;
  }
  return true;
}

export function createRouter(rules: ActivityRule[]) {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  return {
    route(event: DomainEvent): CharacterId {
      switch (event.type) {
        case 'agent.start':
        case 'agent.stop': {
          const at = event.type === 'agent.start' ? event.agentType : undefined;
          return at && AGENT_TYPE_MAP[at] ? AGENT_TYPE_MAP[at] : FALLBACK;
        }
        case 'tool.pre':
        case 'tool.post': {
          for (const r of sorted) {
            if (matchRule(r, event.toolName, (event as Extract<DomainEvent, { type: 'tool.pre' }>).input)) {
              return r.characterId;
            }
          }
          return FALLBACK;
        }
        default:
          return FALLBACK;
      }
    },
  };
}
