# Claude Monitor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code 서브에이전트를 "중소기업 외주 개발팀" 캐릭터로 시각화하는 로컬 실시간 대시보드 (그리드 + 아이소메트릭 오피스 뷰) 구축.

**Architecture:** 단일 Node/Fastify 프로세스가 hook HTTP 수신 + JSONL 로그 tail + 이벤트 정규화 + 캐릭터 매핑 + WebSocket 브로드캐스트를 모두 담당. 프론트는 React + Vite + PixiJS. 상태는 백엔드 인메모리, 프론트는 순수 렌더링.

**Tech Stack:** Node.js 18.17+, Fastify 4, TypeScript 5, React 18, Vite 5, PixiJS 8, Zustand 4, chokidar 3, ndjson 2, pino 9, vitest 2, Playwright 1 (선택).

## Global Constraints

- Node.js 18.17 이상
- TypeScript strict mode 활성
- 서버 기본 리슨: `0.0.0.0:4000` (env `PORT`, `HOST`로 오버라이드)
- 모든 hook payload는 200 응답 (Claude Code 재시도 차단)
- 캐릭터 폴백: 매칭 실패 시 `kim-team-lead` (팀장)
- 세션당 이벤트 링 버퍼: 5000
- 인메모리 세션 유지: 최근 5개
- 사용자 프롬프트 원문은 pino 로그에서 20자 이내로 truncate
- 캐릭터 스프라이트: 32×32, 스프라이트 시트 PNG + JSON
- WS 이벤트 → 화면 반영: p95 < 200ms 목표
- 각 태스크 완료 시 반드시 `git commit` (Task N: 접두어)
- 워킹 브랜치는 `main` (feature 브랜치는 사용자 요청 시)

## File Structure

```
claude-monitor/
├─ package.json                        # root, npm workspaces
├─ tsconfig.base.json
├─ .gitignore
├─ .eslintrc.cjs                       # optional, 최소 설정
├─ vitest.config.ts
├─ src/
│  ├─ shared/                          # 백엔드/프론트 공유 타입
│  │  ├─ events.ts                     # DomainEvent, HookPayload
│  │  ├─ character.ts                  # CharacterId, CharacterState, CharacterStatus, Ticket
│  │  ├─ dialogue.ts                   # DialogueEntry
│  │  ├─ ws.ts                         # WsMessage
│  │  └─ config.ts                     # CharacterConfig, ActivityRule
│  ├─ server/
│  │  ├─ index.ts                      # Fastify entry, bootstrap
│  │  ├─ hookReceiver.ts               # POST /hook
│  │  ├─ eventNormalizer.ts            # hook payload → DomainEvent
│  │  ├─ characterRouter.ts            # event → CharacterId
│  │  ├─ stateStore.ts                 # in-memory 상태
│  │  ├─ wsHub.ts                      # WebSocket 브로드캐스트
│  │  ├─ dialogue/pool.ts              # 템플릿 대사 렌더러
│  │  ├─ config/loadConfig.ts          # config JSON 로더
│  │  ├─ logTailer.ts                  # chokidar + ndjson tail
│  │  ├─ replayer.ts                   # 세션 재생
│  │  └─ setup/installHooks.ts         # POST /setup/install-hooks
│  └─ web/
│     ├─ index.html
│     ├─ main.tsx
│     ├─ App.tsx
│     ├─ store/characterStore.ts       # Zustand
│     ├─ ws/eventClient.ts             # WS 클라이언트
│     ├─ views/
│     │  ├─ GridDashboard.tsx
│     │  ├─ IsometricOffice.tsx
│     │  ├─ ViewSwitcher.tsx
│     │  ├─ OnboardingScreen.tsx
│     │  └─ ReplayControls.tsx
│     ├─ components/
│     │  ├─ CharacterCard.tsx
│     │  ├─ SpeechBubble.tsx
│     │  ├─ TicketQueue.tsx
│     │  └─ StatusBadge.tsx
│     └─ pixi/
│        ├─ OfficeScene.ts             # PixiJS 씬 컨트롤러
│        ├─ CharacterSprite.ts         # 캐릭터 스프라이트 wrapper
│        ├─ IsometricGrid.ts           # 좌표 변환 유틸
│        └─ animations.ts              # 상태별 애니 트리거
├─ assets/
│  ├─ sprites/
│  │  ├─ placeholder-32x32.png
│  │  └─ characters/                   # 9인 스프라이트 시트
│  └─ office/
│     └─ office-bg.png
├─ config/
│  ├─ characters.json
│  ├─ activityRules.json
│  └─ dialogue/
│     ├─ kim-team-lead.json
│     ├─ park-planner.json
│     ├─ lee-researcher.json
│     ├─ yu-dev.json
│     ├─ han-qa.json
│     ├─ seo-designer.json
│     ├─ jo-senior.json
│     ├─ jung-newbie.json
│     └─ choi-office.json
├─ test/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  └─ fixtures/
│     ├─ hooks/                        # 샘플 hook payloads
│     └─ jsonl/                        # 샘플 트랜스크립트 라인
└─ docs/
   └─ superpowers/
      ├─ specs/2026-07-25-claude-monitor-design.md
      └─ plans/2026-07-25-claude-monitor-v1-implementation.md
```

---

## Milestone 1 — Backend Event Pipeline

**Deliverable:** `npm run dev:server`로 백엔드 기동, `curl -X POST localhost:4000/hook` + `wscat ws://localhost:4000/live`로 이벤트 → 브로드캐스트 end-to-end 검증 가능.

---

### Task 1: 프로젝트 스캐폴드 + Fastify Health

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `tsconfig.server.json`, `.gitignore`, `vitest.config.ts`, `src/server/index.ts`, `test/unit/health.test.ts`

**Interfaces:**
- Produces: `startServer(opts?: { host?: string; port?: number }): Promise<FastifyInstance>` in `src/server/index.ts`

- [ ] **Step 1: 루트 파일 생성**

`package.json`:
```json
{
  "name": "claude-monitor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "tsx watch src/server/index.ts",
    "build:server": "tsc -p tsconfig.server.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fastify": "^4.28.1",
    "@fastify/websocket": "^10.0.1",
    "@fastify/static": "^7.0.4",
    "pino": "^9.4.0",
    "pino-pretty": "^11.2.2"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "tsx": "^4.19.0",
    "vitest": "^2.0.5",
    "@types/node": "^20.14.15"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

`tsconfig.server.json`:
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist/server",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/server", "src/shared"]
}
```

`.gitignore`:
```
node_modules
dist
.env
.env.local
*.log
.vite
.DS_Store
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
```

- [ ] **Step 2: 실패하는 health 테스트 작성**

`test/unit/health.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { startServer } from '../../src/server/index.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('server health', () => {
  it('responds to GET /health with { ok: true }', async () => {
    app = await startServer({ port: 0 });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

```
npm install
npx vitest run test/unit/health.test.ts
```
Expected: FAIL (`startServer` not found).

- [ ] **Step 4: 최소 서버 구현**

`src/server/index.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import pino from 'pino';

const logger = pino({
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  level: process.env.LOG_LEVEL ?? 'info',
});

export interface ServerOpts {
  host?: string;
  port?: number;
}

export async function startServer(opts: ServerOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger });
  app.get('/health', async () => ({ ok: true }));
  const host = opts.host ?? process.env.HOST ?? '0.0.0.0';
  const port = opts.port ?? Number(process.env.PORT ?? 4000);
  if (port > 0) await app.listen({ host, port });
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 5: 테스트 통과 확인**

```
npx vitest run test/unit/health.test.ts
```
Expected: PASS

- [ ] **Step 6: 커밋**

```
git add package.json package-lock.json tsconfig.base.json tsconfig.server.json .gitignore vitest.config.ts src/server/index.ts test/unit/health.test.ts
git commit -m "feat(server): scaffold Fastify server with health endpoint (Task 1)"
```

---

### Task 2: 공유 타입 정의 (DomainEvent, CharacterState, WsMessage)

**Files:**
- Create: `src/shared/events.ts`, `src/shared/character.ts`, `src/shared/ws.ts`, `src/shared/config.ts`, `src/shared/dialogue.ts`, `test/unit/shared-types.test.ts`

**Interfaces:**
- Produces: 모든 후속 태스크가 참조하는 타입 정의 (아래 코드 블록 참조)

- [ ] **Step 1: 실패하는 타입 컴파일 테스트**

`test/unit/shared-types.test.ts`:
```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { DomainEvent } from '../../src/shared/events.js';
import type { CharacterState, CharacterId, CharacterStatus } from '../../src/shared/character.js';
import type { WsMessage } from '../../src/shared/ws.js';

describe('shared types', () => {
  it('DomainEvent discriminates on type', () => {
    const e: DomainEvent = { type: 'session.start', ts: 1, sessionId: 's', cwd: '/' };
    expectTypeOf(e.type).toEqualTypeOf<DomainEvent['type']>();
  });

  it('CharacterState has queue array', () => {
    const s: CharacterState = {
      id: 'kim-team-lead' as CharacterId,
      status: 'idle' as CharacterStatus,
      queue: [],
      stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 },
    };
    expectTypeOf(s.queue).toBeArray();
  });

  it('WsMessage snapshot carries characters', () => {
    const m: WsMessage = { kind: 'snapshot', characters: [], sessions: [] };
    expectTypeOf(m.kind).toBeString();
  });
});
```

- [ ] **Step 2: `src/shared/events.ts` 작성**

```ts
export type DomainEvent =
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

export type HookEventName =
  | 'SessionStart' | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'SubagentStart' | 'SubagentStop'
  | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'
  | 'TaskCreated' | 'TaskCompleted';

export interface HookPayload {
  session_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: { success?: boolean; error?: string };
  agent_type?: string;
  agent_id?: string;
  parent_agent_id?: string;
  prompt?: string;
  cwd?: string;
  task_id?: string;
  subject?: string;
  [k: string]: unknown;
}
```

- [ ] **Step 3: `src/shared/character.ts` 작성**

```ts
export type CharacterId =
  | 'kim-team-lead'
  | 'park-planner'
  | 'lee-researcher'
  | 'yu-dev'
  | 'han-qa'
  | 'seo-designer'
  | 'jo-senior'
  | 'jung-newbie'
  | 'choi-office';

export const ALL_CHARACTER_IDS: readonly CharacterId[] = [
  'kim-team-lead', 'park-planner', 'lee-researcher', 'yu-dev', 'han-qa',
  'seo-designer', 'jo-senior', 'jung-newbie', 'choi-office',
];

export type CharacterStatus = 'off' | 'idle' | 'thinking' | 'working' | 'blocked' | 'error' | 'done';

export interface Ticket {
  ticketId: string;
  createdAt: number;
  label: string;
  status: 'queued' | 'active';
}

export interface CharacterActivity {
  toolName: string;
  label: string;
  startedAt: number;
}

export interface CharacterState {
  id: CharacterId;
  status: CharacterStatus;
  currentActivity?: CharacterActivity;
  queue: Ticket[];
  lastLine?: { text: string; ts: number; ttlMs: number };
  stats: { tasksCompleted: number; toolCallsTotal: number; errorsCount: number };
}
```

- [ ] **Step 4: `src/shared/ws.ts`, `src/shared/config.ts`, `src/shared/dialogue.ts` 작성**

`src/shared/ws.ts`:
```ts
import type { CharacterState } from './character.js';
import type { DomainEvent } from './events.js';

export interface SessionSummary {
  sessionId: string;
  cwd: string;
  startedAt: number;
  stoppedAt?: number;
  eventCount: number;
}

export type WsMessage =
  | { kind: 'snapshot'; characters: CharacterState[]; sessions: SessionSummary[] }
  | { kind: 'characterUpdated'; state: CharacterState }
  | { kind: 'sessionUpdated'; session: SessionSummary }
  | { kind: 'event'; event: DomainEvent };
```

`src/shared/config.ts`:
```ts
import type { CharacterId } from './character.js';

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  role: string;
  officeSeat: { x: number; y: number };
  spriteSheet: string;
}

export interface ActivityRule {
  characterId: CharacterId;
  match: {
    toolName?: string[];
    filePathPattern?: string;
    bashCommandPattern?: string;
    webFetchUrlPattern?: string;
  };
  priority: number;
}
```

`src/shared/dialogue.ts`:
```ts
import type { CharacterId } from './character.js';
import type { DomainEvent } from './events.js';

export interface DialogueEntry {
  characterId: CharacterId;
  trigger: {
    eventType: DomainEvent['type'];
    toolName?: string;
    conditions?: { queueDepthGte?: number; errorRecent?: boolean };
  };
  templates: string[];
  weight?: number;
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

```
npx vitest run test/unit/shared-types.test.ts
```
Expected: PASS

- [ ] **Step 6: 커밋**

```
git add src/shared test/unit/shared-types.test.ts
git commit -m "feat(shared): define DomainEvent, CharacterState, WsMessage types (Task 2)"
```

---

### Task 3: Config 로더 (characters.json, activityRules.json)

**Files:**
- Create: `config/characters.json`, `config/activityRules.json`, `src/server/config/loadConfig.ts`, `test/unit/loadConfig.test.ts`

**Interfaces:**
- Consumes: `CharacterConfig`, `ActivityRule` from `src/shared/config.ts`
- Produces: `loadConfig(dir?: string): Promise<{ characters: CharacterConfig[]; rules: ActivityRule[] }>`

- [ ] **Step 1: config JSON 작성**

`config/characters.json`:
```json
[
  { "id": "kim-team-lead",   "name": "김대리", "role": "팀장",        "officeSeat": { "x": 500, "y": 320 }, "spriteSheet": "characters/kim.json" },
  { "id": "park-planner",    "name": "박PL",   "role": "기획/아키텍트", "officeSeat": { "x": 200, "y": 160 }, "spriteSheet": "characters/park.json" },
  { "id": "lee-researcher",  "name": "이대리", "role": "자료조사원",    "officeSeat": { "x": 180, "y": 460 }, "spriteSheet": "characters/lee.json" },
  { "id": "yu-dev",          "name": "유대리", "role": "개발자",        "officeSeat": { "x": 620, "y": 240 }, "spriteSheet": "characters/yu.json" },
  { "id": "han-qa",          "name": "한주임", "role": "QA",           "officeSeat": { "x": 720, "y": 400 }, "spriteSheet": "characters/han.json" },
  { "id": "seo-designer",    "name": "서주임", "role": "디자이너",      "officeSeat": { "x": 620, "y": 460 }, "spriteSheet": "characters/seo.json" },
  { "id": "jo-senior",       "name": "조과장", "role": "시니어/사수",   "officeSeat": { "x": 380, "y": 180 }, "spriteSheet": "characters/jo.json" },
  { "id": "jung-newbie",     "name": "정막내", "role": "신입",          "officeSeat": { "x": 380, "y": 500 }, "spriteSheet": "characters/jung.json" },
  { "id": "choi-office",     "name": "최주임", "role": "총무",          "officeSeat": { "x": 820, "y": 240 }, "spriteSheet": "characters/choi.json" }
]
```

`config/activityRules.json`:
```json
[
  { "characterId": "yu-dev",       "priority": 100, "match": { "toolName": ["Write", "Edit"], "filePathPattern": "\\.(py|ts|tsx|js|jsx|go|java|rs|c|cpp|h|hpp|rb|php)$" } },
  { "characterId": "han-qa",       "priority": 110, "match": { "toolName": ["Bash"], "bashCommandPattern": "\\b(pytest|jest|vitest|go test|cargo test|mocha)\\b" } },
  { "characterId": "seo-designer", "priority": 100, "match": { "toolName": ["Write", "Edit"], "filePathPattern": "\\.(css|scss|html|vue|svg)$" } },
  { "characterId": "seo-designer", "priority": 90,  "match": { "toolName": ["WebFetch"], "webFetchUrlPattern": "figma\\.com" } },
  { "characterId": "choi-office",  "priority": 95,  "match": { "toolName": ["Write", "Edit"], "filePathPattern": "settings\\.json$|\\.claude/.*\\.(json|md)$" } }
]
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/unit/loadConfig.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadConfig } from '../../src/server/config/loadConfig.js';

