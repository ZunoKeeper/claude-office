# Claude Monitor — 서브에이전트 캐릭터화 대시보드 (설계)

- **작성일**: 2026-07-25
- **작성자**: juneseok kim (with Claude Code)
- **상태**: v1 설계 확정, 구현 계획 대기

## 1. 개요

Claude Code 세션에서 발생하는 hook 이벤트와 트랜스크립트 로그를 실시간 수집해, 각 서브에이전트/툴 호출을 "중소기업 외주 개발팀"의 고정된 캐릭터로 시각화하고 웹 브라우저에서 실시간 상태·대사·애니메이션으로 표현하는 로컬 모니터링 앱.

**주된 사용 목적**: 데모/포트폴리오 시연 우선, 이후 실사용 모니터링 도구로 고도화.

## 2. 목표 & 비목표

### v1 목표
- Claude Code hook + 트랜스크립트 JSONL로부터 이벤트 수집 (실시간 + 재생)
- 9인 고정 캐릭터 로스터를 통해 활동 시각화
- 두 가지 뷰: 카드 그리드 대시보드(정보성) + 쿼터뷰(아이소메트릭) 오피스맵(임팩트)
- 병렬 요청은 큐 티켓으로 시각화
- 각 캐릭터 상태별 스프라이트 애니메이션 + 템플릿 기반 대사 말풍선
- 지난 세션 재생 (트랜스크립트 파싱)
- 로컬 실행, 기본 `0.0.0.0` 바인딩으로 LAN 접속 허용

### v1 비목표 (v2 이후)
- LLM 실시간 대사 생성 (Haiku 등)
- MCP 서버 = 외부 파트너 방문 애니
- 커스텀 서브에이전트 자동 감지·매핑
- 다중 세션 동시 표시 (v1은 단일 세션 초점)
- 캐릭터 자동 팬/줌 카메라 (v1은 카메라 고정)

## 3. 기술 스택

- **백엔드**: Node.js + Fastify + TypeScript
- **프론트엔드**: React + Vite + TypeScript
- **렌더러**: PixiJS (아이소메트릭 오피스), React (그리드 대시보드)
- **상태 관리**: Zustand
- **실시간 통신**: WebSocket (`@fastify/websocket`)
- **파일 감시**: chokidar + ndjson
- **테스트**: vitest (단위/통합), Playwright (E2E 스모크)
- **로깅**: pino

## 4. 아키텍처

### 4.1 프로세스 & 데이터 경로

```
Claude Code 세션
  ├─ hooks (SubagentStart/Stop, PreToolUse/PostToolUse,
  │         TaskCreated/Completed, UserPromptSubmit, SessionStart/Stop)
  │  → POST http://localhost:4000/hook
  └─ writes JSONL to ~/.claude/projects/**/*.jsonl

Backend (단일 Node/Fastify 프로세스, port 4000)
  hookReceiver ──┐
  logTailer ─────┼──> eventNormalizer ──> characterRouter ──> stateStore
                 │                             │
                 │                             └──> dialoguePool (템플릿 대사)
                 │                                         │
                 │                             ┌───────────┘
                 │                             ▼
                 │                          wsHub (broadcast)
                 │                             │
                 └────────────────────── staticServer (React build)
                                               │
                                               ▼
Frontend (React + Vite + PixiJS)
  eventClient (WS) ──> characterStore (Zustand)
                          │
                          ├──> GridDashboard (React 카드)
                          └──> IsometricOffice (PixiJS 캔버스)
```

### 4.2 아키텍처 원칙
- **모놀리스 단일 프로세스**: v1의 배포·개발 단순성 최우선. 확장 필요 시 리시버 분리로 리팩터링.
- **hook 우선, 로그는 보완**: hook은 실시간, JSONL은 재생·손실 이벤트 백필용.
- **캐릭터 상태 = 도메인 상태**: 프론트는 순수 렌더링, 상태 로직은 백엔드에 집중.
- **폴백 우선**: 알 수 없는 이벤트/툴/에이전트도 김대리(팀장)가 흡수하여 절대 침묵하지 않음.

## 5. 데이터 모델

### 5.1 정규화 도메인 이벤트

