# Claude Office Story

Claude Code 서브에이전트를 픽셀 아트 캐릭터로 시각화하는 로컬 대시보드.
Kairosoft *Game Dev Story* 톤의 8비트 레트로 UI로 팀원들의 실시간 활동을
사무실 풍경처럼 감상할 수 있습니다.

## 설치

clone 직후 아래 한 번이면 Volta 설치 → Node 22 pin → 의존성 설치 → 빌드 → 테스트 → 환경 진단까지 완료됩니다.

- **Linux/macOS**: `bash scripts/setup.sh`
- **Windows**: `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1`

이미 Volta(또는 Node 18.17+)가 있다면 `npm run setup`만으로 동일합니다.
환경 점검만 다시 보려면 `npm run doctor`.

실행: `npm start` → http://localhost:4000 접속

## 개발 모드 (라이브 리로드)

- `npm run dev` — 서버(`tsx watch`) + Vite(HMR)를 동시 실행. 소스 저장 시:
  - **프론트엔드**: Vite HMR로 즉시 화면 반영 (브라우저 새로고침 불필요)
  - **백엔드**: `tsx watch`가 TS 변경 감지 → Fastify 자동 재기동
- 서버: `http://localhost:4000` / Vite: `http://localhost:5173` (자동 프록시)
- 프로덕션 실행 (`npm start`)에서는 자동 재기동 없음 — 수정 후 `npm run build && npm start` 필요

## 첫 실행

1. 브라우저 접속 → 온보딩 화면 (▶ NEW GAME)
2. "전역" 또는 "현재 프로젝트" 선택 → 자동 설치 (curl로 hook 커맨드를 settings.json에 병합)
3. 이후 Claude Code 세션의 hook 이벤트가 실시간 반영. 트랜스크립트 tail은 기본 활성이므로 기존 세션의 활동도 즉시 파이프에 흘러들어옴.

## 지난 세션 재생

- 상단 재생 컨트롤에 트랜스크립트 파일 경로 입력 (예: `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl`)
- SPD (재생 속도, 1~200) 조절 → ▶ PLAY

## 뷰 전환

- 상단 [GRID | OFFICE] 토글
  - **GRID**: 카드 대시보드 (팀원 데스크 뷰). 6인의 상태·활동·모델·스탯 한눈에.
  - **OFFICE**: PixiJS 사무실 씬. 같은 픽셀 캐릭터가 각자 자리에 앉아있고, 툴 실행 시 해당 공간으로 걸어감.

## 팀 설정 (⚙ SETUP)

- 상단 우측 **⚙ SETUP** 버튼 → 모달에서 **이름만** 편집 가능
- 역할·설명은 실제 라우팅 조건과 붙어 있어 `config/characters.json`에서 관리
- 모델은 JSONL의 `assistant.message.model`에서 **자동 관측**되어 카드에 실시간 표시 (편집 불가)
- 이름 오버라이드는 `~/.claude-office/overrides.json`에 지속됨

## 캐릭터 로스터 (6명)

Main 세션 + 5개 스페셜리스트로 구성. 각 캐릭터는 실제 라우팅 조건이 있을 때만 반응합니다 (fake 애니 없음).

| 캐릭터 | 역할 | 활성 조건 |
|---|---|---|
| **김대리** | Main Session (PM) | 사용자 프롬프트, 매칭되지 않은 모든 툴 호출의 폴백. Main 세션이 Edit/Write로 코드를 직접 구현하는 경우도 포함 |
| **박기획** | Planner / Researcher | `Plan` 서브에이전트 spawn / `Grep`·`Glob` 호출 / `.md`·`.txt`·`.rst` Read |
| **테스터** | Test Runner / Analyst | `Bash`에서 pytest·jest·vitest·go test·cargo test·mocha·npm test 등 |
| **디버거** | Log / Error Analyst | `Bash`에서 grep·rg·tail·less·head·journalctl·dmesg / `*.log` 파일 Read |
| **리뷰어** | Code Reviewer | `general-purpose` 서브에이전트 (SDD 리뷰 워크플로 포함) |
| **문서담당** | Docs Manager | `.md`·`.mdx`·`.rst` 파일 Write/Edit |

카드 표시 (`.desk`):
- 상단: 아바타 + 이름 + **live-dot** (최근 1.5s 이내 업데이트 시 반짝임) + 역할 + **모델 뱃지**
- 카드 hover 시 브라우저 native `title` 툴팁으로 업무 설명 노출
- 활동 중: `Tool: label · 5s` 형태의 elapsed 카운트업
- 하단 스탯: `🎫 큐 · ★ 완료 · ⚙ 총 툴호출 · ✗ 오류 · ⏱ Xs ago`

상태별 애니메이션 (오피스 뷰):
- `idle` — 은은한 bob (1.4s)
- `working` — 빠른 bob (0.7s), 뱃지 pulse
- `walking` — moveTo 중 큰 진폭 bob + 좌우 facing 반전
- `error` — 카드 shake, 붉은 테두리
- `done` — 짧게 두 번 점프

## 관측되는 모델 (자동)

각 카드에 `◈ opus-4-7` 형태의 뱃지로 실제 사용 중인 모델이 표시됩니다.
- **kim (Main 세션)**: Main JSONL `assistant.message.model` 그대로
- **활동 기반 캐릭터** (tester/debugger/docs-manager/planner-researcher(부분)): 해당 활동을 실행한 세션의 모델
- **서브에이전트 캐릭터** (planner-researcher via Plan / code-reviewer via general-purpose): 해당 서브에이전트 JSONL의 모델
- 아직 활성화된 적 없는 캐릭터: `◈ 대기`

## 환경 변수

- `PORT` (기본 4000)
- `HOST` (기본 0.0.0.0)
- `LOG_LEVEL` (기본 info)
- `CM_TAIL_LOGS` (기본 활성) — `~/.claude/projects` JSONL 자동 tail. `CM_TAIL_LOGS=0`으로 비활성화

## 테스트

- `npm test` — vitest (66 tests)

## 아키텍처 하이라이트

- **Real JSONL parsing**: `src/server/transcriptToEvents.ts`가 실제 Claude Code 트랜스크립트 포맷 파싱 (`sessionId`, nested `message.content[]`, `tool_use`/`tool_result` 블록, `Agent` 툴 → `agent.start`/`agent.stop`)
- **Stateful processor per session**: `tool_use_id → { toolName, isAgent }` 추적으로 tool_result가 원래 tool 컨텍스트 복원
- **agentId → CharacterId tracking**: 인제스천 레이어가 post/stop을 원 pre/start의 캐릭터로 라우팅해 큐 누수 방지
- **캐릭터 상시 출근**: 로스터는 `idle`이 기본. `session.stop`도 `idle`로 리셋
- **Model attribution**: 이벤트 라우팅과 동시에 assistant record의 model을 캐릭터에 attribute

## Known v1 Debt

- **Playwright E2E 스모크 테스트**: v1은 vitest 66개 유닛/통합으로 커버, E2E는 v1.1로 이월
- **오피스 뷰 상호작용 확장**: 툴 이동만. 후속: 캐릭터 간 대화 애니, 걸음 프레임 애니
- **npm audit high 취약점**: Fastify 4의 transitive dep (`find-my-way`) → Fastify 5 업그레이드로 자연 해소 예정
- **아이소메트릭 오피스 반응형**: 캔버스 1024x640 고정. 좁은 뷰포트에서 오버플로