const CONFIG_DIR = path.resolve(process.cwd(), 'config');

describe('loadConfig', () => {
  it('loads 9 characters', async () => {
    const { characters } = await loadConfig(CONFIG_DIR);
    expect(characters).toHaveLength(9);
    expect(characters.map((c) => c.id)).toContain('kim-team-lead');
  });

  it('loads activity rules sorted by priority desc', async () => {
    const { rules } = await loadConfig(CONFIG_DIR);
    expect(rules.length).toBeGreaterThan(0);
    for (let i = 1; i < rules.length; i++) {
      expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
    }
  });

  it('rejects unknown character id in rules', async () => {
    await expect(loadConfig(CONFIG_DIR + '/__does_not_exist__')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: 실행 → 실패 확인**

```
npx vitest run test/unit/loadConfig.test.ts
```

- [ ] **Step 4: `loadConfig` 구현**

`src/server/config/loadConfig.ts`:
```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ALL_CHARACTER_IDS, type CharacterId } from '../../shared/character.js';
import type { CharacterConfig, ActivityRule } from '../../shared/config.js';

const KNOWN = new Set<CharacterId>(ALL_CHARACTER_IDS);

export async function loadConfig(dir: string): Promise<{ characters: CharacterConfig[]; rules: ActivityRule[] }> {
  const [charsRaw, rulesRaw] = await Promise.all([
    readFile(path.join(dir, 'characters.json'), 'utf8'),
    readFile(path.join(dir, 'activityRules.json'), 'utf8'),
  ]);
  const characters = JSON.parse(charsRaw) as CharacterConfig[];
  const rules = JSON.parse(rulesRaw) as ActivityRule[];

  for (const c of characters) {
    if (!KNOWN.has(c.id)) throw new Error(`Unknown character id: ${c.id}`);
  }
  for (const r of rules) {
    if (!KNOWN.has(r.characterId)) throw new Error(`Rule references unknown character: ${r.characterId}`);
  }

  rules.sort((a, b) => b.priority - a.priority);
  return { characters, rules };
}
```

- [ ] **Step 5: 테스트 통과 확인**

```
npx vitest run test/unit/loadConfig.test.ts
```

- [ ] **Step 6: 커밋**

```
git add config src/server/config test/unit/loadConfig.test.ts
git commit -m "feat(server): character + activity rule config loader (Task 3)"
```

---

### Task 4: Event Normalizer (hook payload → DomainEvent)

**Files:**
- Create: `src/server/eventNormalizer.ts`, `test/fixtures/hooks/session-start.json`, `test/fixtures/hooks/pretool-write.json`, `test/fixtures/hooks/subagent-start.json`, `test/fixtures/hooks/task-created.json`, `test/unit/eventNormalizer.test.ts`

**Interfaces:**
- Consumes: `HookPayload`, `HookEventName`, `DomainEvent` from `src/shared/events.ts`
- Produces: `normalizeHook(eventName: HookEventName, payload: HookPayload, receivedAt: number): DomainEvent | null`

- [ ] **Step 1: 픽스처 파일 생성**

`test/fixtures/hooks/session-start.json`:
```json
{ "session_id": "sess-abc", "cwd": "/home/u/proj" }
```

`test/fixtures/hooks/pretool-write.json`:
```json
{ "session_id": "sess-abc", "agent_id": "agt-1", "tool_name": "Write", "tool_input": { "file_path": "/proj/src/app.ts", "content": "..." } }
```

`test/fixtures/hooks/subagent-start.json`:
```json
{ "session_id": "sess-abc", "agent_id": "agt-2", "agent_type": "Explore", "parent_agent_id": "agt-1", "prompt": "find kafka docs" }
```

`test/fixtures/hooks/task-created.json`:
```json
{ "session_id": "sess-abc", "task_id": "task-9", "subject": "refactor login" }
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/unit/eventNormalizer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeHook } from '../../src/server/eventNormalizer.js';

const FIX = path.resolve(process.cwd(), 'test/fixtures/hooks');
async function fx<T = unknown>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(FIX, name), 'utf8'));
}

describe('normalizeHook', () => {
  const ts = 1_700_000_000_000;

  it('SessionStart → session.start', async () => {
    const e = normalizeHook('SessionStart', await fx('session-start.json'), ts);
    expect(e).toEqual({ type: 'session.start', ts, sessionId: 'sess-abc', cwd: '/home/u/proj' });
  });

  it('PreToolUse → tool.pre', async () => {
    const e = normalizeHook('PreToolUse', await fx('pretool-write.json'), ts);
    expect(e).toMatchObject({ type: 'tool.pre', toolName: 'Write', agentId: 'agt-1' });
  });

  it('SubagentStart → agent.start with parent', async () => {
    const e = normalizeHook('SubagentStart', await fx('subagent-start.json'), ts);
    expect(e).toMatchObject({ type: 'agent.start', agentType: 'Explore', parentAgentId: 'agt-1' });
  });

  it('TaskCreated → task.created', async () => {
    const e = normalizeHook('TaskCreated', await fx('task-created.json'), ts);
    expect(e).toMatchObject({ type: 'task.created', taskId: 'task-9', subject: 'refactor login' });
  });

  it('missing session_id returns null', () => {
    expect(normalizeHook('PreToolUse', {}, ts)).toBeNull();
  });
});
```

- [ ] **Step 3: 실행 → 실패 확인**

- [ ] **Step 4: 구현**

`src/server/eventNormalizer.ts`:
```ts
import type { DomainEvent, HookEventName, HookPayload } from '../shared/events.js';

export function normalizeHook(name: HookEventName, p: HookPayload, ts: number): DomainEvent | null {
  const sid = p.session_id;
  if (!sid && name !== 'SessionStart') return null;

  switch (name) {
    case 'SessionStart':
      if (!sid) return null;
      return { type: 'session.start', ts, sessionId: sid, cwd: p.cwd ?? '' };
    case 'SessionEnd':
      return { type: 'session.stop', ts, sessionId: sid! };
    case 'UserPromptSubmit':
      return { type: 'user.prompt', ts, sessionId: sid!, text: String(p.prompt ?? '') };
    case 'SubagentStart':
      if (!p.agent_id || !p.agent_type) return null;
      return {
        type: 'agent.start', ts, sessionId: sid!,
        agentType: p.agent_type, agentId: p.agent_id,
        parentAgentId: p.parent_agent_id, prompt: p.prompt,
      };
    case 'SubagentStop':
      if (!p.agent_id) return null;
      return { type: 'agent.stop', ts, sessionId: sid!, agentId: p.agent_id, success: p.tool_response?.success !== false };
    case 'PreToolUse':
      if (!p.tool_name) return null;
      return { type: 'tool.pre', ts, sessionId: sid!, agentId: p.agent_id ?? 'main', toolName: p.tool_name, input: p.tool_input };
    case 'PostToolUse':
    case 'PostToolUseFailure':
      if (!p.tool_name) return null;
      return {
        type: 'tool.post', ts, sessionId: sid!, agentId: p.agent_id ?? 'main',
        toolName: p.tool_name, success: name === 'PostToolUse',
      };
    case 'TaskCreated':
      if (!p.task_id) return null;
      return { type: 'task.created', ts, sessionId: sid!, taskId: p.task_id, subject: p.subject ?? '' };
    case 'TaskCompleted':
      if (!p.task_id) return null;
      return { type: 'task.completed', ts, sessionId: sid!, taskId: p.task_id };
    default:
      return null;
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

- [ ] **Step 6: 커밋**

```
git add src/server/eventNormalizer.ts test/fixtures/hooks test/unit/eventNormalizer.test.ts
git commit -m "feat(server): normalize hook payloads to DomainEvent (Task 4)"
```

---

### Task 5: Character Router (event → CharacterId)

**Files:**
- Create: `src/server/characterRouter.ts`, `test/unit/characterRouter.test.ts`

**Interfaces:**
- Consumes: `DomainEvent`, `CharacterConfig`, `ActivityRule`, `CharacterId`
- Produces: `createRouter(rules: ActivityRule[]): { route(event: DomainEvent): CharacterId }`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/unit/characterRouter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createRouter } from '../../src/server/characterRouter.js';
import type { ActivityRule } from '../../src/shared/config.js';
import type { DomainEvent } from '../../src/shared/events.js';

const rules: ActivityRule[] = [
  { characterId: 'yu-dev', priority: 100, match: { toolName: ['Write', 'Edit'], filePathPattern: '\\.(ts|py)$' } },
  { characterId: 'seo-designer', priority: 100, match: { toolName: ['Write', 'Edit'], filePathPattern: '\\.css$' } },
  { characterId: 'han-qa', priority: 110, match: { toolName: ['Bash'], bashCommandPattern: 'pytest' } },
];

const router = createRouter(rules);

function ev(overrides: Partial<Extract<DomainEvent, { type: 'tool.pre' }>>): DomainEvent {
  return { type: 'tool.pre', ts: 0, sessionId: 's', agentId: 'a', toolName: 'Write', input: {}, ...overrides };
}

describe('characterRouter', () => {
  it('agent.start(Plan) → park-planner', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'Plan', agentId: 'a' })).toBe('park-planner');
  });

  it('agent.start(Explore) → lee-researcher', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'Explore', agentId: 'a' })).toBe('lee-researcher');
  });

  it('agent.start(general-purpose) → jung-newbie', () => {
    expect(router.route({ type: 'agent.start', ts: 0, sessionId: 's', agentType: 'general-purpose', agentId: 'a' })).toBe('jung-newbie');
  });

  it('Write .ts → yu-dev', () => {
    expect(router.route(ev({ toolName: 'Write', input: { file_path: '/a/b.ts' } }))).toBe('yu-dev');
  });

  it('Write .css → seo-designer', () => {
    expect(router.route(ev({ toolName: 'Write', input: { file_path: '/a/x.css' } }))).toBe('seo-designer');
  });

  it('Bash pytest → han-qa', () => {
    expect(router.route(ev({ toolName: 'Bash', input: { command: 'pytest tests/' } }))).toBe('han-qa');
  });

  it('unknown → kim-team-lead (fallback)', () => {
    expect(router.route(ev({ toolName: 'MysteryTool', input: {} }))).toBe('kim-team-lead');
  });

  it('session.start → kim-team-lead', () => {
    expect(router.route({ type: 'session.start', ts: 0, sessionId: 's', cwd: '/' })).toBe('kim-team-lead');
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

- [ ] **Step 3: 구현**

`src/server/characterRouter.ts`:
```ts
import type { CharacterId } from '../shared/character.js';
import type { ActivityRule } from '../shared/config.js';
import type { DomainEvent } from '../shared/events.js';

const AGENT_TYPE_MAP: Record<string, CharacterId> = {
  Plan: 'park-planner',
  Explore: 'lee-researcher',
  'general-purpose': 'jung-newbie',
  'claude-code-guide': 'jo-senior',
  'statusline-setup': 'choi-office',
};

const FALLBACK: CharacterId = 'kim-team-lead';

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
```

- [ ] **Step 4: 테스트 통과 확인**

- [ ] **Step 5: 커밋**

```
git add src/server/characterRouter.ts test/unit/characterRouter.test.ts
git commit -m "feat(server): route events to characters via activity rules (Task 5)"
```

---

### Task 6: Dialogue Pool (템플릿 대사 렌더러)

**Files:**
- Create: `config/dialogue/kim-team-lead.json`, `config/dialogue/lee-researcher.json`, `config/dialogue/yu-dev.json`, `config/dialogue/han-qa.json` (v1 minimum; 다른 5명은 각 3개씩만), `src/server/dialogue/pool.ts`, `test/unit/dialoguePool.test.ts`

**Interfaces:**
- Consumes: `DialogueEntry`, `DomainEvent`, `CharacterId`
- Produces:
  - `loadDialogues(dir: string): Promise<Map<CharacterId, DialogueEntry[]>>`
  - `pickLine(pool: DialogueEntry[], ctx: DialogueContext): string | null`
  - `interface DialogueContext { event: DomainEvent; queueDepth: number; recentError: boolean; slots: Record<string, string | number> }`

- [ ] **Step 1: dialogue JSON 파일 (예시 4개, 나머지는 빈 배열로 시작)**

`config/dialogue/kim-team-lead.json`:
```json
[
  { "characterId": "kim-team-lead", "trigger": { "eventType": "session.start" }, "templates": ["오늘도 시작해볼까요...", "자, 뭘 해달라시는지…"] },
  { "characterId": "kim-team-lead", "trigger": { "eventType": "session.stop" }, "templates": ["수고들 하셨습니다. 마감!"] },
  { "characterId": "kim-team-lead", "trigger": { "eventType": "user.prompt" }, "templates": ["음, {promptFirst20}... 이거 어떻게 나눌까"] },
  { "characterId": "kim-team-lead", "trigger": { "eventType": "tool.post", "conditions": { "errorRecent": true } }, "templates": ["어... 이거 왜 안 되지"] },
  { "characterId": "kim-team-lead", "trigger": { "eventType": "agent.start" }, "templates": ["{agentType}, {promptFirst25} 좀 부탁해요"] }
]
```

`config/dialogue/lee-researcher.json`:
```json
[
  { "characterId": "lee-researcher", "trigger": { "eventType": "agent.start" }, "templates": ["어디 있더라...", "찾아볼게요~"] },
  { "characterId": "lee-researcher", "trigger": { "eventType": "agent.stop" }, "templates": ["찾았다!", "여깄네요"] },
  { "characterId": "lee-researcher", "trigger": { "eventType": "tool.pre", "toolName": "Grep" }, "templates": ["이건 {pattern} 로 훑으면..."] },
  { "characterId": "lee-researcher", "trigger": { "eventType": "agent.start", "conditions": { "queueDepthGte": 2 } }, "templates": ["제가 지금 {queueDepth}개 물려있어요!"] },
  { "characterId": "lee-researcher", "trigger": { "eventType": "tool.post" }, "templates": ["대충 봤어요"] }
]
```

`config/dialogue/yu-dev.json`:
```json
[
  { "characterId": "yu-dev", "trigger": { "eventType": "tool.pre", "toolName": "Write" }, "templates": ["{fileName} 손볼게요"] },
  { "characterId": "yu-dev", "trigger": { "eventType": "tool.pre", "toolName": "Edit" }, "templates": ["{fileName} 수정 중"] },
  { "characterId": "yu-dev", "trigger": { "eventType": "tool.post", "conditions": { "errorRecent": true } }, "templates": ["흠, 컴파일러가 뭐라는데"] },
  { "characterId": "yu-dev", "trigger": { "eventType": "tool.post" }, "templates": ["됐네", "OK"] },
  { "characterId": "yu-dev", "trigger": { "eventType": "agent.start" }, "templates": ["코딩 시작"] }
]
```

`config/dialogue/han-qa.json`:
```json
[
  { "characterId": "han-qa", "trigger": { "eventType": "tool.pre", "toolName": "Bash" }, "templates": ["테스트 돌립니다~"] },
  { "characterId": "han-qa", "trigger": { "eventType": "tool.post", "conditions": { "errorRecent": true } }, "templates": ["어? 여기 하나 깨졌는데요"] },
  { "characterId": "han-qa", "trigger": { "eventType": "tool.post" }, "templates": ["통과!", "이번엔 깨끗하네요"] },
  { "characterId": "han-qa", "trigger": { "eventType": "agent.start" }, "templates": ["체크리스트 준비"] },
  { "characterId": "han-qa", "trigger": { "eventType": "agent.stop" }, "templates": ["검수 완료"] }
]
```

나머지 5개는 각각 최소 3개 항목의 stub 파일로 생성:

`config/dialogue/park-planner.json`:
```json
[
  { "characterId": "park-planner", "trigger": { "eventType": "agent.start" }, "templates": ["잠깐, 그림부터 그립시다"] },
  { "characterId": "park-planner", "trigger": { "eventType": "agent.stop" }, "templates": ["자, 이 흐름으로 갑시다"] },
  { "characterId": "park-planner", "trigger": { "eventType": "tool.pre" }, "templates": ["구조부터 확인"] }
]
```

`config/dialogue/seo-designer.json`:
```json
[
  { "characterId": "seo-designer", "trigger": { "eventType": "tool.pre", "toolName": "Edit" }, "templates": ["여백 살짝 조정할게요"] },
  { "characterId": "seo-designer", "trigger": { "eventType": "tool.pre", "toolName": "WebFetch" }, "templates": ["시안 확인하고 올게요"] },
  { "characterId": "seo-designer", "trigger": { "eventType": "tool.post" }, "templates": ["색감 괜찮은데요"] }
]
```

`config/dialogue/jo-senior.json`:
```json
[
  { "characterId": "jo-senior", "trigger": { "eventType": "agent.start" }, "templates": ["그거? 매뉴얼에 있어. 잠깐"] },
  { "characterId": "jo-senior", "trigger": { "eventType": "agent.stop" }, "templates": ["이렇게 하면 돼"] },
  { "characterId": "jo-senior", "trigger": { "eventType": "tool.post" }, "templates": ["공식 문서 확인 완료"] }
]
```

`config/dialogue/jung-newbie.json`:
```json
[
  { "characterId": "jung-newbie", "trigger": { "eventType": "agent.start" }, "templates": ["넵! 저 다녀올게요!", "어디부터 볼까요?"] },
  { "characterId": "jung-newbie", "trigger": { "eventType": "agent.stop" }, "templates": ["끝났습니다!"] },
  { "characterId": "jung-newbie", "trigger": { "eventType": "tool.pre" }, "templates": ["넵넵!"] }
]
```

`config/dialogue/choi-office.json`:
```json
[
  { "characterId": "choi-office", "trigger": { "eventType": "tool.pre" }, "templates": ["설정 정리 좀 할게요"] },
  { "characterId": "choi-office", "trigger": { "eventType": "tool.post" }, "templates": ["파일 정돈 완료"] },
  { "characterId": "choi-office", "trigger": { "eventType": "agent.start" }, "templates": ["뭘 정리해드릴까요?"] }
]
```

- [ ] **Step 2: 실패 테스트 작성**

`test/unit/dialoguePool.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadDialogues, pickLine } from '../../src/server/dialogue/pool.js';

const DIR = path.resolve(process.cwd(), 'config/dialogue');

describe('dialoguePool', () => {
  it('loads 9 character pools', async () => {
    const pools = await loadDialogues(DIR);
    expect(pools.size).toBe(9);
  });

  it('picks a session.start line for kim-team-lead', async () => {
    const pools = await loadDialogues(DIR);
    const line = pickLine(pools.get('kim-team-lead')!, {
      event: { type: 'session.start', ts: 0, sessionId: 's', cwd: '/' },
      queueDepth: 0, recentError: false, slots: {},
    });
    expect(line).toMatch(/오늘도|자,/);
  });

  it('respects queueDepthGte condition', async () => {
    const pools = await loadDialogues(DIR);
    const line = pickLine(pools.get('lee-researcher')!, {
      event: { type: 'agent.start', ts: 0, sessionId: 's', agentType: 'Explore', agentId: 'a' },
      queueDepth: 3, recentError: false,
      slots: { queueDepth: 3 },
    });
    expect(line).toMatch(/3개 물려있어요/);
  });

  it('fills template slots from context', async () => {
    const pools = await loadDialogues(DIR);
    const line = pickLine(pools.get('yu-dev')!, {
      event: { type: 'tool.pre', ts: 0, sessionId: 's', agentId: 'a', toolName: 'Write', input: {} },
      queueDepth: 0, recentError: false,
      slots: { fileName: 'app.ts' },
    });
    expect(line).toContain('app.ts');
  });

  it('returns null when no candidate matches', async () => {
    const pools = await loadDialogues(DIR);
    const line = pickLine(pools.get('kim-team-lead')!, {
      event: { type: 'task.created', ts: 0, sessionId: 's', taskId: 't', subject: '' },
      queueDepth: 0, recentError: false, slots: {},
    });
    expect(line).toBeNull();
  });
});
```

- [ ] **Step 3: 실행 → 실패 확인**

- [ ] **Step 4: 구현**

`src/server/dialogue/pool.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ALL_CHARACTER_IDS, type CharacterId } from '../../shared/character.js';
import type { DialogueEntry } from '../../shared/dialogue.js';
import type { DomainEvent } from '../../shared/events.js';

export interface DialogueContext {
  event: DomainEvent;
  queueDepth: number;
  recentError: boolean;
  slots: Record<string, string | number>;
}

export async function loadDialogues(dir: string): Promise<Map<CharacterId, DialogueEntry[]>> {
  const files = await readdir(dir);
  const map = new Map<CharacterId, DialogueEntry[]>();
  for (const id of ALL_CHARACTER_IDS) map.set(id, []);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const id = f.replace(/\.json$/, '') as CharacterId;
    if (!ALL_CHARACTER_IDS.includes(id)) continue;
    const raw = await readFile(path.join(dir, f), 'utf8');
    map.set(id, JSON.parse(raw) as DialogueEntry[]);
  }
  return map;
}

function matches(entry: DialogueEntry, ctx: DialogueContext): boolean {
  const t = entry.trigger;
  if (t.eventType !== ctx.event.type) return false;
  if (t.toolName) {
    const tn = (ctx.event as Extract<DomainEvent, { toolName: string }>).toolName;
    if (tn !== t.toolName) return false;
  }
  if (t.conditions?.queueDepthGte !== undefined && ctx.queueDepth < t.conditions.queueDepthGte) return false;
  if (t.conditions?.errorRecent && !ctx.recentError) return false;
  return true;
}

function renderTemplate(tpl: string, slots: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key: string) => (key in slots ? String(slots[key]) : '…'));
}