```ts
type DomainEvent =
  | { type: 'session.start';   ts: number; sessionId: string; cwd: string }
  | { type: 'session.stop';    ts: number; sessionId: string }
  | { type: 'user.prompt';     ts: number; sessionId: string; text: string }
  | { type: 'agent.start';     ts: number; sessionId: string; agentType: string; agentId: string; parentAgentId?: string; prompt?: string }
  | { type: 'agent.stop';      ts: number; sessionId: string; agentId: string; success: boolean }
  | { type: 'tool.pre';        ts: number; sessionId: string; agentId: string; toolName: string; input: unknown }
  | { type: 'tool.post';       ts: number; sessionId: string; agentId: string; toolName: string; success: boolean; durationMs?: number }
  | { type: 'task.created';    ts: number; sessionId: string; taskId: string; subject: string }
  | { type: 'task.completed';  ts: number; sessionId: string; taskId: string }
  | { type: 'mcp.call';        ts: number; sessionId: string; serverName: string; toolName: string; input: unknown }
  | { type: 'mcp.result';      ts: number; sessionId: string; serverName: string; toolName: string; success: boolean };
```

Claude Code hook payload와 JSONL 이벤트를 모두 이 스키마로 변환. 각 hook 이벤트별 변환 규칙은 `eventNormalizer`에서 명시.

### 5.2 캐릭터 정의 & 매핑

**정적 로스터** (`config/characters.json`):

| CharacterId | 이름 | 매핑 대상 | 자리 (좌표는 config) |
|---|---|---|---|
| `kim-team-lead` | 김대리 | Main session | 팀장석 (중앙) |
| `park-planner` | 박PL | `Plan` 에이전트 | 회의실 |
| `lee-researcher` | 이대리 | `Explore` 에이전트 | 서고 옆 |
| `yu-dev` | 유대리 | 코드 파일 Write/Edit | 개발자 자리 |
| `han-qa` | 한주임 | `security-review`/`review`, 테스트 Bash | 검수석 |
| `seo-designer` | 서주임 | UI 파일 Write/Edit, Figma 웹페치 | 디자인 자리 |
| `jo-senior` | 조과장 | `claude-code-guide` 에이전트 | 시니어석 |
| `jung-newbie` | 정막내 | `general-purpose` 에이전트 | 신입 책상 |
| `choi-office` | 최주임 | `statusline-setup`, 설정 파일 Write | 총무석 |

**폴백**: 매칭되지 않는 이벤트 → 김대리(팀장) 처리.

**활동 기반 룰** (`config/activityRules.json`):

```ts
type ActivityRule = {
  characterId: CharacterId;
  match: {
    toolName?: string[];
    filePathPattern?: string;   // regex
    bashCommandPattern?: string; // regex
    webFetchUrlPattern?: string; // regex
  };
  priority: number;
};
```

파일 확장자·Bash 명령어·URL 패턴으로 개발자/QA/디자이너 등을 분기. 여러 룰 매치 시 `priority` 최상위 승리, 무매치 시 폴백.

### 5.3 캐릭터 상태

```ts
type CharacterStatus = 'off' | 'idle' | 'thinking' | 'working' | 'blocked' | 'error' | 'done';

type Ticket = {
  ticketId: string;          // agentId 또는 toolCallId
  createdAt: number;
  label: string;             // 프롬프트 앞 30자
  status: 'queued' | 'active';
};

type CharacterState = {
  id: CharacterId;
  status: CharacterStatus;
  currentActivity?: {
    toolName: string;
    label: string;
    startedAt: number;
  };
  queue: Ticket[];
  lastLine?: { text: string; ts: number; ttlMs: number };
  stats: {
    tasksCompleted: number;
    toolCallsTotal: number;
    errorsCount: number;
  };
};
```

### 5.4 세션 모델

```ts
type Session = {
  sessionId: string;
  cwd: string;
  startedAt: number;
  stoppedAt?: number;
  events: DomainEvent[];   // 링 버퍼, 최대 5000개/세션
};
```

인메모리에 최근 5개 세션 유지 (설정 가능).

### 5.5 대사 템플릿

