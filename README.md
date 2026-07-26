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
2. "전역" 또는 "현재 프로젝트" 선택 → 자동 설치 (curl로 hook 커맨드를 settings.json에 병합).
   훅 커맨드는 전 플랫폼 POSIX(sh) 문법 — Claude Code가 Windows에서도 Git Bash로 훅을 실행합니다.
   재설치 시 구버전 커맨드(cmd 문법 `2>nul` 등)는 자동 교체됩니다.
3. 이후 Claude Code 세션의 hook 이벤트가 실시간 반영. 트랜스크립트 tail은 기본 활성이므로 진행 중인 세션의 새 활동도 즉시 파이프에 흘러들어옴 (서버 기동 이전의 과거 히스토리는 재생하지 않음 — 중단된 옛 세션의 고아 이벤트 유입 방지).

## 화면 구성 (단일 통합 뷰)

과거의 GRID/OFFICE 모드 전환은 제거되고 한 화면으로 통합되었습니다. 위에서부터:

- **캐릭터 카드 패널** — 6인의 카드가 상단에 가로 한 줄로 상시 표시 (상태·활동·모델·스탯).
  카드 폭은 280~320px로 고정되며, 창이 좁으면 줄바꿈 대신 패널에 가로 스크롤이 생깁니다.
- **오피스 씬** — PixiJS 사무실. 픽셀 캐릭터가 각자 자리에 앉아있고, 툴 실행 시 해당 공간으로 걸어감.
  캐릭터는 MetroCity 32×32 스프라이트 시트(피부톤×헤어×의상 조합)로 렌더되며 걷기는 6프레임
  사이클입니다. 한가할 때는 이따금 목적지 한 곳을 배회하고, 배회 중에도 잡담 말풍선이 뜹니다.
  - 캔버스는 920×510 논리 좌표계를 유지한 채 **브라우저 크기에 맞춰 스케일** —
    `min(가용 폭/920, 가용 높이/510)` 비율로 스크롤 없이 항상 사무실 전체가 보입니다.
  - 캐릭터 이름표는 캔버스 밖 **HTML 네임태그** (고정 11px) — 씬이 확대돼도 흐려지지 않고,
    걷는 캐릭터를 매 프레임 따라갑니다.
  - **✎ 위치 편집**: 캐릭터 드래그로 좌석 이동, 방향(N/E/S/W)·자세(서기/앉기/타이핑) 변경.
    편집 모드에서는 **동선 마커**(⚑ 탕비실/회의 테이블 등)도 드래그로 옮길 수 있음 —
    툴 실행 시 캐릭터가 걸어가는 목적지가 바뀐다. 기본값은 `config/toolDestinations.json`,
    편집 결과는 `~/.claude-office/destinationOverrides.json`에 저장.
- **Capability Strip** — 하단 상시 표시. 왼쪽 라벨 컬럼(MODELS/SUB AGENTS/SKILLS/PLUGINS)과
  오른쪽 칩 영역의 2단 구성. 모델 패밀리(관측 시 하이라이트) · Sub Agent 종류(담당 캐릭터별) ·
  활성 Skills(플러그인별) · 활성 플러그인 (`GET /env/capabilities`, 서버 기동 시 1회 스캔).

## 팀 설정 (⚙ SETUP)

- 상단 우측 **⚙ SETUP** 버튼 → 모달에서 **이름**과 **외모(스프라이트 조합)** 편집 가능
- 역할·설명은 실제 라우팅 조건과 붙어 있어 `config/characters.json`에서 관리
- 모델은 JSONL의 `assistant.message.model`에서 **자동 관측**되어 카드에 실시간 표시 (편집 불가)
- 이름 오버라이드는 `~/.claude-office/overrides.json`에 지속됨

### 외모 편집 (스프라이트 조합)

각 캐릭터 행의 **▼ 외모 편집** 버튼을 누르면 파트 선택 그리드가 열립니다.

- **피부톤** 6종 × **헤어** 13종(+없음) × **의상** 15종(+없음) 조합
- 미리보기: 4방향 서기 + 걷기 애니메이션 실시간 반영
- **SAVE ALL** 시 `PUT /config/sprites`로 저장 → 씬·카드 아바타 즉시 재합성
- 저장 위치: `~/.claude-office/sprites.json` (에이전트 id → `{skin, hair, outfit}`)
- 기본 조합: `src/shared/sprites.ts`의 `DEFAULT_APPEARANCES`

스프라이트 원본은 `src/web/assets/metrocity/`의 시트 PNG들입니다. 모든 시트는
32×32 프레임 × 24열(정면 0–5 / 오른쪽 6–11 / 후면 12–17 / 왼쪽 18–23, 각 방향
6프레임 걷기 사이클) 구조이고, 행이 배리에이션(피부톤·헤어스타일·의상)입니다.