export function pickLine(pool: DialogueEntry[], ctx: DialogueContext): string | null {
  const candidates = pool.filter((e) => matches(e, ctx));
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((s, c) => s + (c.weight ?? 1), 0);
  let r = Math.random() * totalWeight;
  let chosen = candidates[0];
  for (const c of candidates) {
    r -= c.weight ?? 1;
    if (r <= 0) { chosen = c; break; }
  }
  const tpl = chosen.templates[Math.floor(Math.random() * chosen.templates.length)];
  return renderTemplate(tpl, ctx.slots);
}
```

- [ ] **Step 5: 테스트 통과 확인**

- [ ] **Step 6: 커밋**

```
git add config/dialogue src/server/dialogue test/unit/dialoguePool.test.ts
git commit -m "feat(server): dialogue pool with template slot rendering (Task 6)"
```

---

### Task 7: State Store (캐릭터 상태 & 큐 전이)

**Files:**
- Create: `src/server/stateStore.ts`, `test/unit/stateStore.test.ts`

**Interfaces:**
- Consumes: `CharacterState`, `Ticket`, `DomainEvent`, `CharacterId`
- Produces:
  - `createStateStore(characterIds: CharacterId[]): StateStore`
  - `interface StateStore { getAll(): CharacterState[]; get(id): CharacterState; applyEvent(id, event, activityLabel?): CharacterState; setLine(id, text, ttlMs): CharacterState }`
  - `emits characterUpdated event via EventEmitter (state store extends EventEmitter)`

- [ ] **Step 1: 실패 테스트**

`test/unit/stateStore.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createStateStore } from '../../src/server/stateStore.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';

const ids = [...ALL_CHARACTER_IDS];

describe('stateStore', () => {
  it('initializes all characters as off with empty queue', () => {
    const s = createStateStore(ids);
    for (const id of ids) {
      expect(s.get(id).status).toBe('off');
      expect(s.get(id).queue).toEqual([]);
    }
  });

  it('agent.start → status=working, adds active ticket', () => {
    const s = createStateStore(ids);
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 1, sessionId: 's', agentType: 'Explore', agentId: 'a1' }, 'find kafka');
    const st = s.get('lee-researcher');
    expect(st.status).toBe('working');
    expect(st.queue).toHaveLength(1);
    expect(st.queue[0]).toMatchObject({ ticketId: 'a1', status: 'active' });
  });

  it('second agent.start on same char → queued ticket', () => {
    const s = createStateStore(ids);
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 1, sessionId: 's', agentType: 'Explore', agentId: 'a1' }, 'x');
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 2, sessionId: 's', agentType: 'Explore', agentId: 'a2' }, 'y');
    expect(s.get('lee-researcher').queue.map((t) => t.status)).toEqual(['active', 'queued']);
  });

  it('agent.stop removes active ticket and promotes next', () => {
    const s = createStateStore(ids);
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 1, sessionId: 's', agentType: 'Explore', agentId: 'a1' });
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 2, sessionId: 's', agentType: 'Explore', agentId: 'a2' });
    s.applyEvent('lee-researcher', { type: 'agent.stop', ts: 3, sessionId: 's', agentId: 'a1', success: true });
    const st = s.get('lee-researcher');
    expect(st.queue).toHaveLength(1);
    expect(st.queue[0]).toMatchObject({ ticketId: 'a2', status: 'active' });
    expect(st.status).toBe('working');
  });

  it('empty queue after final stop → status=done, stats increment', () => {
    const s = createStateStore(ids);
    s.applyEvent('lee-researcher', { type: 'agent.start', ts: 1, sessionId: 's', agentType: 'Explore', agentId: 'a1' });
    s.applyEvent('lee-researcher', { type: 'agent.stop', ts: 2, sessionId: 's', agentId: 'a1', success: true });
    const st = s.get('lee-researcher');
    expect(st.status).toBe('done');
    expect(st.stats.tasksCompleted).toBe(1);
  });

  it('tool.post failure increments errorsCount', () => {
    const s = createStateStore(ids);
    s.applyEvent('yu-dev', { type: 'tool.post', ts: 1, sessionId: 's', agentId: 'a', toolName: 'Write', success: false });
    expect(s.get('yu-dev').stats.errorsCount).toBe(1);
    expect(s.get('yu-dev').status).toBe('error');
  });

  it('setLine updates lastLine', () => {
    const s = createStateStore(ids);
    const st = s.setLine('kim-team-lead', '안녕', 3000);
    expect(st.lastLine?.text).toBe('안녕');
    expect(st.lastLine?.ttlMs).toBe(3000);
  });
});
```

- [ ] **Step 2: 실행 → 실패**

- [ ] **Step 3: 구현**

`src/server/stateStore.ts`:
```ts
import { EventEmitter } from 'node:events';
import type { CharacterId, CharacterState, Ticket } from '../shared/character.js';
import type { DomainEvent } from '../shared/events.js';

function initial(id: CharacterId): CharacterState {
  return {
    id, status: 'off', queue: [],
    stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 },
  };
}

export interface StateStore extends EventEmitter {
  getAll(): CharacterState[];
  get(id: CharacterId): CharacterState;
  applyEvent(id: CharacterId, event: DomainEvent, activityLabel?: string): CharacterState;
  setLine(id: CharacterId, text: string, ttlMs: number): CharacterState;
}

export function createStateStore(ids: CharacterId[]): StateStore {
  const map = new Map<CharacterId, CharacterState>();
  for (const id of ids) map.set(id, initial(id));
  const bus = new EventEmitter() as StateStore;

  function emit(id: CharacterId): CharacterState {
    const s = map.get(id)!;
    bus.emit('characterUpdated', s);
    return s;
  }

  bus.getAll = () => [...map.values()];
  bus.get = (id) => map.get(id)!;

  bus.applyEvent = (id, event, label): CharacterState => {
    const s = map.get(id)!;
    switch (event.type) {
      case 'agent.start': {
        const ticket: Ticket = {
          ticketId: event.agentId, createdAt: event.ts,
          label: label ?? event.agentType,
          status: s.queue.length === 0 ? 'active' : 'queued',
        };
        s.queue.push(ticket);
        if (s.queue[0].status === 'active') s.status = 'working';
        s.currentActivity = ticket.status === 'active'
          ? { toolName: 'Agent', label: ticket.label, startedAt: event.ts } : s.currentActivity;
        break;
      }
      case 'agent.stop': {
        const idx = s.queue.findIndex((t) => t.ticketId === event.agentId);
        if (idx >= 0) s.queue.splice(idx, 1);
        if (event.success) s.stats.tasksCompleted += 1;
        else s.stats.errorsCount += 1;
        if (s.queue.length === 0) {
          s.status = event.success ? 'done' : 'error';
          s.currentActivity = undefined;
        } else {
          s.queue[0].status = 'active';
          s.status = 'working';
          s.currentActivity = { toolName: 'Agent', label: s.queue[0].label, startedAt: Date.now() };
        }
        break;
      }
      case 'tool.pre': {
        s.status = 'working';
        s.stats.toolCallsTotal += 1;
        s.currentActivity = { toolName: event.toolName, label: label ?? event.toolName, startedAt: event.ts };
        break;
      }
      case 'tool.post': {
        if (!event.success) {
          s.stats.errorsCount += 1;
          s.status = 'error';
        } else if (s.queue.length === 0) {
          s.status = 'done';
        } else {
          s.status = 'working';
        }
        s.currentActivity = undefined;
        break;
      }
      case 'session.start':
        if (s.status === 'off') s.status = 'idle';
        break;
      case 'session.stop':
        s.status = 'off';
        s.queue = [];
        s.currentActivity = undefined;
        break;
      default: break;
    }
    return emit(id);
  };

  bus.setLine = (id, text, ttlMs): CharacterState => {
    const s = map.get(id)!;
    s.lastLine = { text, ts: Date.now(), ttlMs };
    return emit(id);
  };

  return bus;
}
```

- [ ] **Step 4: 테스트 통과 확인**

- [ ] **Step 5: 커밋**

```
git add src/server/stateStore.ts test/unit/stateStore.test.ts
git commit -m "feat(server): character state store with queue transitions (Task 7)"
```

---

### Task 8: Hook Receiver (POST /hook)

**Files:**
- Modify: `src/server/index.ts` (registerRoutes 확장)
- Create: `src/server/hookReceiver.ts`, `test/integration/hookReceiver.test.ts`

**Interfaces:**
- Consumes: `normalizeHook`, `createRouter`, `createStateStore`, `loadDialogues`, `pickLine`
- Produces: `registerHookReceiver(app, deps): void`
  ```ts
  interface Deps {
    router: ReturnType<typeof createRouter>;
    store: StateStore;
    dialogues: Map<CharacterId, DialogueEntry[]>;
  }
  ```

- [ ] **Step 1: 통합 테스트 작성**

`test/integration/hookReceiver.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerHookReceiver } from '../../src/server/hookReceiver.js';
import { createRouter } from '../../src/server/characterRouter.js';
import { createStateStore } from '../../src/server/stateStore.js';
import { loadDialogues } from '../../src/server/dialogue/pool.js';
import { loadConfig } from '../../src/server/config/loadConfig.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';
import path from 'node:path';