```ts
type DialogueEntry = {
  characterId: CharacterId;
  trigger: {
    eventType: DomainEvent['type'];
    toolName?: string;
    conditions?: { queueDepthGte?: number; errorRecent?: boolean };
  };
  templates: string[];   // 슬롯: {file}, {command}, {taskLabel}, {agentType}, {promptFirst20} 등
  weight?: number;
};
```

`config/dialogue/<characterId>.json`에 캐릭터별로 최소 5개 이상의 후보 대사.

### 5.6 WebSocket 프로토콜

```ts
type WsMessage =
  | { kind: 'snapshot'; characters: CharacterState[]; sessions: Session[] }
  | { kind: 'characterUpdated'; state: CharacterState }
  | { kind: 'sessionUpdated'; session: Session }
  | { kind: 'event'; event: DomainEvent };
```

클라이언트 연결 시 `snapshot` 1회 → 이후 델타(`characterUpdated`/`sessionUpdated`/`event`).

## 6. 캐릭터 시스템

### 6.1 상태 → 시각 표현 매핑

| status | 그리드 카드 | 오피스맵 애니 |
|---|---|---|
| `off` | 회색 실루엣 | 자리 비어있음 |
| `idle` | 컬러 + 커피잔 아이콘 | 자리에서 idle 스프라이트 (2프레임 loop) |
| `thinking` | 물음표 뱃지 + 은은한 펄스 | 턱 괴기 + 물음표 파티클 |
| `working` | 툴 이름 뱃지 + 진행 도트 | 툴별 애니 (아래 표) |
| `blocked` | 시계 아이콘 + 반투명 | 발 구르기 |
| `error` | 빨간 테두리 + 땀 방울 | 좌절 애니 (1회 재생 후 idle) |
| `done` | 초록 체크 (1.5초) | 하이파이브·따봉 (1회) |

### 6.2 툴 → 애니메이션 매핑

| 툴 | 애니메이션 |
|---|---|
| `Bash` (일반) | 자리에서 키보드 탁탁 + 터미널 창 파티클 |
| `Bash` (`test/build/pytest/jest/vitest/go test/cargo test`) | 스톱워치 들고 지켜봄 |
| `Read`/`Grep`/`Glob` | 서류 뭉치 훌훌 넘김 |
| `Write`/`Edit` | 키보드 미친 듯 타이핑 |
| `WebFetch`/`WebSearch` | 전화기 or 지도 펼침 |
| `Agent` 호출 | 호출자→피호출자 티켓 트윈 |
| MCP 호출 | 로비 방향 손짓 (v1은 애니만) |

### 6.3 티켓 큐

- `working` 중 같은 캐릭터에 새 요청 → `queued` 티켓 추가
- 그리드: 카드 옆에 티켓 스택 아이콘 + 숫자
- 오피스: 자리 옆에 티켓 파일 아이콘 (최대 5개 시각화, 초과분은 "+N")
- 큐 depth ≥ 2 시 부담 대사 후보 활성화 (예: 이대리 "지금 3개 물려있어요!")
- 활성 티켓 완료 시 큐 헤드가 `active`로 승격

### 6.4 대사 예시 (일부)

**김대리 (팀장)**
- `session.start`: "오늘도 시작해볼까요...", "자, 뭘 해달라시는지…"
- `agent.start(agentType='Explore')`: "이대리, {agentPromptFirst25} 좀 찾아줘요"
- `tool.post(success=false)`: "어... 이거 왜 안 되지"
- `session.stop`: "수고들 하셨습니다. 마감!"

**이대리 (Explore)**
- `agent.start`: "어디 있더라...", "찾아볼게요~"
- `agent.stop(success=true)`: "찾았다!", "여깄네요"
- 큐 depth ≥ 2: "제가 지금 {queueDepth}개 물려있어요!"

**유대리 (개발자)**
- `tool.pre(Write, filePath='*.ts')`: "타입스크립트... {fileName} 손볼게요"
- `tool.post(success=false)`: "흠, 컴파일러가 뭐라는데"

**한주임 (QA)**
- Bash `pytest` 시작: "테스트 돌립니다~"
- 테스트 실패: "어? 여기 하나 깨졌는데요"
- 테스트 성공: "통과!"

각 캐릭터×이벤트에 v1 기준 최소 5개 후보, 상태 반복 시 랜덤 로테이션.

