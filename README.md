# Claude Office Story

Claude Code 서브에이전트를 "중소기업 외주 개발팀" 캐릭터로 시각화하는 로컬 대시보드.
Kairosoft *Game Dev Story* 톤의 8비트 레트로 픽셀 아트 UI로 팀원들의 실시간 활동을
사무실 풍경처럼 감상할 수 있습니다.

## 설치

- 요구: Node.js 18.17 이상
- `npm install`
- `npm run build`
- `npm start` → http://localhost:4000 접속

## 개발 모드

- `npm run dev` (서버 + Vite 동시 실행)
- 서버: `http://localhost:4000`
- Vite: `http://localhost:5173` (자동 프록시)

## 첫 실행

1. 브라우저 접속 → 온보딩 화면 (▶ NEW GAME)
2. "전역" 또는 "현재 프로젝트" 선택 → 자동 설치 (curl로 hook 커맨드를 settings.json에 병합)
3. 이후 Claude Code 세션의 hook 이벤트가 실시간 반영. 트랜스크립트 tail은 기본 활성이므로
   기존 세션의 활동도 즉시 파이프에 흘러들어옴.

## 지난 세션 재생

- 상단 재생 컨트롤에 트랜스크립트 파일 경로 입력 (예: `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl`)
- SPD (재생 속도, 1~200) 조절 → ▶ PLAY

## 뷰 전환

- 상단 [GRID | OFFICE] 토글
  - **GRID**: 카드 대시보드 (팀원 데스크 뷰)
  - **OFFICE**: PixiJS 아이소메트릭 사무실

## 환경 변수

- `PORT` (기본 4000)
- `HOST` (기본 0.0.0.0)
- `LOG_LEVEL` (기본 info)
- `CM_TAIL_LOGS` (기본 활성) — `~/.claude/projects` JSONL 자동 tail. `CM_TAIL_LOGS=0`으로 비활성화

## 테스트

- `npm test` — vitest 실행 (단위 + 통합, 64 tests)

## 아키텍처 하이라이트

- **Real JSONL parsing**: `src/server/transcriptToEvents.ts`가 실제 Claude Code
  트랜스크립트 포맷을 파싱. `sessionId`, nested `message.content[]`, `tool_use`/`tool_result`
  블록을 모두 이해하고, `Agent` 툴 사용은 `agent.start`/`agent.stop`으로 매핑.
- **Stateful processor per session**: `tool_use_id → { toolName, isAgent }` 추적으로
  `tool_result`가 원래 tool의 컨텍스트를 복원.
- **agentId → CharacterId tracking**: 인제스천 레이어가 post/stop을 원 pre/start의
  캐릭터로 라우팅해 큐 누수 방지.
- **캐릭터 상시 출근**: 로스터는 `idle`이 기본. `session.stop`도 `idle`로 리셋 —
  "직원이 출근해 있어야 일을 하지" 원칙.
- **레이아웃**: React 그리드 대시보드 + PixiJS 아이소메트릭 오피스 (뷰 스토어 공유).

## Known v1 Debt

다음 항목은 v1 범위에서 제외되었으며 v1.1에서 처리 예정입니다.

- **Playwright E2E 스모크 테스트**: 스펙 §10의 4개 시나리오(온보딩, hook→카드, view 토글, WS 재접속)는 v1.1로 이월. v1에서는 vitest 단위/통합 테스트(64개)로 커버.
- **캐릭터 스프라이트 업그레이드**: v1은 프로그래매틱 CSS/SVG 픽셀 스프라이트. v1.1에서 실제 스프라이트 시트(itch.io 오픈 라이선스 or AI 생성) 도입 예정.
- **npm audit high 취약점**: Fastify 4의 transitive dep(`find-my-way`)에서 high-severity 경고 존재. Fastify 5로 업그레이드 시 자연 해소 예정 (v1.1 트랙).
- **v1 아이소메트릭 오피스 반응형**: 캔버스 1024x640 고정. 좁은 뷰포트에서는 오버플로.