const CONFIG = path.resolve(process.cwd(), 'config');

describe('POST /hook', () => {
  let app: ReturnType<typeof Fastify>;

  afterEach(async () => { await app?.close(); });

  it('accepts SessionStart and updates lee state on later SubagentStart', async () => {
    const { rules } = await loadConfig(CONFIG);
    const dialogues = await loadDialogues(path.join(CONFIG, 'dialogue'));
    const router = createRouter(rules);
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    app = Fastify();
    registerHookReceiver(app, { router, store, dialogues });

    await app.inject({
      method: 'POST', url: '/hook', headers: { 'x-cm-event': 'SessionStart' },
      payload: { session_id: 's1', cwd: '/proj' },
    }).then((r) => expect(r.statusCode).toBe(200));

    const r2 = await app.inject({
      method: 'POST', url: '/hook', headers: { 'x-cm-event': 'SubagentStart' },
      payload: { session_id: 's1', agent_id: 'a1', agent_type: 'Explore' },
    });
    expect(r2.statusCode).toBe(200);
    expect(store.get('lee-researcher').status).toBe('working');
    expect(store.get('lee-researcher').queue).toHaveLength(1);
  });

  it('malformed payload returns 200 (never blocks Claude Code)', async () => {
    const { rules } = await loadConfig(CONFIG);
    const dialogues = await loadDialogues(path.join(CONFIG, 'dialogue'));
    app = Fastify();
    registerHookReceiver(app, {
      router: createRouter(rules),
      store: createStateStore([...ALL_CHARACTER_IDS]),
      dialogues,
    });
    const r = await app.inject({
      method: 'POST', url: '/hook', headers: { 'x-cm-event': 'PreToolUse' },
      payload: 'not-json', // invalid
    });
    expect(r.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: 실행 → 실패**

- [ ] **Step 3: 구현**

`src/server/hookReceiver.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { normalizeHook } from './eventNormalizer.js';
import type { HookEventName, HookPayload } from '../shared/events.js';
import type { createRouter } from './characterRouter.js';
import type { StateStore } from './stateStore.js';
import { pickLine, type DialogueContext } from './dialogue/pool.js';
import type { CharacterId } from '../shared/character.js';
import type { DialogueEntry } from '../shared/dialogue.js';
import type { DomainEvent } from '../shared/events.js';

interface Deps {
  router: ReturnType<typeof createRouter>;
  store: StateStore;
  dialogues: Map<CharacterId, DialogueEntry[]>;
}

function slotsFor(event: DomainEvent, charState: { queue: unknown[]; stats: { errorsCount: number } }): Record<string, string | number> {
  const slots: Record<string, string | number> = {};
  slots.queueDepth = charState.queue.length;
  if (event.type === 'tool.pre') {
    const io = (event.input ?? {}) as Record<string, unknown>;
    if (typeof io.file_path === 'string') slots.fileName = io.file_path.split('/').pop() ?? '';
    if (typeof io.command === 'string') slots.command = io.command.slice(0, 40);
    if (typeof io.pattern === 'string') slots.pattern = io.pattern;
  }
  if (event.type === 'user.prompt') slots.promptFirst20 = event.text.slice(0, 20);
  if (event.type === 'agent.start') {
    slots.agentType = event.agentType;
    slots.promptFirst25 = (event.prompt ?? '').slice(0, 25);
  }
  return slots;
}

export function registerHookReceiver(app: FastifyInstance, deps: Deps): void {
  app.post('/hook', async (req, reply) => {
    const eventName = String(req.headers['x-cm-event'] ?? '') as HookEventName;
    let payload: HookPayload;
    try {
      payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as HookPayload;
    } catch {
      reply.code(200); return { ok: false, reason: 'invalid-json' };
    }
    const evt = normalizeHook(eventName, payload ?? {}, Date.now());
    if (!evt) { reply.code(200); return { ok: false, reason: 'unnormalizable' }; }
    const charId = deps.router.route(evt);
    const charBefore = deps.store.get(charId);
    const slots = slotsFor(evt, charBefore);
    const recentError = charBefore.stats.errorsCount > 0 && charBefore.status === 'error';
    const line = pickLine(deps.dialogues.get(charId) ?? [], {
      event: evt, queueDepth: charBefore.queue.length, recentError, slots,
    } as DialogueContext);
    deps.store.applyEvent(charId, evt);
    if (line) deps.store.setLine(charId, line, 4000);
    reply.code(200);
    return { ok: true };
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

- [ ] **Step 5: 커밋**

```
git add src/server/hookReceiver.ts test/integration/hookReceiver.test.ts
git commit -m "feat(server): POST /hook accepts payloads and updates state (Task 8)"
```

---

### Task 9: WebSocket Hub (실시간 브로드캐스트)

**Files:**
- Create: `src/server/wsHub.ts`, `test/integration/wsHub.test.ts`

**Interfaces:**
- Consumes: `StateStore` (emits `characterUpdated`), `WsMessage` from shared
- Produces: `registerWsHub(app, deps: { store: StateStore }): void`
  - GET/WS `/live` sends snapshot on connect, `characterUpdated` on each store event

- [ ] **Step 1: 실패 통합 테스트**

`test/integration/wsHub.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { registerWsHub } from '../../src/server/wsHub.js';
import { createStateStore } from '../../src/server/stateStore.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';

describe('WS /live', () => {
  let app: ReturnType<typeof Fastify>;
  afterEach(async () => { await app?.close(); });

  it('sends snapshot on connect and characterUpdated on state change', async () => {
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    app = Fastify();
    await app.register(websocket);
    registerWsHub(app, { store });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = String(addr).replace(/^http/, 'ws') + '/live';
    const ws = new WebSocket(url);

    const messages: unknown[] = [];
    ws.on('message', (b) => messages.push(JSON.parse(b.toString())));
    await new Promise<void>((r) => ws.on('open', () => r()));

    // Wait for snapshot
    await new Promise((r) => setTimeout(r, 50));
    expect(messages[0]).toMatchObject({ kind: 'snapshot' });

    // Trigger update
    store.applyEvent('yu-dev', { type: 'tool.pre', ts: 1, sessionId: 's', agentId: 'a', toolName: 'Write', input: {} });
    await new Promise((r) => setTimeout(r, 50));
    expect(messages.some((m) => (m as { kind: string }).kind === 'characterUpdated')).toBe(true);

    ws.close();
  });
});
```

- [ ] **Step 2: 실행 → 실패 (@fastify/websocket, ws 설치 필요)**

```
npm install --save-dev ws @types/ws
```

- [ ] **Step 3: 구현**

`src/server/wsHub.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { StateStore } from './stateStore.js';
import type { CharacterState } from '../shared/character.js';
import type { WsMessage } from '../shared/ws.js';

interface Deps { store: StateStore }

export function registerWsHub(app: FastifyInstance, deps: Deps): void {
  const clients = new Set<{ send: (data: string) => void; close: () => void }>();

  deps.store.on('characterUpdated', (state: CharacterState) => {
    const msg: WsMessage = { kind: 'characterUpdated', state };
    const data = JSON.stringify(msg);
    for (const c of clients) c.send(data);
  });

  app.get('/live', { websocket: true }, (socket) => {
    const wrapper = {
      send: (d: string) => socket.send(d),
      close: () => socket.close(),
    };
    clients.add(wrapper);
    const snapshot: WsMessage = { kind: 'snapshot', characters: deps.store.getAll(), sessions: [] };
    socket.send(JSON.stringify(snapshot));
    socket.on('close', () => clients.delete(wrapper));
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

- [ ] **Step 5: 커밋**

```
git add src/server/wsHub.ts test/integration/wsHub.test.ts package.json package-lock.json
git commit -m "feat(server): WebSocket /live broadcasts state updates (Task 9)"
```

---

### Task 10: Bootstrap 통합 (index.ts에 모두 연결)

**Files:**
- Modify: `src/server/index.ts`
- Create: `test/integration/bootstrap.test.ts`

**Interfaces:**
- Produces: `startServer()`가 모든 라우트·WS·store를 자동 초기화

- [ ] **Step 1: 실패 테스트**

`test/integration/bootstrap.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { startServer } from '../../src/server/index.js';

describe('bootstrap', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => { await close?.(); });

  it('serves /health and accepts a hook end-to-end', async () => {
    const app = await startServer({ port: 0 });
    close = () => app.close();
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    const hook = await app.inject({
      method: 'POST', url: '/hook', headers: { 'x-cm-event': 'SessionStart' },
      payload: { session_id: 'x', cwd: '/x' },
    });
    expect(hook.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: 실행 → 실패 (hook 라우트 미등록)**

- [ ] **Step 3: `src/server/index.ts` 확장**

기존 코드를 다음으로 교체:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import pino from 'pino';
import path from 'node:path';
import { loadConfig } from './config/loadConfig.js';
import { loadDialogues } from './dialogue/pool.js';
import { createRouter } from './characterRouter.js';
import { createStateStore } from './stateStore.js';
import { registerHookReceiver } from './hookReceiver.js';
import { registerWsHub } from './wsHub.js';
import { ALL_CHARACTER_IDS } from '../shared/character.js';

const logger = pino({
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  level: process.env.LOG_LEVEL ?? 'info',
});

export interface ServerOpts { host?: string; port?: number; configDir?: string }

export async function startServer(opts: ServerOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger });
  await app.register(websocket);

  const configDir = opts.configDir ?? path.resolve(process.cwd(), 'config');
  const { rules } = await loadConfig(configDir);
  const dialogues = await loadDialogues(path.join(configDir, 'dialogue'));
  const router = createRouter(rules);
  const store = createStateStore([...ALL_CHARACTER_IDS]);

  app.get('/health', async () => ({ ok: true }));
  registerHookReceiver(app, { router, store, dialogues });
  registerWsHub(app, { store });

  const host = opts.host ?? process.env.HOST ?? '0.0.0.0';
  const port = opts.port ?? Number(process.env.PORT ?? 4000);
  if (port > 0) await app.listen({ host, port });
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer().catch((err) => { logger.error(err); process.exit(1); });
}
```

- [ ] **Step 4: 테스트 통과 확인**

- [ ] **Step 5: 수동 스모크**

```
npm run dev:server &
sleep 2
curl -X POST -H 'X-CM-Event: SessionStart' -H 'Content-Type: application/json' \
     -d '{"session_id":"demo","cwd":"/x"}' http://localhost:4000/hook
kill %1
```
Expected: `{"ok":true}` 응답, 서버 로그에 요청 라인.

- [ ] **Step 6: 커밋**

```
git add src/server/index.ts test/integration/bootstrap.test.ts
git commit -m "feat(server): wire router/store/receiver/wsHub in bootstrap (Task 10)"
```

---

### Task 11: Milestone 1 마감 (README 스모크 가이드)

**Files:**
- Create: `README.md`

- [ ] **Step 1: README 초안 작성**

```markdown
# Claude Monitor

Claude Code 서브에이전트를 "중소기업 외주 개발팀" 캐릭터로 시각화하는 로컬 대시보드.

## 개발 (M1 완료 시점)

- 요구: Node.js 18.17 이상
- 설치: `npm install`
- 서버 실행: `npm run dev:server` → `http://localhost:4000`
- 헬스체크: `curl localhost:4000/health`
- Hook 이벤트 주입:
  ```
  curl -X POST -H 'X-CM-Event: SessionStart' -H 'Content-Type: application/json' \
       -d '{"session_id":"s","cwd":"/tmp"}' localhost:4000/hook
  ```
- WS 관찰: `wscat -c ws://localhost:4000/live`
- 테스트: `npm test`

## Roadmap

- M1: 백엔드 이벤트 파이프라인 ✅
- M2: 그리드 대시보드 MVP
- M3: 아이소메트릭 오피스
- M4: 재생·온보딩·폴리시
```

- [ ] **Step 2: 커밋**

```
git add README.md
git commit -m "docs: add README with M1 smoke instructions (Task 11)"
```

---

## Milestone 2 — Grid Dashboard MVP

**Deliverable:** 브라우저에서 `http://localhost:4000` 접속 → 9인 캐릭터 카드가 렌더링되고, hook을 POST하면 카드가 실시간으로 상태·대사 갱신.

---

### Task 12: Vite + React 스캐폴드 + Fastify 정적 서빙

**Files:**
- Create: `src/web/index.html`, `src/web/main.tsx`, `src/web/App.tsx`, `vite.config.ts`, `tsconfig.web.json`
- Modify: `package.json` (deps, scripts), `src/server/index.ts` (@fastify/static 등록)

**Interfaces:**
- Produces: `dev:web` 스크립트로 Vite dev 서버 (port 5173, `/api` `/live` 프록시), `build:web` → `dist/web`, 서버가 `dist/web`을 `/` 하위에 서빙

- [ ] **Step 1: 의존성 추가 및 설정**

`package.json` 스크립트/의존성 병합:
```json
{
  "scripts": {
    "dev:server": "tsx watch src/server/index.ts",
    "dev:web": "vite",
    "dev": "concurrently -k 'npm:dev:server' 'npm:dev:web'",
    "build:web": "vite build",
    "build:server": "tsc -p tsconfig.server.json",
    "build": "npm run build:web && npm run build:server",
    "start": "node dist/server/server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fastify": "^4.28.1",
    "@fastify/websocket": "^10.0.1",
    "@fastify/static": "^7.0.4",
    "pino": "^9.4.0",
    "pino-pretty": "^11.2.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "tsx": "^4.19.0",
    "vitest": "^2.0.5",
    "@types/node": "^20.14.15",
    "@types/react": "^18.3.4",
    "@types/react-dom": "^18.3.0",
    "@types/ws": "^8.5.12",
    "ws": "^8.18.0",
    "vite": "^5.4.2",
    "@vitejs/plugin-react": "^4.3.1",
    "concurrently": "^8.2.2"
  }
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/hook': 'http://localhost:4000',
      '/setup': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
      '/live': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
```

`tsconfig.web.json`:
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "types": ["vite/client"]
  },
  "include": ["src/web", "src/shared"]
}
```

`src/web/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>Claude Monitor</title>
    <style>body{margin:0;background:#f5f5f0;font-family:sans-serif;}</style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

`src/web/main.tsx`:
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
createRoot(document.getElementById('app')!).render(<React.StrictMode><App /></React.StrictMode>);
```

`src/web/App.tsx`:
```tsx
export function App() {
  return <div style={{ padding: 20 }}><h1>Claude Monitor</h1><p>Loading...</p></div>;
}
```

- [ ] **Step 2: 서버에 정적 서빙 추가**

`src/server/index.ts`에 추가 (startServer 내부, `/health` 등록 전):
```ts
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ...
const webDist = path.resolve(process.cwd(), 'dist/web');
if (existsSync(webDist)) {
  await app.register(staticPlugin, { root: webDist, prefix: '/' });
}
```

- [ ] **Step 3: 빌드 & 수동 확인**

```
npm install
npm run build:web
npm run dev:server &
sleep 2
curl -s localhost:4000/ | grep -q '<div id="app">' && echo OK
kill %1
```

- [ ] **Step 4: 커밋**

```
git add vite.config.ts tsconfig.web.json src/web package.json package-lock.json src/server/index.ts
git commit -m "feat(web): scaffold Vite+React and static-serve build from server (Task 12)"
```

---

### Task 13: Zustand Character Store + WS Client

**Files:**
- Create: `src/web/store/characterStore.ts`, `src/web/ws/eventClient.ts`

**Interfaces:**
- Produces:
  - `useCharacterStore()` — Zustand store with `{ characters: Record<CharacterId, CharacterState>, upsert(state), applySnapshot(list) }`
  - `connectWs(url: string, store): { close(): void }` — auto-reconnect with exponential backoff

- [ ] **Step 1: Store 작성**

`src/web/store/characterStore.ts`:
```ts
import { create } from 'zustand';
import type { CharacterId, CharacterState } from '../../shared/character.js';

interface CharacterStoreState {
  characters: Partial<Record<CharacterId, CharacterState>>;
  connected: boolean;
  applySnapshot(list: CharacterState[]): void;
  upsert(state: CharacterState): void;
  setConnected(v: boolean): void;
}

export const useCharacterStore = create<CharacterStoreState>((set) => ({
  characters: {},
  connected: false,
  applySnapshot: (list) => set({
    characters: Object.fromEntries(list.map((s) => [s.id, s])) as CharacterStoreState['characters'],
  }),
  upsert: (state) => set((cur) => ({ characters: { ...cur.characters, [state.id]: state } })),
  setConnected: (v) => set({ connected: v }),
}));
```

- [ ] **Step 2: WS 클라이언트 작성**

`src/web/ws/eventClient.ts`:
```ts
import type { WsMessage } from '../../shared/ws.js';
import type { useCharacterStore } from '../store/characterStore.js';

type Store = ReturnType<typeof useCharacterStore.getState>;

export function connectWs(url: string, store: () => Store): { close: () => void } {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let closed = false;

  function open() {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => { attempt = 0; store().setConnected(true); };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as WsMessage;
      switch (msg.kind) {
        case 'snapshot': store().applySnapshot(msg.characters); break;
        case 'characterUpdated': store().upsert(msg.state); break;
        default: break;
      }
    };
    ws.onclose = () => {
      store().setConnected(false);
      if (closed) return;
      attempt += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      setTimeout(open, delay);
    };
    ws.onerror = () => ws?.close();
  }

  open();
  return { close: () => { closed = true; ws?.close(); } };
}
```

- [ ] **Step 3: 컴파일 확인**

```
npx tsc -p tsconfig.web.json --noEmit
```

- [ ] **Step 4: 커밋**

```
git add src/web/store src/web/ws
git commit -m "feat(web): zustand character store + WS client with reconnect (Task 13)"
```

---

### Task 14: CharacterCard + GridDashboard 최소 렌더링

**Files:**
- Create: `src/web/components/CharacterCard.tsx`, `src/web/components/StatusBadge.tsx`, `src/web/views/GridDashboard.tsx`
- Modify: `src/web/App.tsx`

**Interfaces:**
- Produces:
  - `<CharacterCard state={CharacterState} config={CharacterConfig} />`
  - `<GridDashboard />` — 스토어 구독하여 9카드 렌더

- [ ] **Step 1: StatusBadge**

`src/web/components/StatusBadge.tsx`:
```tsx
import type { CharacterStatus } from '../../shared/character.js';

const COLORS: Record<CharacterStatus, string> = {
  off: '#9ca3af', idle: '#6b7280', thinking: '#3b82f6',
  working: '#10b981', blocked: '#f59e0b', error: '#ef4444', done: '#22c55e',
};

const LABELS: Record<CharacterStatus, string> = {
  off: '미출근', idle: '대기', thinking: '생각중', working: '작업중',
  blocked: '대기중', error: '오류', done: '완료',
};

export function StatusBadge({ status }: { status: CharacterStatus }) {
  return (
    <span style={{
      background: COLORS[status], color: 'white', padding: '2px 8px',
      borderRadius: 12, fontSize: 12, fontWeight: 600,
    }}>{LABELS[status]}</span>
  );
}
```

- [ ] **Step 2: CharacterCard**

`src/web/components/CharacterCard.tsx`:
```tsx
import type { CharacterState } from '../../shared/character.js';
import { StatusBadge } from './StatusBadge.js';

interface Props { state: CharacterState; name: string; role: string }

export function CharacterCard({ state, name, role }: Props) {
  return (
    <div style={{
      background: 'white', borderRadius: 8, padding: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,.08)', minHeight: 140,
      border: state.status === 'error' ? '2px solid #ef4444' : '1px solid transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{role}</div>
        </div>
        <StatusBadge status={state.status} />
      </div>
      {state.currentActivity && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>
          ▶ {state.currentActivity.toolName}: {state.currentActivity.label}
        </div>
      )}
      {state.lastLine && (
        <div style={{
          marginTop: 8, background: '#f3f4f6', padding: '6px 10px', borderRadius: 6,
          fontSize: 13, fontStyle: 'italic',
        }}>💬 {state.lastLine.text}</div>
      )}
      <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 11, color: '#6b7280' }}>
        <span>🎫 {state.queue.length}</span>
        <span>✓ {state.stats.tasksCompleted}</span>
        <span>✗ {state.stats.errorsCount}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: GridDashboard**

`src/web/views/GridDashboard.tsx`:
```tsx
import { useCharacterStore } from '../store/characterStore.js';
import { CharacterCard } from '../components/CharacterCard.js';
import { ALL_CHARACTER_IDS, type CharacterId, type CharacterState } from '../../shared/character.js';

const META: Record<CharacterId, { name: string; role: string }> = {
  'kim-team-lead':   { name: '김대리', role: '팀장' },
  'park-planner':    { name: '박PL',   role: '기획/아키텍트' },
  'lee-researcher':  { name: '이대리', role: '자료조사원' },
  'yu-dev':          { name: '유대리', role: '개발자' },
  'han-qa':          { name: '한주임', role: 'QA' },
  'seo-designer':    { name: '서주임', role: '디자이너' },
  'jo-senior':       { name: '조과장', role: '시니어/사수' },
  'jung-newbie':     { name: '정막내', role: '신입' },
  'choi-office':     { name: '최주임', role: '총무' },
};

function empty(id: CharacterId): CharacterState {
  return { id, status: 'off', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

export function GridDashboard() {
  const characters = useCharacterStore((s) => s.characters);
  return (
    <div style={{
      display: 'grid', gap: 12,
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', padding: 16,
    }}>
      {ALL_CHARACTER_IDS.map((id) => (
        <CharacterCard key={id} state={characters[id] ?? empty(id)} {...META[id]} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: App.tsx 연결**

`src/web/App.tsx`:
```tsx
import { useEffect } from 'react';
import { GridDashboard } from './views/GridDashboard.js';
import { connectWs } from './ws/eventClient.js';
import { useCharacterStore } from './store/characterStore.js';

export function App() {
  const connected = useCharacterStore((s) => s.connected);
  useEffect(() => {
    const url = `ws://${location.hostname}:${location.port === '5173' ? '4000' : location.port || '4000'}/live`;
    const c = connectWs(url, useCharacterStore.getState);
    return () => c.close();
  }, []);
  return (
    <div>
      <header style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '10px 16px', background: '#1f2937', color: 'white',
      }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Claude Monitor</h2>
        <span style={{
          fontSize: 12, background: connected ? '#10b981' : '#ef4444',
          padding: '2px 8px', borderRadius: 8,
        }}>{connected ? 'connected' : 'disconnected'}</span>
      </header>
      <GridDashboard />
    </div>
  );
}
```

- [ ] **Step 5: 수동 스모크**

```
npm run build:web
npm run dev:server &
sleep 2
# 브라우저에서 localhost:4000 → 9개 카드 회색(off)로 렌더
curl -X POST -H 'X-CM-Event: SubagentStart' -H 'Content-Type: application/json' \
     -d '{"session_id":"s","agent_id":"a1","agent_type":"Explore"}' localhost:4000/hook
# 이대리 카드가 working으로 변하고 대사 뜸
kill %1
```

- [ ] **Step 6: 커밋**

```
git add src/web/components src/web/views/GridDashboard.tsx src/web/App.tsx
git commit -m "feat(web): grid dashboard with 9 character cards (Task 14)"
```

---

### Task 15: SpeechBubble 컴포넌트 + TTL 자동 소멸

**Files:**
- Modify: `src/web/components/CharacterCard.tsx`
- Create: `src/web/components/SpeechBubble.tsx`

**Interfaces:**
- Produces: `<SpeechBubble text ttlMs createdAt />` — TTL 경과 시 페이드아웃

- [ ] **Step 1: SpeechBubble**

`src/web/components/SpeechBubble.tsx`:
```tsx
import { useEffect, useState } from 'react';

interface Props { text: string; ts: number; ttlMs: number }

export function SpeechBubble({ text, ts, ttlMs }: Props) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const remain = Math.max(0, ts + ttlMs - Date.now());
    const t = setTimeout(() => setVisible(false), remain);
    return () => clearTimeout(t);
  }, [text, ts, ttlMs]);
  return (
    <div style={{
      opacity: visible ? 1 : 0, transition: 'opacity 400ms',
      background: '#fff8e1', border: '1px solid #f59e0b40',
      padding: '6px 10px', borderRadius: 8, fontSize: 13,
      marginTop: 8, minHeight: 20,
    }}>💬 {text}</div>
  );
}
```

- [ ] **Step 2: CharacterCard에서 SpeechBubble 사용**

기존 `state.lastLine &&` 블록을 다음으로 교체:
```tsx
{state.lastLine && (
  <SpeechBubble text={state.lastLine.text} ts={state.lastLine.ts} ttlMs={state.lastLine.ttlMs} />
)}
```

`import { SpeechBubble } from './SpeechBubble.js';` 추가.

- [ ] **Step 3: 커밋**

```
git add src/web/components/SpeechBubble.tsx src/web/components/CharacterCard.tsx
git commit -m "feat(web): speech bubble with TTL fade-out (Task 15)"
```

---

### Task 16: TicketQueue 시각화

**Files:**
- Create: `src/web/components/TicketQueue.tsx`
- Modify: `src/web/components/CharacterCard.tsx`

**Interfaces:**
- Produces: `<TicketQueue tickets={Ticket[]} />` — 최대 5개 아이콘, 초과분 "+N"

- [ ] **Step 1: 컴포넌트**

`src/web/components/TicketQueue.tsx`:
```tsx
import type { Ticket } from '../../shared/character.js';

export function TicketQueue({ tickets }: { tickets: Ticket[] }) {
  const shown = tickets.slice(0, 5);
  const extra = tickets.length - shown.length;
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 6 }}>
      {shown.map((t) => (
        <span key={t.ticketId} title={t.label} style={{
          background: t.status === 'active' ? '#10b981' : '#e5e7eb',
          width: 12, height: 16, borderRadius: 2, display: 'inline-block',
        }} />
      ))}
      {extra > 0 && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>+{extra}</span>}
    </div>
  );
}
```

- [ ] **Step 2: CharacterCard에서 사용**

기존 `🎫 {state.queue.length}` 라인을 다음으로 교체:
```tsx
<TicketQueue tickets={state.queue} />
```

`import { TicketQueue } from './TicketQueue.js';` 추가.

- [ ] **Step 3: 커밋**

```
git add src/web/components/TicketQueue.tsx src/web/components/CharacterCard.tsx
git commit -m "feat(web): visualize ticket queue on character card (Task 16)"
```

---

### Task 17: 이벤트 티커 + 재연결 배너

**Files:**
- Modify: `src/web/App.tsx`, `src/web/store/characterStore.ts`, `src/web/ws/eventClient.ts`

**Interfaces:**
- Store에 `events: DomainEvent[]` (최근 30개 링) 추가
- WS `event` 메시지 수신 시 push

- [ ] **Step 1: 스토어 확장**

`src/web/store/characterStore.ts`에 추가:
```ts
import type { DomainEvent } from '../../shared/events.js';