새 파트 시트를 추가하려면:
1. 같은 24열 규격의 PNG를 `src/web/assets/metrocity/`에 추가
2. `src/web/pixi/sprites/sheets.ts`의 `SHEET_URLS`에 URL 등록
3. `src/shared/sprites.ts`의 `HAIR_SHEETS` 또는 `OUTFIT_SHEETS`에 `시트명: 행수` 추가
   → 에디터 그리드·서버 검증에 자동 반영

앉기/타이핑 전용 프레임은 시트에 없어 정면 서기 프레임으로 대체합니다
(타이핑은 1px 오프셋 교차). 전용 프레임 시트를 구하면
`src/web/pixi/sprites/types.ts`의 `poseToFrame`만 수정하면 됩니다.

## 캐릭터 로스터 (6명)

Main 세션 + 5개 스페셜리스트로 구성. 각 캐릭터는 실제 라우팅 조건이 있을 때만 반응합니다 (fake 애니 없음).

| 캐릭터 | 역할 | 활성 조건 |
|---|---|---|
| **나팀장** | Main Session (PM) | 사용자 프롬프트, 매칭되지 않은 모든 툴 호출의 폴백. Main 세션이 Edit/Write로 코드를 직접 구현하는 경우도 포함 |
| **박기획** | Planner / Researcher | `Plan` 서브에이전트 spawn / `Grep`·`Glob` 호출 / `.md`·`.txt`·`.rst` Read |
| **왕꼼꼼** | Test Runner / Analyst | `Bash`에서 pytest·jest·vitest·go test·cargo test·mocha·npm test 등 |
| **김모아** | Log / Error Analyst | `Bash`에서 grep·rg·tail·less·head·journalctl·dmesg / `*.log` 파일 Read |
| **최강진** | Code Reviewer | `general-purpose` 서브에이전트 (SDD 리뷰 워크플로 포함) |
| **송작가** | Docs Manager | `.md`·`.mdx`·`.rst` 파일 Write/Edit / `claude-code-guide` 서브에이전트 |

기본 이름은 `config/characters.json`에서 관리합니다.

서브에이전트 타입 → 캐릭터 매핑은 `src/server/characterRouter.ts`의 `AGENT_TYPE_MAP`에서 관리합니다.
현행 내장 5종(Plan/Explore/general-purpose/claude-code-guide/statusline-setup)과 이 머신에서
관측되는 플러그인 타입(tech-lead/qa-verifier/stabilizer/feature-dev/ux-designer 등)을 성격 기준으로
배정하며, 매핑에 없는 타입은 Main 세션 캐릭터로 폴백됩니다.

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

## 대사(말풍선) 커스터마이징

캐릭터 대사는 전부 `config/dialogue/<characterId>.json`에서 편집합니다.
**서버 시작 시 1회 로드**되므로 수정 후에는 서버 재시작(`npm run dev`는 아무
`src/**/*.ts` 저장으로도 재기동)이 필요합니다.

항목 구조 (`DialogueEntry`):

```jsonc
{
  "characterId": "tester",
  "trigger": {
    "eventType": "tool.pre",              // 아래 트리거 표 참고
    "toolName": ["Bash", "PowerShell"],   // 선택 — 단일 문자열 또는 배열
    "status": "idle",                     // ambient 전용 — 이 상태일 때만
    "conditions": {                        // 선택
      "queueDepthGte": 2,                 // 큐가 N개 이상일 때만
      "errorRecent": true                 // 직전 오류가 있을 때만
    }
  },
  "weight": 2,                            // 선택 — 추첨 가중치 (기본 1)
  "templates": ["대사 후보 1", "대사 후보 2 {command}…"]
}
```

트리거 종류:

| eventType | 시점 | 사용 가능한 슬롯 변수 |
|---|---|---|
| `session.start` / `session.stop` | 세션 시작/종료 | `{queueDepth}` |
| `user.prompt` | 사용자 프롬프트 입력 | `{promptFirst20}` |
| `tool.pre` / `tool.post` | 툴 실행 전/후 | `{fileName}` `{command}` `{pattern}` `{queueDepth}` |
| `agent.start` / `agent.stop` | 서브에이전트 spawn/종료 | `{agentType}` `{promptFirst25}` |
| `ambient` + `status` | 상태 지속 중 주기 발화 | `{toolName}` `{label}` `{elapsedS}` `{errors}` `{done}` `{calls}` `{queueDepth}` |

ambient 발화 케이던스 (상태별):

- **working / thinking / blocked / error** — 3.2~6초 간격 (첫 발화 1.2~2.7초)
- **idle (배회 잡담)** — 20~45초 간격 (첫 발화 8~20초). 자리에서든 배회 중이든 발화
- 조정: `src/server/index.ts`의 `startAmbientDialogue(store, dialogues, opts)`에
  `minGapMs`/`jitterMs`(활동), `idleMinGapMs`/`idleJitterMs`(유휴), `lineTtlMs`(말풍선 TTL) 전달