## 7. 비주얼 시스템

### 7.1 뷰 구조

```
┌──────────────────────────────────────────────────┐
│  [Grid | Office]  세션: main ▼  ⏸ 재생속도 1×    │
├──────────────────────────────────────────────────┤
│                                                  │
│              (Grid 또는 Office 뷰)                │
│                                                  │
├──────────────────────────────────────────────────┤
│  이벤트 티커: [21:03] 이대리 Grep 완료 · 3건 매치 │
└──────────────────────────────────────────────────┘
```

뷰 토글은 상태(스토어)를 공유. 순수 렌더링 계층 교체.

### 7.2 Grid Dashboard (React)

- 3×3 카드 그리드, 반응형 (좁으면 2열, 넓으면 5열)
- 카드 요소: 스프라이트, 이름·직책, 상태 뱃지, 최근 대사(말풍선), 큐 카운트, 통계
- 카드 클릭 → 우측 드로어에 최근 이벤트 20개 상세

### 7.3 Isometric Office (PixiJS)

- 캔버스: 1024×640 논리 좌표, `pixi-viewport`로 pinch/pan 지원
- 아이소메트릭 타일 64×32 (2:1)
- 배경 레이어: 회의실(좌상), 개발실(중앙), 서고(좌하), 서버실(우상), 탕비실(우하), 로비(하단), 벽/바닥
- 캐릭터 레이어: 고정 좌표, 툴 이동 시 800ms 트윈 후 복귀
- UI 오버레이 (DOM): 말풍선, 티켓 스택, 상태 뱃지
- 카메라: v1 고정

### 7.4 스프라이트 자산 (v1)

캐릭터당:
- `idle` 2프레임 loop
- `thinking` 2프레임 loop + 물음표 파티클
- `working_desk` 2프레임 loop
- `walk` 4프레임 loop (좌우 반전)
- `celebrate` 1회 3프레임
- `frustrated` 1회 3프레임

총 ≈15프레임 × 9캐릭터 = 135프레임. 32×32, 스프라이트 시트 PNG + JSON.

**자산 확보**:
- 초기: AI 스프라이트 생성기 (Pixellab/Retro Diffusion) + Aseprite 정리
- 대체: itch.io 오픈 라이선스 팩 (LimeZu, cupnooble 등) 커스텀
- v1은 임시 프로토 스프라이트도 허용, 후속 릴리스에서 교체

### 7.5 접근성

- `prefers-reduced-motion` 감지 시 애니 정적 스프라이트로 폴백
- 상태 색상은 색맹 안전 팔레트 + 아이콘 병행
- 그리드 뷰는 완전 반응형, 오피스 뷰는 뷰포트 스케일

## 8. Hook 설치 UX

첫 실행 시 온보딩 화면:

```
[전역 (~/.claude/settings.json)] or [프로젝트 (.claude/settings.json)] 선택
[자동 설치] [수동 설정 보기] [건너뛰기]
```

**자동 설치** (`POST /setup/install-hooks?scope=user|project`):
- 대상 `settings.json` 읽기 → 기존 hooks 병합 → 필요한 이벤트에 아래 command 추가

```json
{
  "type": "command",
  "command": "curl -sS -X POST http://localhost:4000/hook -H 'Content-Type: application/json' -d @- 2>/dev/null || true",
  "async": true,
  "timeout": 5
}
```

- `async: true`: Claude Code 블로킹 최소화
- `|| true`: 백엔드 다운 시 Claude Code 방해 없음
- 병합 로직은 `update-config` 스킬 규칙 준수 (기존 hook 배열 보존)

**설치 완료 확인**: 온보딩 후 5초 안에 `SessionStart` 수신 → "연결됨" 표시, 아니면 진단 가이드.

## 9. 에러 처리