interface CharacterStoreState {
  characters: Partial<Record<CharacterId, CharacterState>>;
  connected: boolean;
  events: DomainEvent[];
  applySnapshot(list: CharacterState[]): void;
  upsert(state: CharacterState): void;
  setConnected(v: boolean): void;
  pushEvent(e: DomainEvent): void;
}

// state 초기값에 events: []
// 액션 추가:
// pushEvent: (e) => set((cur) => ({ events: [...cur.events.slice(-29), e] })),
```

`src/web/ws/eventClient.ts`의 `onmessage`에서 `case 'event': store().pushEvent(msg.event); break;` 추가.

- [ ] **Step 2: 티커 UI + 배너**

`src/web/App.tsx`의 return에서 GridDashboard 아래에 추가:
```tsx
<Ticker />
```

`src/web/components/EventTicker.tsx` (신규):
```tsx
import { useCharacterStore } from '../store/characterStore.js';

export function EventTicker() {
  const events = useCharacterStore((s) => s.events);
  const last = events[events.length - 1];
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, background: '#111827',
      color: '#f9fafb', fontSize: 12, padding: '6px 14px', fontFamily: 'monospace',
    }}>
      {last ? `[${new Date(last.ts).toLocaleTimeString('ko-KR')}] ${last.type}` : '이벤트 대기중...'}
    </div>
  );
}
```

`App.tsx`에 `import { EventTicker } from './components/EventTicker.js';` + `<EventTicker />` 추가. 상단 헤더의 disconnected 배너는 이미 존재.

- [ ] **Step 3: 서버가 `event` 메시지도 브로드캐스트하도록 확장**

`src/server/wsHub.ts`에 추가 — 훅 수신 후 `deps.store.on('event', …)`? 아니면 `hookReceiver`가 직접 브로드캐스트?
간단한 방법: `wsHub`에 `broadcast(msg: WsMessage)` export하고 `hookReceiver`에서 호출.

`src/server/wsHub.ts` 수정:
```ts
export interface WsBroadcaster { broadcast(msg: WsMessage): void }

export function registerWsHub(app: FastifyInstance, deps: { store: StateStore }): WsBroadcaster {
  const clients = new Set<{ send: (data: string) => void }>();
  deps.store.on('characterUpdated', (state: CharacterState) => {
    const data = JSON.stringify({ kind: 'characterUpdated', state } satisfies WsMessage);
    for (const c of clients) c.send(data);
  });
  app.get('/live', { websocket: true }, (socket) => {
    const w = { send: (d: string) => socket.send(d) };
    clients.add(w);
    socket.send(JSON.stringify({ kind: 'snapshot', characters: deps.store.getAll(), sessions: [] } satisfies WsMessage));
    socket.on('close', () => clients.delete(w));
  });
  return {
    broadcast(msg: WsMessage) {
      const data = JSON.stringify(msg);
      for (const c of clients) c.send(data);
    },
  };
}
```

`src/server/index.ts`:
```ts
const ws = registerWsHub(app, { store });
registerHookReceiver(app, { router, store, dialogues, ws });
```

`src/server/hookReceiver.ts` Deps + 로직에 `ws?.broadcast({ kind: 'event', event: evt })` 추가 (normalizeHook 성공 후).

- [ ] **Step 4: 커밋**

```
git add src/web/store src/web/ws src/web/App.tsx src/web/components/EventTicker.tsx src/server/wsHub.ts src/server/hookReceiver.ts src/server/index.ts
git commit -m "feat: event ticker with WS event pass-through (Task 17)"
```

---

### Task 18: M2 마감 (README + 수동 검증 체크)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README에 M2 스모크 절차 추가**

```markdown
## M2 스모크

