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

## 팀 설정 (⚙ SETUP)

- 상단 우측 **⚙ SETUP** 버튼 → 모달에서 각 캐릭터의 **이름 · 역할 · 모델 · 설명** 편집
- Model 드롭다운: 서버 `/config/models` 응답 기준 (`fable` / `opus` / `sonnet` / `haiku` / 미지정) + **직접 입력**으로 임의 문자열 사용 가능 (예: `claude-opus-4-7`)
- 저장 시 `PATCH /config/characters/:id`로 즉시 반영 (재기동 불필요)
- 오버라이드는 `~/.claude-office/overrides.json`에 지속 (base config는 손대지 않음)
- 초기화하려면 위 파일 삭제 후 새로고침

## 환경 변수

- `PORT` (기본 4000)
- `HOST` (기본 0.0.0.0)
- `LOG_LEVEL` (기본 info)
- `CM_TAIL_LOGS` (기본 활성) — `~/.claude/projects` JSONL 자동 tail. `CM_TAIL_LOGS=0`으로 비활성화

## 테스트

- `npm test` — vitest 실행 (단위 + 통합, 64 tests)

## 캐릭터 로스터 (Kairosoft *Game Dev Story* 톤)

각 캐릭터는 개별 16×20 픽셀 스프라이트로 그리드 뷰에 렌더링됩니다 (`src/web/components/PixelAvatar.tsx`).
역할·성격·의상이 실루엣만 봐도 구분되도록 설계.

| 캐릭터 | 역할 | 기본 모델 | 디자인 포인트 |
|---|---|---|---|
| 김대리 | 팀장 (Main) | fable | 사용자 요구사항 접수·최종 회수만. 실행은 PL에게 위임 |
| 박PL | 기획/아키텍트 (Plan) | opus | 팀장 지시 접수 → 팀원에게 세부 분배 |
| 이대리 | 자료조사 (Explore) | sonnet | 청록 헝클어진 헤어, 큰 안경, 클립보드 |
| 유대리 | 개발자 (Write/Edit) | opus | 오렌지 후드, 검은 헤드폰 |
| 한주임 | QA (test 툴) | sonnet | 자홍 밥 컷, 안경, 서류 클립보드 |
| 서주임 | 디자이너 (UI 파일) | sonnet | 마젠타 비대칭 헤어, 컬러칩 태블릿 |
| 조과장 | 시니어 (claude-code-guide) | sonnet | 회색 후퇴 헤어, 정장 + 라펠, 매뉴얼 |
| 정막내 | 신입 (general-purpose) | haiku | 초록 뽀글 헤어, 헤드폰, 큰 미소 |
| 최주임 | 총무 (statusline-setup) | haiku | 노랑 묶은 머리, 형광펜 탭 폴더 |

카드 표시 (컴팩트 밀도, `.desk`):
- 상단: 아바타 + 이름 + **live-dot** (최근 1.5s 이내 업데이트 시 반짝임) + 역할 + **모델 뱃지**
- 카드 **hover** 시 툴팁으로 **업무 설명** 노출
- 활동 중: `Tool: label · 5s` 형태의 elapsed 카운트업 표시
- 말풍선 하단: **골드 TTL 바** — 남은 표시 시간 카운트다운
- 하단 스탯: `🎫 큐 · ★ 완료 · ⚙ 총 툴호출 · ✗ 오류 · ⏱ Xs ago`

**박PL의 dispatcher 역할** (v1.1): 모든 서브에이전트 spawn(agent.start) 시 park-planner에
자동으로 "{대상}에게 맡깁시다" 대사가 뜨도록 하여 팀장 → PL → 실무자 흐름을 시각화.
자체 라우팅은 유지되며 이는 UX 오버레이.

**설정 창의 모델 필드는 디스플레이 전용**입니다. 실제 서브에이전트의 모델은 Claude Code CLI
(`claude --model <name>`) 또는 Agent 툴의 `model` 파라미터로 결정되며, 이 화면은
팀 구성 문서화 용도입니다.

상태별 애니메이션:
- `idle` — 은은한 bob (1.4s)
- `working` — 빠른 bob (0.7s), 뱃지 pulse
- `thinking` — 좌우 흔들 + 살짝 tilt
- `done` — 짧게 두 번 점프
- `error` — 카드+뱃지 shake, 붉은 테두리

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
- **레이아웃**: React 그리드 대시보드 (픽셀 아바타) + PixiJS 아이소메트릭 오피스 (뷰 스토어 공유).

## Known v1 Debt

다음 항목은 v1 범위에서 제외되었으며 v1.1에서 처리 예정입니다.

- **Playwright E2E 스모크 테스트**: 스펙 §10의 4개 시나리오(온보딩, hook→카드, view 토글, WS 재접속)는 v1.1로 이월. v1에서는 vitest 단위/통합 테스트(64개)로 커버.
- **캐릭터 스프라이트 업그레이드 (오피스 뷰)**: 그리드 뷰는 개별 픽셀 아바타 완료. PixiJS 아이소메트릭 오피스 뷰는 아직 단색 사각형 → 그리드와 동일한 픽셀 캐릭터 스프라이트로 통일 예정.
- **npm audit high 취약점**: Fastify 4의 transitive dep(`find-my-way`)에서 high-severity 경고 존재. Fastify 5로 업그레이드 시 자연 해소 예정 (v1.1 트랙).
- **v1 아이소메트릭 오피스 반응형**: 캔버스 1024x640 고정. 좁은 뷰포트에서는 오버플로.