| 실패 지점 | 감지 | 처리 |
|---|---|---|
| 백엔드 미기동 상태의 hook | Claude Code `|| true` | 조용히 무시 |
| Hook payload 파싱 실패 | try/catch | 로깅 + 200 응답 (재시도 방지) |
| 트랜스크립트 로테이션/삭제 | chokidar `unlink` | 감시 리셋, 워닝 로그 |
| JSONL 라인 손상 | ndjson error | 라인 skip, 카운터 증가 |
| WS 연결 끊김 | 프론트 heartbeat 30s | 지수 백오프 재접속(1s→30s cap) + 배너 |
| 미지 에이전트/툴 | `characterRouter` 매칭 실패 | 김대리 폴백 + 원본 이벤트 로깅 |
| 대사 슬롯 undefined | 템플릿 실행 | "…"로 대체, 해당 후보 스킵 |
| PixiJS 텍스처 실패 | `Assets.load` 에러 | 플레이스홀더 + 콘솔 경고 |
| 상태 저장소 폭주 | 세션당 이벤트 링 버퍼(5000) | 오래된 이벤트 폐기 |
| 재생 중 라이브 갱신 | 재생 UI 감지 | "라이브로 전환" 배너 |

**로깅**: pino 구조화, `LOG_LEVEL` env, 사용자 프롬프트 원문 로그 최소화.

## 10. 테스트 전략

**단위 (vitest)**:
- `eventNormalizer`: fixture 20개
- `characterRouter`: 매핑 케이스 (Activity 룰 포함)
- `dialoguePool`: 트리거 매칭 + 슬롯 치환
- `stateStore`: 상태 전이 (queue push/pop, done→idle timeout)

**통합**:
- `hookReceiver` + `characterRouter` + `wsHub`: fastify inject + ws mock, 브로드캐스트 검증
- `logTailer`: 임시 디렉토리 JSONL append → 이벤트 방출 검증

**E2E (Playwright 스모크)**:
- 온보딩 화면 표시
- Fixture hook 시퀀스 → 카드 상태 반영
- 뷰 토글 → 오피스 뷰 캐릭터 렌더링
- WS 강제 종료 → 5초 내 재접속

**수동 검증 (릴리스 게이트)**:
- 실제 Claude Code 5분 세션 → 9인 중 최소 3인 활동 감지
- 병렬 서브에이전트 3개 → 큐 티켓 정확성
- 트랜스크립트 재생 → 원본 순서 일치

## 11. 성능 목표 (v1)

- WS 이벤트 → 화면 반영: p95 < 200ms
- 백엔드 메모리: 500 이벤트/분에서 < 200MB
- 프론트: 60fps idle, 활성 애니 5개 동시 30fps 이상

## 12. 프로젝트 구조

```
claude-monitor/
├─ package.json
├─ src/
│  ├─ server/
│  │  ├─ index.ts
│  │  ├─ hookReceiver.ts
│  │  ├─ logTailer.ts
│  │  ├─ eventNormalizer.ts
│  │  ├─ characterRouter.ts
│  │  ├─ stateStore.ts
│  │  ├─ wsHub.ts
│  │  ├─ replayer.ts
│  │  ├─ setup/installHooks.ts
│  │  └─ dialogue/pool.ts
│  ├─ web/
│  │  ├─ main.tsx
│  │  ├─ App.tsx
│  │  ├─ store/characterStore.ts
│  │  ├─ ws/eventClient.ts
│  │  ├─ views/GridDashboard.tsx
│  │  ├─ views/IsometricOffice.tsx
│  │  ├─ views/ViewSwitcher.tsx
│  │  ├─ components/SpeechBubble.tsx
│  │  ├─ components/TicketQueue.tsx
│  │  └─ pixi/
│  └─ shared/
│     ├─ events.ts
│     └─ character.ts
├─ assets/
│  ├─ sprites/
│  └─ office/
├─ config/
│  ├─ characters.json
│  ├─ activityRules.json
│  └─ dialogue/*.json
├─ test/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
└─ docs/
```

## 13. v2 이후 로드맵 (참고)

- LLM 실시간 대사 (Haiku 등 경량 모델, 하이브리드)
- MCP 서버 = 외부 파트너 방문 애니 (드라이브 문서센터 등)
- 커스텀 서브에이전트 자동 감지·매핑
- 다중 세션 통합/탭 뷰
- 카메라 자동 팬·줌 (활성 캐릭터 강조)
- 캐릭터 스프라이트 업그레이드 (B: 치비/카툰 SVG+CSS)
- LAN 넘어 tunnel (ngrok/Cloudflare)로 원격 데모