1. `npm run build:web && npm run dev:server`
2. 브라우저 `http://localhost:4000` → 9개 카드 회색(off)로 표시
3. 아래 curl 순차 실행:
   ```
   curl -X POST -H 'X-CM-Event: SessionStart' -H 'Content-Type: application/json' \
        -d '{"session_id":"s","cwd":"/x"}' localhost:4000/hook
   curl -X POST -H 'X-CM-Event: SubagentStart' -H 'Content-Type: application/json' \
        -d '{"session_id":"s","agent_id":"a1","agent_type":"Explore","prompt":"kafka"}' localhost:4000/hook
   curl -X POST -H 'X-CM-Event: PreToolUse' -H 'Content-Type: application/json' \
        -d '{"session_id":"s","agent_id":"a1","tool_name":"Grep","tool_input":{"pattern":"kafka"}}' localhost:4000/hook
   curl -X POST -H 'X-CM-Event: PostToolUse' -H 'Content-Type: application/json' \
        -d '{"session_id":"s","agent_id":"a1","tool_name":"Grep","tool_response":{"success":true}}' localhost:4000/hook
   ```
4. 확인: 이대리 카드 상태 idle → working → done, 대사 표시, 티켓 큐 아이콘 표시, 티커에 이벤트 라인.
```

- [ ] **Step 2: 커밋**

```
git add README.md
git commit -m "docs: add M2 smoke procedure (Task 18)"
```

---

## Milestone 3 — Isometric Office (PixiJS)

**Deliverable:** 우상단 토글로 Grid ↔ Office 전환, 오피스 뷰에서 아이소메트릭 사무실 배경에 9인 캐릭터가 자리에 배치되고 상태별 스프라이트/애니메이션 표시.

---

### Task 19: PixiJS 통합 + 오피스 캔버스 스켈레톤

**Files:**
- Modify: `package.json` (pixi.js 추가), `src/web/App.tsx`
- Create: `src/web/views/IsometricOffice.tsx`, `src/web/pixi/OfficeScene.ts`, `src/web/views/ViewSwitcher.tsx`

**Interfaces:**
- Produces:
  - `class OfficeScene { constructor(canvas: HTMLCanvasElement); destroy(): void; setCharacters(states: CharacterState[], configs: CharacterConfig[]): void }`
  - `<IsometricOffice />` — mount/unmount OfficeScene lifecycle
  - `<ViewSwitcher active view onChange />`

- [ ] **Step 1: 의존성 추가**

`package.json` deps에 `"pixi.js": "^8.3.4"` 추가, `npm install`.

- [ ] **Step 2: OfficeScene 스켈레톤**

`src/web/pixi/OfficeScene.ts`:
```ts
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

export class OfficeScene {
  private app: Application;
  private root = new Container();
  private ready = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
    void this.init();
  }

  private async init() {
    await this.app.init({ canvas: this.canvas, width: 1024, height: 640, background: '#e5e7d5' });
    this.app.stage.addChild(this.root);
    this.drawBackground();
    this.ready = true;
  }

  private drawBackground() {
    const g = new Graphics();
    g.rect(0, 0, 1024, 640).fill('#f3efdc');
    // 방 구획선 (임시 사각형)
    const rooms = [
      { x: 40, y: 60,  w: 320, h: 200, label: '회의실' },
      { x: 400, y: 60,  w: 300, h: 200, label: '개발실' },
      { x: 740, y: 60,  w: 240, h: 200, label: '서버실' },
      { x: 40, y: 320, w: 320, h: 280, label: '서고' },
      { x: 400, y: 320, w: 300, h: 280, label: '자리' },
      { x: 740, y: 320, w: 240, h: 200, label: '검수/디자인' },
      { x: 740, y: 540, w: 240, h: 60,  label: '탕비실/로비' },
    ];
    for (const r of rooms) {
      g.rect(r.x, r.y, r.w, r.h).stroke({ color: '#9ca3af', width: 2 });
      const t = new Text({ text: r.label, style: { fontSize: 12, fill: '#6b7280' } });
      t.x = r.x + 8; t.y = r.y + 6;
      this.root.addChild(t);
    }
    this.root.addChild(g);
  }

  setCharacters(states: CharacterState[], configs: CharacterConfig[]): void {
    if (!this.ready) return;
    // v19 최소 구현: 좌표에 원 + 이름 텍스트만 배치 (스프라이트는 Task 21)
    this.root.removeChildren();
    this.drawBackground();
    const cfgMap = new Map(configs.map((c) => [c.id, c]));
    for (const s of states) {
      const cfg = cfgMap.get(s.id);
      if (!cfg) continue;
      const marker = new Graphics();
      const color = s.status === 'off' ? '#9ca3af' :
                    s.status === 'working' ? '#10b981' :
                    s.status === 'error' ? '#ef4444' : '#3b82f6';
      marker.circle(cfg.officeSeat.x, cfg.officeSeat.y, 12).fill(color);
      this.root.addChild(marker);
      const label = new Text({ text: cfg.name, style: { fontSize: 11, fill: '#111827' } });
      label.x = cfg.officeSeat.x - 15; label.y = cfg.officeSeat.y + 16;
      this.root.addChild(label);
    }
  }

  destroy() { this.app.destroy(true); }
}
```

- [ ] **Step 3: IsometricOffice React wrapper**

`src/web/views/IsometricOffice.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { OfficeScene } from '../pixi/OfficeScene.js';
import { useCharacterStore } from '../store/characterStore.js';
import { ALL_CHARACTER_IDS, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

function empty(id: CharacterConfig['id']): CharacterState {
  return { id, status: 'off', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

export function IsometricOffice({ configs }: { configs: CharacterConfig[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const characters = useCharacterStore((s) => s.characters);

  useEffect(() => {
    if (!canvasRef.current) return;
    sceneRef.current = new OfficeScene(canvasRef.current);
    return () => { sceneRef.current?.destroy(); sceneRef.current = null; };
  }, []);

  useEffect(() => {
    const states = ALL_CHARACTER_IDS.map((id) => characters[id] ?? empty(id));
    sceneRef.current?.setCharacters(states, configs);
  }, [characters, configs]);

  return <canvas ref={canvasRef} style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />;
}
```

- [ ] **Step 4: ViewSwitcher + App 연결**

`src/web/views/ViewSwitcher.tsx`:
```tsx
export type ViewKind = 'grid' | 'office';

export function ViewSwitcher({ active, onChange }: { active: ViewKind; onChange(v: ViewKind): void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['grid', 'office'] as ViewKind[]).map((v) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '4px 10px', border: 'none', borderRadius: 4, fontSize: 12,
          background: active === v ? '#10b981' : '#374151', color: 'white', cursor: 'pointer',
        }}>{v === 'grid' ? 'Grid' : 'Office'}</button>
      ))}
    </div>
  );
}
```

`src/web/App.tsx` 갱신:
```tsx
import { useEffect, useState } from 'react';
import { GridDashboard } from './views/GridDashboard.js';
import { IsometricOffice } from './views/IsometricOffice.js';
import { ViewSwitcher, type ViewKind } from './views/ViewSwitcher.js';
import { EventTicker } from './components/EventTicker.js';
import { connectWs } from './ws/eventClient.js';
import { useCharacterStore } from './store/characterStore.js';
import type { CharacterConfig } from '../shared/config.js';

export function App() {
  const connected = useCharacterStore((s) => s.connected);
  const [view, setView] = useState<ViewKind>('grid');
  const [configs, setConfigs] = useState<CharacterConfig[]>([]);

  useEffect(() => {
    fetch('/config/characters').then((r) => r.json()).then(setConfigs).catch(() => setConfigs([]));
    const url = `ws://${location.hostname}:${location.port === '5173' ? '4000' : location.port || '4000'}/live`;
    const c = connectWs(url, useCharacterStore.getState);
    return () => c.close();
  }, []);

  return (
    <div>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', background: '#1f2937', color: 'white',
      }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Claude Monitor</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <ViewSwitcher active={view} onChange={setView} />
          <span style={{
            fontSize: 12, background: connected ? '#10b981' : '#ef4444',
            padding: '2px 8px', borderRadius: 8,
          }}>{connected ? 'connected' : 'disconnected'}</span>
        </div>
      </header>
      {view === 'grid' ? <GridDashboard /> : <IsometricOffice configs={configs} />}
      <EventTicker />
    </div>
  );
}
```

- [ ] **Step 5: 서버에 `/config/characters` 엔드포인트 추가**

`src/server/index.ts`의 `startServer` 내부에 추가:
```ts
const { characters } = await loadConfig(configDir);
app.get('/config/characters', async () => characters);
```

(변수명 충돌 시 `rules`와 함께 destructure)

- [ ] **Step 6: 수동 스모크**

```
npm run build:web && npm run dev:server
```
브라우저에서 Office 토글 → 캔버스에 방 구획 + 9개 원마커 + 이름 표시. Hook POST 시 마커 색상 변화.

- [ ] **Step 7: 커밋**

```
git add package.json package-lock.json src/web/pixi src/web/views src/web/App.tsx src/server/index.ts
git commit -m "feat(web): pixi isometric office skeleton with view switcher (Task 19)"
```

---

### Task 20: 아이소메트릭 좌표계 유틸 + 배경 개선

**Files:**
- Create: `src/web/pixi/IsometricGrid.ts`
- Modify: `src/web/pixi/OfficeScene.ts`

**Interfaces:**
- Produces: `screenXY(tileX: number, tileY: number): { x: number; y: number }`, `TILE_W = 64`, `TILE_H = 32`

- [ ] **Step 1: 유틸 구현**

`src/web/pixi/IsometricGrid.ts`:
```ts
export const TILE_W = 64;
export const TILE_H = 32;

export function screenXY(tileX: number, tileY: number, originX = 512, originY = 80): { x: number; y: number } {
  return {
    x: originX + (tileX - tileY) * (TILE_W / 2),
    y: originY + (tileX + tileY) * (TILE_H / 2),
  };
}
```

- [ ] **Step 2: OfficeScene 배경을 다이아몬드 타일로 교체**

`drawBackground` 교체:
```ts
private drawBackground() {
  const g = new Graphics();
  g.rect(0, 0, 1024, 640).fill('#efe6c8');
  const cols = 14, rows = 10;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const { x: sx, y: sy } = screenXY(x, y);
      g.poly([sx, sy, sx + 32, sy + 16, sx, sy + 32, sx - 32, sy + 16])
       .fill((x + y) % 2 === 0 ? '#e5d9a8' : '#dcc98c')
       .stroke({ color: '#c1a55d', width: 1 });
    }
  }
  this.root.addChild(g);
}
```

`import { screenXY } from './IsometricGrid.js';` 추가. `officeSeat` 좌표를 화면좌표 대신 타일좌표로 변경할지는 v1은 그대로(픽셀), Task 21에서 자리 위치 재조정.

- [ ] **Step 3: 커밋**

```
git add src/web/pixi
git commit -m "feat(web): isometric tile background (Task 20)"
```

---

### Task 21: 플레이스홀더 캐릭터 스프라이트 (idle)

**Files:**
- Create: `assets/sprites/placeholder-32x32.png` (16색 32×32 도트 캐릭터, 각 캐릭터별로 다른 색상 하이라이트), `src/web/pixi/CharacterSprite.ts`
- Modify: `src/web/pixi/OfficeScene.ts`

**Interfaces:**
- Produces: `class CharacterSprite extends Container { constructor(id: CharacterId, tint: number); setStatus(status: CharacterStatus): void; setLabel(text?: string): void }`

**Note:** v1에서는 실제 캐릭터 스프라이트 시트 대신 단색 사각형 + 캐릭터별 tint 색 조합으로 진행. 후속 릴리스에서 실제 스프라이트로 교체. Task 이름은 유지하되 구현은 프로그래매틱 렌더링.

- [ ] **Step 1: CharacterSprite 구현**

`src/web/pixi/CharacterSprite.ts`:
```ts
import { Container, Graphics, Text } from 'pixi.js';
import type { CharacterId, CharacterStatus } from '../../shared/character.js';

const TINT: Record<CharacterId, number> = {
  'kim-team-lead': 0x8b5cf6, 'park-planner': 0x3b82f6, 'lee-researcher': 0x14b8a6,
  'yu-dev': 0xf59e0b, 'han-qa': 0xec4899, 'seo-designer': 0xa855f7,
  'jo-senior': 0x64748b, 'jung-newbie': 0x22c55e, 'choi-office': 0xf97316,
};

const OUTLINE: Record<CharacterStatus, number | null> = {
  off: null, idle: null, thinking: 0x3b82f6, working: 0x10b981,
  blocked: 0xf59e0b, error: 0xef4444, done: 0x22c55e,
};

export class CharacterSprite extends Container {
  private body = new Graphics();
  private nameLabel: Text;
  private statusDot = new Graphics();

  constructor(private id: CharacterId, name: string) {
    super();
    this.nameLabel = new Text({ text: name, style: { fontSize: 10, fill: 0x111827, fontWeight: 'bold' } });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.y = 22;
    this.addChild(this.body, this.statusDot, this.nameLabel);
    this.setStatus('off');
  }

  setStatus(status: CharacterStatus): void {
    this.body.clear();
    const tint = TINT[this.id];
    const alpha = status === 'off' ? 0.35 : 1;
    // 몸통 (사각형 + 삼각형 머리)
    this.body.rect(-10, -6, 20, 18).fill({ color: tint, alpha });
    this.body.circle(0, -12, 8).fill({ color: 0xfde68a, alpha });
    const outline = OUTLINE[status];
    if (outline !== null) {
      this.body.rect(-12, -22, 24, 42).stroke({ color: outline, width: 2 });
    }
    this.statusDot.clear();
    this.statusDot.circle(10, -22, 4).fill(outline ?? 0x9ca3af);
  }
}
```

- [ ] **Step 2: OfficeScene 리팩토링**

`OfficeScene` 클래스 수정:
```ts
import { CharacterSprite } from './CharacterSprite.js';

// class OfficeScene 내부에 추가:
private sprites = new Map<CharacterId, CharacterSprite>();

setCharacters(states: CharacterState[], configs: CharacterConfig[]): void {
  if (!this.ready) return;
  const cfgMap = new Map(configs.map((c) => [c.id, c]));
  for (const s of states) {
    const cfg = cfgMap.get(s.id);
    if (!cfg) continue;
    let sprite = this.sprites.get(s.id);
    if (!sprite) {
      sprite = new CharacterSprite(s.id, cfg.name);
      sprite.x = cfg.officeSeat.x;
      sprite.y = cfg.officeSeat.y;
      this.root.addChild(sprite);
      this.sprites.set(s.id, sprite);
    }
    sprite.setStatus(s.status);
  }
}
```

`import` 문에 `CharacterId` 추가.

- [ ] **Step 3: 스모크 확인**

브라우저 Office 뷰: 9인이 각 자리에 색상 스프라이트 + 이름표. hook 이벤트에 따라 테두리 색 변화.

- [ ] **Step 4: 커밋**

```
git add src/web/pixi
git commit -m "feat(web): programmatic character sprites with status outline (Task 21)"
```

---

### Task 22: 상태별 애니메이션 (idle 흔들림, working 반짝임)

**Files:**
- Modify: `src/web/pixi/CharacterSprite.ts`, `src/web/pixi/OfficeScene.ts`
- Create: `src/web/pixi/animations.ts`

**Interfaces:**
- Produces: `class CharacterSprite { tick(deltaMs: number): void }`
- OfficeScene의 `Ticker`가 매 프레임 tick 호출

- [ ] **Step 1: animations 유틸**

`src/web/pixi/animations.ts`:
```ts
export function bob(t: number, amplitude = 2, periodMs = 1400): number {
  return Math.sin((t / periodMs) * Math.PI * 2) * amplitude;
}