## 커스터마이징 레퍼런스

사용자가 고쳐 쓰기 좋은 데이터 위치 모음입니다.

**저장소 config/ (기본값 — git 관리)**

| 파일 | 내용 | 반영 시점 |
|---|---|---|
| `config/characters.json` | 캐릭터 이름·역할·설명·좌석 좌표(`officeSeat`)·바라보는 방향(`seatDirection`)·휴식 자세(`seatPose`: stand/sit/type) | 서버 재시작 |
| `config/dialogue/*.json` | 캐릭터별 대사 풀 (위 섹션 참고) | 서버 재시작 |
| `config/toolDestinations.json` | 동선 목적지 — `{ id, label, x, y, tools: [...] }`. `tools`에 적힌 툴 실행 시 캐릭터가 그 좌표로 걸어감 (920×510 논리 좌표) | 서버 재시작 |
| `config/activityRules.json` | 툴/파일패턴/커맨드패턴 → 담당 캐릭터 라우팅 규칙 (`priority` 높은 쪽 우선) | 서버 재시작 |

**`~/.claude-office/` (사용자 오버라이드 — UI에서 편집, 즉시 반영)**

| 파일 | 내용 | 편집 UI |
|---|---|---|
| `overrides.json` | 캐릭터 이름 변경분 | ⚙ SETUP → 이름 |
| `sprites.json` | 캐릭터 외모 조합 `{skin, hair, outfit}` | ⚙ SETUP → ▼ 외모 편집 |
| `destinationOverrides.json` | 동선 마커(⚑) 좌표 이동분 | 씬 → ✎ 위치 편집 → 마커 드래그 |
| `waypoints.json` | 캐릭터×목적지별 걷기 경유점 | 씬 → ✎ 위치 편집 |

**코드 레벨 (동작 규칙)**

| 위치 | 내용 |
|---|---|
| `src/server/characterRouter.ts` `AGENT_TYPE_MAP` | 서브에이전트 타입 → 캐릭터 배정 |
| `src/shared/sprites.ts` `DEFAULT_APPEARANCES` / `HAIR_SHEETS` / `OUTFIT_SHEETS` | 기본 외모 조합, 파트 카탈로그(시트별 행 수) |
| `src/web/pixi/OfficeScene.ts` `wanderTick` | 자유 배회 주기·확률 (idle 진입 15~60초 후 첫 배회) |
| `src/web/pixi/CharacterSprite.ts` `WALK_FRAME_MS`/`TYPE_FRAME_MS`/`PIXEL_SCALE` | 걷기·타이핑 프레임 속도, 스프라이트 배율 |
| `src/server/dialogue/ambient.ts` | ambient 발화 케이던스 기본값 |

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

- `npm test` — vitest 단위/통합 테스트 (100+ tests: 스프라이트 프레임·외모 검증·ambient 대사 포함)

## 아키텍처 하이라이트

- **Real JSONL parsing**: `src/server/transcriptToEvents.ts`가 실제 Claude Code 트랜스크립트 포맷 파싱 (`sessionId`, nested `message.content[]`, `tool_use`/`tool_result` 블록, `Agent` 툴 → `agent.start`/`agent.stop`)
- **Stateful processor per session**: `tool_use_id → { toolName, isAgent }` 추적으로 tool_result가 원래 tool 컨텍스트 복원
- **agentId → CharacterId tracking**: 인제스천 레이어가 post/stop을 원 pre/start의 캐릭터로 라우팅해 큐 누수 방지
- **캐릭터 상시 출근**: 로스터는 `idle`이 기본. `session.stop`도 `idle`로 리셋
- **Model attribution**: 이벤트 라우팅과 동시에 assistant record의 model을 캐릭터에 attribute

## Known v1 Debt

- **Playwright E2E 스모크 테스트**: v1은 vitest 85개 유닛/통합으로 커버, E2E는 v1.1로 이월
- **오피스 뷰 상호작용 확장**: 걸음 6프레임 애니·자유 배회·유휴 잡담은 반영 완료. 후속: 캐릭터 간 대화 애니
- **앉기/타이핑 전용 프레임 부재**: MetroCity 시트에 sit/type 프레임이 없어 정면 서기 프레임으로 대체 중
- **npm audit high 취약점**: Fastify 4의 transitive dep (`find-my-way`) → Fastify 5 업그레이드로 자연 해소 예정
- **말풍선 스케일링**: 말풍선은 아직 캔버스 안이라 씬과 함께 확대됨 — 이름표처럼 HTML 오버레이 전환 가능