export function pulseAlpha(t: number, periodMs = 900, min = 0.5, max = 1): number {
  const w = (Math.sin((t / periodMs) * Math.PI * 2) + 1) / 2;
  return min + (max - min) * w;
}
```

- [ ] **Step 2: CharacterSprite에 tick 추가**

```ts
import { bob, pulseAlpha } from './animations.js';

// private 필드 추가
private baseY = 0;
private elapsed = 0;
private currentStatus: CharacterStatus = 'off';

// 생성자에서 baseY 저장 (position.y 초기값 필요 시 별도)
setStatus(status: CharacterStatus): void {
  this.currentStatus = status;
  // 기존 draw 코드 유지
}

tick(deltaMs: number): void {
  this.elapsed += deltaMs;
  if (this.currentStatus === 'idle' || this.currentStatus === 'working') {
    this.body.y = bob(this.elapsed, this.currentStatus === 'working' ? 3 : 1.5);
  } else {
    this.body.y = 0;
  }
  if (this.currentStatus === 'thinking') {
    this.body.alpha = pulseAlpha(this.elapsed);
  } else if (this.currentStatus !== 'off') {
    this.body.alpha = 1;
  }
}
```

- [ ] **Step 3: OfficeScene Ticker 연결**

`init()` 끝에 추가:
```ts
this.app.ticker.add((ticker) => {
  const dt = ticker.deltaMS;
  for (const s of this.sprites.values()) s.tick(dt);
});
```

- [ ] **Step 4: 커밋**

```
git add src/web/pixi
git commit -m "feat(web): idle/working bob + thinking pulse animation (Task 22)"
```

---

### Task 23: 캐릭터 위 말풍선 + 티켓 스택 오버레이 (DOM)

**Files:**
- Create: `src/web/views/OfficeOverlay.tsx`
- Modify: `src/web/views/IsometricOffice.tsx`

**Interfaces:**
- Produces: 각 캐릭터의 `lastLine`과 `queue`를 캔버스 위 DOM 요소로 절대배치

- [ ] **Step 1: 오버레이 컴포넌트**

`src/web/views/OfficeOverlay.tsx`:
```tsx
import { useCharacterStore } from '../store/characterStore.js';
import { SpeechBubble } from '../components/SpeechBubble.js';
import { TicketQueue } from '../components/TicketQueue.js';
import { ALL_CHARACTER_IDS, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

function empty(id: CharacterState['id']): CharacterState {
  return { id, status: 'off', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

export function OfficeOverlay({ configs }: { configs: CharacterConfig[] }) {
  const characters = useCharacterStore((s) => s.characters);
  const cfgMap = new Map(configs.map((c) => [c.id, c]));
  return (
    <>
      {ALL_CHARACTER_IDS.map((id) => {
        const s = characters[id] ?? empty(id);
        const cfg = cfgMap.get(id);
        if (!cfg) return null;
        return (
          <div key={id} style={{
            position: 'absolute', left: cfg.officeSeat.x - 60, top: cfg.officeSeat.y - 90,
            width: 140, pointerEvents: 'none',
          }}>
            {s.lastLine && (
              <div style={{ pointerEvents: 'auto' }}>
                <SpeechBubble text={s.lastLine.text} ts={s.lastLine.ts} ttlMs={s.lastLine.ttlMs} />
              </div>
            )}
            <div style={{ marginTop: 4 }}>
              <TicketQueue tickets={s.queue} />
            </div>
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: IsometricOffice에 통합**

```tsx
import { OfficeOverlay } from './OfficeOverlay.js';

// return을 wrapper로 감쌈:
return (
  <div style={{ position: 'relative', width: 1024, margin: '0 auto' }}>
    <canvas ref={canvasRef} style={{ display: 'block' }} />
    <OfficeOverlay configs={configs} />
  </div>
);
```

- [ ] **Step 3: 커밋**

```
git add src/web/views
git commit -m "feat(web): DOM overlay for speech + tickets on office view (Task 23)"
```

---

### Task 24: 툴별 액션 시각화 (Bash → 서버실 왕복 트윈)

**Files:**
- Modify: `src/web/pixi/CharacterSprite.ts`, `src/web/pixi/OfficeScene.ts`

**Interfaces:**
- Produces: `CharacterSprite.moveTo(x: number, y: number, durationMs: number): Promise<void>`; OfficeScene가 활동에 따라 목적지 트윈

- [ ] **Step 1: moveTo 구현**

`CharacterSprite.ts`에 추가:
```ts
private tweenTo?: { targetX: number; targetY: number; startX: number; startY: number; durationMs: number; elapsed: number; resolve: () => void };

moveTo(x: number, y: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    this.tweenTo = {
      targetX: x, targetY: y, startX: this.x, startY: this.y,
      durationMs, elapsed: 0, resolve,
    };
  });
}

// tick 확장:
tick(deltaMs: number): void {
  this.elapsed += deltaMs;
  if (this.tweenTo) {
    this.tweenTo.elapsed += deltaMs;
    const t = Math.min(1, this.tweenTo.elapsed / this.tweenTo.durationMs);
    const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    this.x = this.tweenTo.startX + (this.tweenTo.targetX - this.tweenTo.startX) * ease;
    this.y = this.tweenTo.startY + (this.tweenTo.targetY - this.tweenTo.startY) * ease;
    if (t >= 1) { const r = this.tweenTo.resolve; this.tweenTo = undefined; r(); }
  }
  // 기존 bob/pulse 로직 유지
}
```

- [ ] **Step 2: 툴 → 목적지 매핑 (OfficeScene)**

`OfficeScene`에 추가:
```ts
private homePositions = new Map<CharacterId, { x: number; y: number }>();

private toolDestination(toolName: string): { x: number; y: number } | null {
  switch (toolName) {
    case 'Bash': return { x: 860, y: 160 }; // 서버실
    case 'WebFetch': case 'WebSearch': return { x: 200, y: 160 }; // 회의실
    default: return null;
  }
}

// setCharacters에서 activity 변화 감지:
private lastActivity = new Map<CharacterId, string | undefined>();

// sprite 생성 후:
this.homePositions.set(s.id, { x: cfg.officeSeat.x, y: cfg.officeSeat.y });

// 상태 반영 후:
const currTool = s.currentActivity?.toolName;
const prevTool = this.lastActivity.get(s.id);
if (currTool !== prevTool) {
  this.lastActivity.set(s.id, currTool);
  const dest = currTool ? this.toolDestination(currTool) : null;
  const home = this.homePositions.get(s.id)!;
  if (dest) {
    void sprite.moveTo(dest.x, dest.y, 700);
  } else {
    void sprite.moveTo(home.x, home.y, 500);
  }
}
```

- [ ] **Step 3: 스모크: Bash hook → 캐릭터가 서버실 방향으로 이동, PostToolUse 후 자리로 복귀**

- [ ] **Step 4: 커밋**

```
git add src/web/pixi
git commit -m "feat(web): character travels to tool destination and back (Task 24)"
```

---

## Milestone 4 — Replay + Onboarding + Polish

**Deliverable:** JSONL 트랜스크립트에서 지난 세션을 재생할 수 있고, 첫 실행 시 hook 자동 설치 온보딩 화면이 뜨며, 마지막 수동 검증 체크리스트 통과.

---

### Task 25: Log Tailer (트랜스크립트 JSONL 감시)

**Files:**
- Modify: `package.json` (chokidar, ndjson)
- Create: `src/server/logTailer.ts`, `test/integration/logTailer.test.ts`, `test/fixtures/jsonl/sample-session.jsonl`

**Interfaces:**
- Produces: `createLogTailer(rootDir: string, onLine: (sessionId: string, raw: unknown) => void): { start(): Promise<void>; stop(): Promise<void> }`

- [ ] **Step 1: 의존성 추가**

`package.json` deps에 `"chokidar": "^3.6.0"`, `"ndjson": "^2.0.0"`, devDeps에 `"@types/ndjson": "^2.0.4"`.

- [ ] **Step 2: 픽스처**

`test/fixtures/jsonl/sample-session.jsonl`:
```
{"type":"user","content":"start","session_id":"s-fix"}
{"type":"assistant","tool_use":{"name":"Grep","input":{"pattern":"foo"}},"session_id":"s-fix"}
{"type":"tool_result","tool_use_id":"t1","session_id":"s-fix"}
```

- [ ] **Step 3: 실패 통합 테스트**

`test/integration/logTailer.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLogTailer } from '../../src/server/logTailer.js';

describe('logTailer', () => {
  let dir = '';
  let tailer: ReturnType<typeof createLogTailer> | undefined;
  afterEach(async () => { await tailer?.stop(); await rm(dir, { recursive: true, force: true }); });

  it('emits lines from new jsonl files as they are appended', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cm-tail-'));
    const projDir = path.join(dir, 'projects', 'p1');
    await mkdir(projDir, { recursive: true });
    const file = path.join(projDir, 'session.jsonl');
    await writeFile(file, '{"session_id":"s1","first":1}\n');

    const lines: unknown[] = [];
    tailer = createLogTailer(dir, (_sid, raw) => lines.push(raw));
    await tailer.start();
    await new Promise((r) => setTimeout(r, 200));

    await appendFile(file, '{"session_id":"s1","second":2}\n');
    await new Promise((r) => setTimeout(r, 300));

    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[lines.length - 1]).toMatchObject({ second: 2 });
  });
});
```

- [ ] **Step 4: 구현**

`src/server/logTailer.ts`:
```ts
import chokidar, { type FSWatcher } from 'chokidar';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import ndjson from 'ndjson';
import path from 'node:path';

interface Options { rootDir: string; onLine: (sessionId: string, raw: unknown) => void }

interface Handle { start(): Promise<void>; stop(): Promise<void> }

export function createLogTailer(rootDir: string, onLine: Options['onLine']): Handle {
  let watcher: FSWatcher | undefined;
  const positions = new Map<string, number>();

  async function readFromPosition(file: string) {
    const st = await stat(file).catch(() => null);
    if (!st) return;
    const start = positions.get(file) ?? 0;
    if (st.size <= start) return;
    positions.set(file, st.size);
    await new Promise<void>((resolve) => {
      createReadStream(file, { start, end: st.size - 1 })
        .pipe(ndjson.parse({ strict: false }))
        .on('data', (obj: unknown) => {
          const sid = (obj as { session_id?: string })?.session_id ?? path.basename(file, '.jsonl');
          onLine(sid, obj);
        })
        .on('end', () => resolve())
        .on('error', () => resolve());
    });
  }

  return {
    async start() {
      watcher = chokidar.watch(path.join(rootDir, 'projects/**/*.jsonl'), {
        persistent: true, awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      });
      watcher.on('add', (f) => { positions.set(f, 0); void readFromPosition(f); });
      watcher.on('change', (f) => void readFromPosition(f));
    },
    async stop() { await watcher?.close(); },
  };
}
```

- [ ] **Step 5: 서버에 통합 (선택적, env `CM_TAIL_LOGS=1`일 때만)**

`src/server/index.ts`에 추가:
```ts
import { createLogTailer } from './logTailer.js';
import { normalizeHook } from './eventNormalizer.js';
import { homedir } from 'node:os';

// startServer 내부 (설정 로드 후):
if (process.env.CM_TAIL_LOGS === '1') {
  const tailer = createLogTailer(path.join(homedir(), '.claude'), (sid, raw) => {
    // v1: JSONL 원본을 hook 이벤트명으로 매핑하는 얕은 휴리스틱
    const obj = raw as { type?: string; tool_use?: { name?: string; input?: unknown }; agent_type?: string };
    let name: Parameters<typeof normalizeHook>[0] | null = null;
    if (obj.type === 'assistant' && obj.tool_use) name = 'PreToolUse';
    else if (obj.type === 'tool_result') name = 'PostToolUse';
    else if (obj.type === 'user') name = 'UserPromptSubmit';
    if (!name) return;
    const evt = normalizeHook(name, { session_id: sid, tool_name: obj.tool_use?.name, tool_input: obj.tool_use?.input, prompt: (obj as { content?: string }).content }, Date.now());
    if (!evt) return;
    const charId = router.route(evt);
    store.applyEvent(charId, evt);
  });
  await tailer.start();
  app.addHook('onClose', () => tailer.stop());
}
```

- [ ] **Step 6: 커밋**

```
git add src/server/logTailer.ts test/integration/logTailer.test.ts test/fixtures/jsonl package.json package-lock.json src/server/index.ts
git commit -m "feat(server): jsonl transcript tailer with opt-in bootstrap (Task 25)"
```

---

### Task 26: Session Replayer (지난 세션 재생 API)

**Files:**
- Create: `src/server/replayer.ts`, `test/integration/replayer.test.ts`
- Modify: `src/server/index.ts` (라우트 등록)

**Interfaces:**
- Produces:
  - `POST /replay/start { file: string; speed?: number }` — 파일을 읽어 이벤트 순차 재생
  - `POST /replay/stop`
  - `GET /replay/status`

- [ ] **Step 1: 실패 통합 테스트**

`test/integration/replayer.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import path from 'node:path';
import { createStateStore } from '../../src/server/stateStore.js';
import { createRouter } from '../../src/server/characterRouter.js';
import { registerReplayer } from '../../src/server/replayer.js';
import { loadConfig } from '../../src/server/config/loadConfig.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';

const CONFIG = path.resolve(process.cwd(), 'config');
const FIX = path.resolve(process.cwd(), 'test/fixtures/jsonl/sample-session.jsonl');

describe('replayer', () => {
  let app: ReturnType<typeof Fastify>;
  afterEach(async () => { await app?.close(); });

  it('POST /replay/start reads jsonl and dispatches events at speed=1000', async () => {
    const { rules } = await loadConfig(CONFIG);
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    const router = createRouter(rules);
    app = Fastify();
    registerReplayer(app, { store, router });
    const res = await app.inject({
      method: 'POST', url: '/replay/start',
      payload: { file: FIX, speed: 1000 },
    });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 250));
    const status = await app.inject({ method: 'GET', url: '/replay/status' });
    expect(status.json()).toMatchObject({ file: FIX });
  });
});
```

- [ ] **Step 2: 구현**

`src/server/replayer.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import ndjson from 'ndjson';
import type { StateStore } from './stateStore.js';
import type { createRouter } from './characterRouter.js';
import { normalizeHook } from './eventNormalizer.js';

interface Deps { store: StateStore; router: ReturnType<typeof createRouter> }
interface ReplayState { file: string | null; running: boolean; index: number; total: number }

export function registerReplayer(app: FastifyInstance, deps: Deps): void {
  const state: ReplayState = { file: null, running: false, index: 0, total: 0 };
  let abort = false;

  app.post('/replay/start', async (req, reply) => {
    const body = req.body as { file?: string; speed?: number };
    if (!body?.file) { reply.code(400); return { ok: false }; }
    abort = false;
    state.file = body.file; state.running = true; state.index = 0; state.total = 0;
    const events: unknown[] = [];
    await new Promise<void>((resolve) => {
      createReadStream(body.file!).pipe(ndjson.parse({ strict: false }))
        .on('data', (o: unknown) => events.push(o))
        .on('end', () => resolve())
        .on('error', () => resolve());
    });
    state.total = events.length;
    const speed = body.speed ?? 10;
    const gap = Math.max(1, Math.floor(1000 / speed));
    (async () => {
      for (const raw of events) {
        if (abort) break;
        const obj = raw as { type?: string; tool_use?: { name?: string; input?: unknown }; session_id?: string; content?: string };
        let name: Parameters<typeof normalizeHook>[0] | null = null;
        if (obj.type === 'assistant' && obj.tool_use) name = 'PreToolUse';
        else if (obj.type === 'tool_result') name = 'PostToolUse';
        else if (obj.type === 'user') name = 'UserPromptSubmit';
        if (name) {
          const evt = normalizeHook(name, { session_id: obj.session_id, tool_name: obj.tool_use?.name, tool_input: obj.tool_use?.input, prompt: obj.content }, Date.now());
          if (evt) deps.store.applyEvent(deps.router.route(evt), evt);
        }
        state.index += 1;
        await new Promise((r) => setTimeout(r, gap));
      }
      state.running = false;
    })().catch(() => { state.running = false; });
    return { ok: true, total: state.total };
  });

  app.post('/replay/stop', async () => { abort = true; state.running = false; return { ok: true }; });
  app.get('/replay/status', async () => state);
}
```

- [ ] **Step 3: `src/server/index.ts`에 라우트 등록**

```ts
import { registerReplayer } from './replayer.js';
// startServer 내:
registerReplayer(app, { store, router });
```

- [ ] **Step 4: 테스트 통과 확인**

- [ ] **Step 5: 커밋**

```
git add src/server/replayer.ts test/integration/replayer.test.ts src/server/index.ts
git commit -m "feat(server): session replay from jsonl with speed control (Task 26)"
```

---

### Task 27: ReplayControls UI + 재생 배너

**Files:**
- Create: `src/web/views/ReplayControls.tsx`
- Modify: `src/web/App.tsx`

**Interfaces:**
- Produces: `<ReplayControls />` — 파일 경로 입력, 속도 조절, 재생/정지 버튼, 상태 폴링

- [ ] **Step 1: 컴포넌트**

`src/web/views/ReplayControls.tsx`:
```tsx
import { useEffect, useState } from 'react';

interface Status { file: string | null; running: boolean; index: number; total: number }

export function ReplayControls() {
  const [file, setFile] = useState('');
  const [speed, setSpeed] = useState(10);
  const [status, setStatus] = useState<Status>({ file: null, running: false, index: 0, total: 0 });

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch('/replay/status');
        if (r.ok) setStatus(await r.json());
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  async function start() {
    await fetch('/replay/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, speed }),
    });
  }

  async function stop() { await fetch('/replay/stop', { method: 'POST' }); }

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center',
      padding: '6px 12px', background: '#374151', color: 'white', fontSize: 12,
    }}>
      <input value={file} onChange={(e) => setFile(e.target.value)} placeholder="/path/to/session.jsonl"
             style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: 'none' }} />
      <label>속도
        <input type="number" value={speed} min={1} max={200} onChange={(e) => setSpeed(Number(e.target.value))}
               style={{ width: 60, marginLeft: 4, padding: '2px 4px' }} />
      </label>
      <button onClick={start} disabled={!file || status.running}>▶ 재생</button>
      <button onClick={stop} disabled={!status.running}>■ 정지</button>
      {status.running && <span>{status.index}/{status.total}</span>}
    </div>
  );
}
```

- [ ] **Step 2: App에 통합**

`src/web/App.tsx`의 header 아래에 삽입:
```tsx
<ReplayControls />
```
`import { ReplayControls } from './views/ReplayControls.js';` 추가.

- [ ] **Step 3: 커밋**

```
git add src/web/views/ReplayControls.tsx src/web/App.tsx
git commit -m "feat(web): replay controls UI with polling status (Task 27)"
```

---

### Task 28: Hook Installer (POST /setup/install-hooks)

**Files:**
- Create: `src/server/setup/installHooks.ts`, `test/unit/installHooks.test.ts`
- Modify: `src/server/index.ts` (라우트 등록)

**Interfaces:**
- Produces:
  - `mergeHooks(existing: unknown, endpoint: string): SettingsJson` — 순수 함수
  - `POST /setup/install-hooks?scope=user|project { host?: string }` — 지정된 settings.json에 병합

- [ ] **Step 1: 실패 단위 테스트**

`test/unit/installHooks.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mergeHooks } from '../../src/server/setup/installHooks.js';

describe('mergeHooks', () => {
  const endpoint = 'http://localhost:4000/hook';
  const events = ['SessionStart', 'PreToolUse'];

  it('adds hooks section when missing', () => {
    const out = mergeHooks({}, endpoint, events);
    expect(out.hooks?.SessionStart).toBeDefined();
    expect(out.hooks?.PreToolUse).toBeDefined();
  });

  it('does not duplicate on second call (idempotent)', () => {
    const first = mergeHooks({}, endpoint, events);
    const second = mergeHooks(first, endpoint, events);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('preserves unrelated existing hooks', () => {
    const existing = { hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo user-hook' }] }] } };
    const out = mergeHooks(existing, endpoint, events);
    expect(out.hooks!.SessionStart[0].hooks[0].command).toBe('echo user-hook');
    const cmDto = out.hooks!.SessionStart[0].hooks.find((h) => 'command' in h && h.command.includes('X-CM-Event: SessionStart'));
    expect(cmDto).toBeDefined();
  });

  it('preserves non-hooks fields', () => {
    const out = mergeHooks({ env: { FOO: 'bar' } }, endpoint, events);
    expect(out.env).toEqual({ FOO: 'bar' });
  });
});
```

- [ ] **Step 2: 구현**

`src/server/setup/installHooks.ts`:
```ts
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

interface CommandHook { type: 'command'; command: string; async?: boolean; timeout?: number }
interface HookGroup { matcher?: string; hooks: CommandHook[] }
export interface SettingsJson { env?: Record<string, string>; hooks?: Record<string, HookGroup[]>; [k: string]: unknown }

function claudeMonitorCommand(endpoint: string, eventName: string): string {
  return `curl -sS -X POST ${endpoint} -H 'X-CM-Event: ${eventName}' -H 'Content-Type: application/json' -d @- 2>/dev/null || true`;
}

export function mergeHooks(existing: SettingsJson, endpoint: string, events: string[]): SettingsJson {
  const out: SettingsJson = { ...existing, hooks: { ...(existing.hooks ?? {}) } };
  for (const ev of events) {
    const groups: HookGroup[] = [...(out.hooks![ev] ?? [])];
    const cmd = claudeMonitorCommand(endpoint, ev);
    const exists = groups.some((g) => g.hooks.some((h) => h.command === cmd));
    if (exists) continue;
    let firstEmpty = groups.find((g) => !g.matcher);
    if (!firstEmpty) { firstEmpty = { matcher: '', hooks: [] }; groups.push(firstEmpty); }
    firstEmpty.hooks.push({ type: 'command', command: cmd, async: true, timeout: 5 });
    out.hooks![ev] = groups;
  }
  return out;
}

export const DEFAULT_EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit',
  'SubagentStart', 'SubagentStop',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'TaskCreated', 'TaskCompleted',
];

export async function installHooks(scope: 'user' | 'project', endpoint: string, cwd = process.cwd()): Promise<string> {
  const target = scope === 'user'
    ? path.join(homedir(), '.claude', 'settings.json')
    : path.join(cwd, '.claude', 'settings.json');
  let existing: SettingsJson = {};
  try {
    const raw = await readFile(target, 'utf8');
    existing = JSON.parse(raw) as SettingsJson;
  } catch { /* file missing, start fresh */ }
  const merged = mergeHooks(existing, endpoint, DEFAULT_EVENTS);
  await writeFile(target, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  return target;
}
```

- [ ] **Step 3: 라우트 등록**

`src/server/index.ts`:
```ts
import { installHooks } from './setup/installHooks.js';

// startServer 내:
app.post<{ Querystring: { scope?: 'user' | 'project' }; Body: { host?: string } }>('/setup/install-hooks', async (req) => {
  const scope = req.query.scope === 'user' ? 'user' : 'project';
  const host = req.body?.host ?? `http://${req.hostname}`;
  const endpoint = `${host}/hook`;
  const target = await installHooks(scope, endpoint);
  return { ok: true, target };
});
```

- [ ] **Step 4: 테스트 통과 확인**

- [ ] **Step 5: 커밋**

```
git add src/server/setup src/server/index.ts test/unit/installHooks.test.ts
git commit -m "feat(server): hook installer with idempotent settings.json merge (Task 28)"
```

---

### Task 29: 온보딩 화면 (첫 방문 시 hook 설치 유도)

**Files:**
- Create: `src/web/views/OnboardingScreen.tsx`
- Modify: `src/web/App.tsx`

**Interfaces:**
- Produces: `<OnboardingScreen onComplete />` — hook 미수신 상태에서 표시, 자동 설치 or 수동 스니펫 복사, 건너뛰기 옵션

- [ ] **Step 1: 컴포넌트**

`src/web/views/OnboardingScreen.tsx`:
```tsx
import { useState } from 'react';

interface Props { onComplete(): void }

export function OnboardingScreen({ onComplete }: Props) {
  const [scope, setScope] = useState<'user' | 'project'>('project');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function install() {
    setBusy(true);
    try {
      const r = await fetch(`/setup/install-hooks?scope=${scope}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: `http://${location.hostname}:4000` }),
      });
      const data = await r.json();
      setStatus(data.ok ? `설치 완료: ${data.target}` : '설치 실패');
    } catch (err) {
      setStatus(`오류: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div style={{
      maxWidth: 560, margin: '80px auto', padding: 24,
      background: 'white', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,.06)',
    }}>
      <h2>Claude Monitor 초기 설정</h2>
      <p>이 앱은 Claude Code hooks를 통해 이벤트를 수신합니다.</p>
      <div style={{ margin: '16px 0' }}>
        <label style={{ display: 'block', margin: '6px 0' }}>
          <input type="radio" checked={scope === 'user'} onChange={() => setScope('user')} />
          {' '}전역 (`~/.claude/settings.json`)
        </label>
        <label style={{ display: 'block', margin: '6px 0' }}>
          <input type="radio" checked={scope === 'project'} onChange={() => setScope('project')} />
          {' '}현재 프로젝트 (`.claude/settings.json`)
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={install} disabled={busy}>자동 설치</button>
        <button onClick={onComplete}>건너뛰기</button>
      </div>
      {status && <p style={{ marginTop: 12, fontSize: 13 }}>{status}</p>}
    </div>
  );
}
```

- [ ] **Step 2: App에서 조건부 렌더링**

`src/web/App.tsx` 수정:
```tsx
import { OnboardingScreen } from './views/OnboardingScreen.js';

// 컴포넌트 내부:
const events = useCharacterStore((s) => s.events);
const [dismissed, setDismissed] = useState(() => localStorage.getItem('cm-onboarding-done') === '1');

const showOnboarding = !dismissed && events.length === 0;

function completeOnboarding() {
  localStorage.setItem('cm-onboarding-done', '1');
  setDismissed(true);
}

// return의 GridDashboard/IsometricOffice를 감싸는 조건:
return (
  <div>
    {/* header + ReplayControls */}
    {showOnboarding ? (
      <OnboardingScreen onComplete={completeOnboarding} />
    ) : (
      view === 'grid' ? <GridDashboard /> : <IsometricOffice configs={configs} />
    )}
    <EventTicker />
  </div>
);
```

- [ ] **Step 3: 커밋**

```
git add src/web/views/OnboardingScreen.tsx src/web/App.tsx
git commit -m "feat(web): onboarding screen for hook installation (Task 29)"
```

---

### Task 30: 릴리스 폴리시 + 수동 검증 체크리스트

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-07-25-claude-monitor-v1-release-checklist.md`

**Interfaces:**
- 없음. 문서 + 마감 커밋.

- [ ] **Step 1: README 최종 정리**

기존 README를 다음으로 교체:

```markdown
# Claude Monitor

Claude Code 서브에이전트를 "중소기업 외주 개발팀" 캐릭터로 시각화하는 로컬 대시보드.

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

1. 브라우저에서 접속 → 온보딩 화면 표시
2. "전역" 또는 "현재 프로젝트" 선택 → 자동 설치
3. 이후 Claude Code 세션에서 발생하는 hook 이벤트가 실시간 반영

## 지난 세션 재생

- 상단 재생 컨트롤에 트랜스크립트 파일 경로 입력 (예: `~/.claude/projects/xxx/session.jsonl`)
- 속도 조절 → 재생

## 뷰 전환

- 우상단 [Grid | Office] 토글로 카드 대시보드 ↔ 아이소메트릭 오피스 전환

## 환경 변수

- `PORT` (기본 4000)
- `HOST` (기본 0.0.0.0)
- `LOG_LEVEL` (기본 info)
- `CM_TAIL_LOGS=1` — 서버 기동 시 자동으로 `~/.claude/projects` JSONL tail 시작

## 테스트

- `npm test` — vitest 실행 (단위 + 통합)
```

- [ ] **Step 2: 릴리스 체크리스트 문서**

`docs/superpowers/plans/2026-07-25-claude-monitor-v1-release-checklist.md`:
```markdown
# Claude Monitor v1 Release Checklist

## 자동 검증
- [ ] `npm test` — 모든 vitest 통과
- [ ] `npm run build` — 빌드 성공, `dist/web`과 `dist/server` 생성

## 수동 스모크
- [ ] `npm start` → localhost:4000에서 온보딩 화면 표시
- [ ] "자동 설치" → 설정 파일 경로가 응답에 표시됨
- [ ] Claude Code 실제 세션 5분 실행 → 9인 중 최소 3인 활동 감지, 대사 표시
- [ ] 병렬 서브에이전트 3개 spawn → 큐 티켓 시각화 정확 (active + queued)
- [ ] Bash 툴 호출 → 오피스 뷰에서 캐릭터가 서버실 방향으로 이동, PostToolUse 후 복귀
- [ ] tool.post(success=false) → 카드 빨간 테두리, `error` 상태 표시
- [ ] agent.stop → `done` 상태 (초록 체크) 후 idle로 복귀
- [ ] WS 강제 종료 (`kill` 후 재기동) → 5초 이내 재접속 배너 사라짐
- [ ] 재생 컨트롤에 fixture jsonl 경로 → 이벤트 순차 반영 확인
- [ ] View 토글 Grid ↔ Office 반복 → 상태 유지, 메모리 누수 없음 (10분 관찰)

## 문서
- [ ] README 최신
- [ ] 스펙(`docs/superpowers/specs/…`)과 실제 동작 일치

## 릴리스
- [ ] `main` 브랜치 클린 (uncommitted 없음)
- [ ] 태그: `git tag v0.1.0 && git push origin v0.1.0` (옵션)
```

- [ ] **Step 3: 커밋**

```
git add README.md docs/superpowers/plans/2026-07-25-claude-monitor-v1-release-checklist.md
git commit -m "docs: finalize README and add v1 release checklist (Task 30)"
```

---

## 완료 조건

M1~M4 모든 태스크 체크 완료 + 릴리스 체크리스트 통과 시 v1 릴리스 준비 완료.

## v2 로드맵 (참고)

스펙 Section 13 참조: LLM 실시간 대사, MCP 파트너 애니, 커스텀 서브에이전트 자동 감지, 다중 세션, 카메라 팬/줌, 스프라이트 업그레이드, tunnel 지원.
