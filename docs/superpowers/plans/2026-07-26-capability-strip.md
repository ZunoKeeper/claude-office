# Capability Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GRID 뷰 하단에 모델(정적+관측 하이라이트) / Sub Agent(캐릭터별 카테고리) / Skills(플러그인별 그룹) / 활성 플러그인을 보여주는 정보 스트립.

**Architecture:** 서버 `src/server/env/capabilities.ts`가 순수 파서(mergePlugins/parseFrontmatter/parseSkillMd)와 fs 스캐너를 제공, `GET /env/capabilities`가 기동 시 1회 수집한 결과를 반환. 웹은 `CapabilityStrip` 컴포넌트 하나가 fetch해 4개 행을 렌더, 관측 하이라이트는 기존 스토어 데이터(카드 currentModel, agent.start 이벤트)로 클라이언트에서 계산.

**Tech Stack:** Fastify, React, zustand, vitest

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-26-capability-strip-design.md`
- 모든 파일 접근 실패는 해당 항목 빈 배열 — `/env/capabilities`는 항상 200
- OFFICE 뷰 변경 없음
- 커밋 메시지 말미: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: capabilities 모듈 — 순수 파서 (TDD)

**Files:**
- Modify: `src/server/characterRouter.ts:5` (AGENT_TYPE_MAP export + BUILTIN_AGENT_TYPES 추가)
- Create: `src/server/env/capabilities.ts`
- Test: `test/unit/capabilities.test.ts`

**Interfaces (Produces):**
```ts
// characterRouter.ts
export const AGENT_TYPE_MAP: Record<string, CharacterId>;
export const BUILTIN_AGENT_TYPES: ReadonlySet<string>; // 'Plan' | 'Explore' | 'general-purpose'

// env/capabilities.ts
export interface PluginInfo { name: string; marketplace: string; version: string; scope: string; installPath: string }
export interface SkillInfo { name: string; source: string; description?: string }
export interface AgentTypeInfo { type: string; characterId: CharacterId | null; builtin: boolean; source: 'router' | 'user' | 'project' }
export interface Capabilities { models: string[]; agentTypes: AgentTypeInfo[]; skills: SkillInfo[]; plugins: PluginInfo[] }
export function mergePlugins(installedRaw: unknown, enabledRaw: unknown): PluginInfo[];
export function parseFrontmatter(content: string): Record<string, string>;
export function parseSkillMd(content: string, fallbackName: string, source: string): SkillInfo;
export function routerAgentTypes(): AgentTypeInfo[];
export function collectCapabilities(opts: { homeDir: string; projectDir: string; models: string[] }): Promise<Capabilities>;
```

- [ ] **Step 1: 실패하는 테스트 작성** — `test/unit/capabilities.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mergePlugins, parseSkillMd, routerAgentTypes } from '../../src/server/env/capabilities.js';

describe('mergePlugins', () => {
  const installed = {
    plugins: {
      'superpowers@claude-plugins-official': [
        { scope: 'user', installPath: 'C:\\cache\\superpowers\\6.1.1', version: '6.1.1' },
      ],
      'harness@harness-marketplace': [
        { scope: 'project', installPath: 'C:\\cache\\harness\\1.2.0', version: '1.2.0' },
      ],
      'github@claude-plugins-official': [
        { scope: 'user', installPath: 'C:\\cache\\github\\unknown', version: 'unknown' },
      ],
    },
  };
  const enabled = {
    'superpowers@claude-plugins-official': true,
    'github@claude-plugins-official': true,
    // harness는 미포함 → 비활성
  };

  it('returns only enabled plugins with parsed name/marketplace', () => {
    const out = mergePlugins(installed, enabled);
    expect(out.map((p) => p.name).sort()).toEqual(['github', 'superpowers']);
    const sp = out.find((p) => p.name === 'superpowers')!;
    expect(sp.marketplace).toBe('claude-plugins-official');
    expect(sp.version).toBe('6.1.1');
    expect(sp.installPath).toContain('superpowers');
  });

  it('tolerates malformed inputs', () => {
    expect(mergePlugins(null, null)).toEqual([]);
    expect(mergePlugins({ plugins: 'oops' }, {})).toEqual([]);
    expect(mergePlugins({ plugins: { 'a@b': [] } }, { 'a@b': true })).toEqual([]);
  });
});

describe('parseSkillMd', () => {
  it('reads name/description from frontmatter', () => {
    const md = '---\nname: brainstorming\ndescription: Explores user intent before implementation\n---\n\n# Body';
    const s = parseSkillMd(md, 'dir-name', 'superpowers');
    expect(s).toEqual({ name: 'brainstorming', source: 'superpowers', description: 'Explores user intent before implementation' });
  });

  it('falls back to directory name without frontmatter', () => {
    const s = parseSkillMd('# no frontmatter', 'my-skill', 'user');
    expect(s.name).toBe('my-skill');
    expect(s.source).toBe('user');
    expect(s.description).toBeUndefined();
  });
});

describe('routerAgentTypes', () => {
  it('exposes router map entries with builtin flag', () => {
    const types = routerAgentTypes();
    const plan = types.find((t) => t.type === 'Plan')!;
    expect(plan.characterId).toBe('planner-researcher');
    expect(plan.builtin).toBe(true);
    expect(plan.source).toBe('router');
    const tester = types.find((t) => t.type === 'tester')!;
    expect(tester.builtin).toBe(false);
    expect(types.length).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/unit/capabilities.test.ts`
Expected: FAIL — `src/server/env/capabilities.js` 로드 불가

- [ ] **Step 3: 구현**

`src/server/characterRouter.ts` — `const AGENT_TYPE_MAP`를 `export const`로 바꾸고 아래 추가:

```ts
export const BUILTIN_AGENT_TYPES: ReadonlySet<string> = new Set(['Plan', 'Explore', 'general-purpose']);
```

`src/server/env/capabilities.ts` 전체:

```ts
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_TYPE_MAP, BUILTIN_AGENT_TYPES } from '../characterRouter.js';
import type { CharacterId } from '../../shared/character.js';

export interface PluginInfo { name: string; marketplace: string; version: string; scope: string; installPath: string }
export interface SkillInfo { name: string; source: string; description?: string }
export interface AgentTypeInfo { type: string; characterId: CharacterId | null; builtin: boolean; source: 'router' | 'user' | 'project' }
export interface Capabilities { models: string[]; agentTypes: AgentTypeInfo[]; skills: SkillInfo[]; plugins: PluginInfo[] }

export function mergePlugins(installedRaw: unknown, enabledRaw: unknown): PluginInfo[] {
  const plugins = (installedRaw as { plugins?: unknown } | null)?.plugins;
  if (!plugins || typeof plugins !== 'object') return [];
  const enabled = (enabledRaw && typeof enabledRaw === 'object') ? enabledRaw as Record<string, unknown> : {};
  const out: PluginInfo[] = [];
  for (const [key, entries] of Object.entries(plugins as Record<string, unknown>)) {
    if (enabled[key] !== true) continue;
    const first = Array.isArray(entries) ? entries[0] : entries;
    if (!first || typeof first !== 'object') continue;
    const e = first as { version?: string; scope?: string; installPath?: string };
    const at = key.lastIndexOf('@');
    out.push({
      name: at > 0 ? key.slice(0, at) : key,
      marketplace: at > 0 ? key.slice(at + 1) : '',
      version: e.version ?? 'unknown',
      scope: e.scope ?? 'user',
      installPath: e.installPath ?? '',
    });
  }
  return out;
}

export function parseFrontmatter(content: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    if (line.startsWith(' ') || line.startsWith('\t')) continue; // nested yaml은 무시
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

export function parseSkillMd(content: string, fallbackName: string, source: string): SkillInfo {
  const fm = parseFrontmatter(content);
  const info: SkillInfo = { name: fm.name || fallbackName, source };
  if (fm.description) info.description = fm.description;
  return info;
}

async function scanSkillsDir(dir: string, source: string): Promise<SkillInfo[]> {
  const out: SkillInfo[] = [];
  let entries: string[] = [];
  try { entries = await readdir(dir); } catch { return out; }
  for (const name of entries) {
    try {
      const content = await readFile(path.join(dir, name, 'SKILL.md'), 'utf8');
      out.push(parseSkillMd(content, name, source));
    } catch { /* SKILL.md 없는 항목은 스킬 아님 */ }
  }
  return out;
}

async function scanAgentsDir(dir: string, source: 'user' | 'project'): Promise<AgentTypeInfo[]> {
  const out: AgentTypeInfo[] = [];
  let entries: string[] = [];
  try { entries = await readdir(dir); } catch { return out; }
  for (const f of entries) {
    if (!f.endsWith('.md')) continue;
    let type = f.replace(/\.md$/, '');
    try {
      const fm = parseFrontmatter(await readFile(path.join(dir, f), 'utf8'));
      if (fm.name) type = fm.name;
    } catch { /* 파일명 유지 */ }
    out.push({ type, characterId: AGENT_TYPE_MAP[type] ?? null, builtin: false, source });
  }
  return out;
}

export function routerAgentTypes(): AgentTypeInfo[] {
  return Object.entries(AGENT_TYPE_MAP).map(([type, characterId]) => ({
    type, characterId, builtin: BUILTIN_AGENT_TYPES.has(type), source: 'router' as const,
  }));
}

export async function collectCapabilities(
  opts: { homeDir: string; projectDir: string; models: string[] },
): Promise<Capabilities> {
  const { homeDir, projectDir, models } = opts;
  let plugins: PluginInfo[] = [];
  try {
    const installed: unknown = JSON.parse(
      await readFile(path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'),
    );
    let enabled: unknown = {};
    try {
      const settings = JSON.parse(await readFile(path.join(homeDir, '.claude', 'settings.json'), 'utf8')) as { enabledPlugins?: unknown };
      enabled = settings.enabledPlugins ?? {};
    } catch { /* settings 없으면 전부 비활성 취급 */ }
    plugins = mergePlugins(installed, enabled);
  } catch { /* plugins 메타데이터 없음 */ }

  const skills: SkillInfo[] = [];
  for (const p of plugins) {
    if (p.installPath) skills.push(...await scanSkillsDir(path.join(p.installPath, 'skills'), p.name));
  }
  skills.push(...await scanSkillsDir(path.join(homeDir, '.claude', 'skills'), 'user'));
  skills.push(...await scanSkillsDir(path.join(projectDir, '.claude', 'skills'), 'project'));

  const agentTypes = routerAgentTypes();
  const seen = new Set(agentTypes.map((a) => a.type));
  const scanned = [
    ...await scanAgentsDir(path.join(homeDir, '.claude', 'agents'), 'user'),
    ...await scanAgentsDir(path.join(projectDir, '.claude', 'agents'), 'project'),
  ];
  for (const a of scanned) {
    if (seen.has(a.type)) continue;
    seen.add(a.type);
    agentTypes.push(a);
  }
  return { models, agentTypes, skills, plugins };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run test/unit/capabilities.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 전체 테스트 + 커밋**

Run: `npm test` → all pass

```bash
git add src/server/characterRouter.ts src/server/env/capabilities.ts test/unit/capabilities.test.ts
git commit -m "feat(server): capability collectors (plugins/skills/agent types)"
```

---

### Task 2: /env/capabilities 엔드포인트 + vite proxy

**Files:**
- Modify: `src/server/index.ts:95-97` 근처 (기존 `/config/models` 아래)
- Modify: `vite.config.ts:20` (proxy에 `^/env/.*` 추가)
- Test: `test/integration/capabilities.test.ts`

**Interfaces:**
- Consumes: Task 1의 `collectCapabilities`
- Produces: `GET /env/capabilities` → `Capabilities` JSON

- [ ] **Step 1: 실패하는 테스트 작성** — `test/integration/capabilities.test.ts`

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { startServer } from '../../src/server/index.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /env/capabilities', () => {
  it('returns models, agent types, skills, plugins', async () => {
    app = await startServer({ port: 0 });
    const res = await app.inject({ method: 'GET', url: '/env/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      models: string[];
      agentTypes: { type: string; characterId: string | null }[];
      skills: unknown[];
      plugins: unknown[];
    };
    expect(body.models).toContain('opus');
    expect(body.agentTypes.find((a) => a.type === 'Plan')?.characterId).toBe('planner-researcher');
    expect(Array.isArray(body.skills)).toBe(true);
    expect(Array.isArray(body.plugins)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/integration/capabilities.test.ts`
Expected: FAIL — 404

- [ ] **Step 3: 구현**

`src/server/index.ts` — import 추가:

```ts
import { collectCapabilities } from './env/capabilities.js';
```

기존 `/config/models` 핸들러를 아래처럼 상수 재사용으로 바꾸고 신규 라우트 추가:

```ts
  const MODEL_FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'];

  app.get('/config/models', async () => ({ models: MODEL_FAMILIES }));

  // 스킬/플러그인은 세션 중 거의 불변 — 기동 시 1회 수집해 캐시
  const capabilities = await collectCapabilities({
    homeDir: homedir(),
    projectDir: process.cwd(),
    models: MODEL_FAMILIES,
  });
  app.get('/env/capabilities', async () => capabilities);
```

`vite.config.ts` proxy에 추가:

```ts
      '^/env/.*': 'http://localhost:4000',
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run test/integration/capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 테스트 + 커밋**

Run: `npm test` → all pass

```bash
git add src/server/index.ts vite.config.ts test/integration/capabilities.test.ts
git commit -m "feat(server): /env/capabilities endpoint with startup-time scan"
```

---

### Task 3: CapabilityStrip 컴포넌트 + GRID 통합

**Files:**
- Create: `src/web/components/CapabilityStrip.tsx`
- Modify: `src/web/views/GridDashboard.tsx` (그리드 아래 렌더)
- Modify: `src/web/styles.css` (스트립 스타일, `.model-badge` 톤 재사용)

**Interfaces:**
- Consumes: `GET /env/capabilities`, `useCharacterStore`(characters/events), `CharacterConfig[]`
- Produces: `<CapabilityStrip configs={CharacterConfig[]} />`

- [ ] **Step 1: 컴포넌트 작성** — `src/web/components/CapabilityStrip.tsx` 전체:

```tsx
import { useEffect, useState } from 'react';
import { useCharacterStore } from '../store/characterStore.js';
import { ALL_CHARACTER_IDS } from '../../shared/character.js';
import type { CharacterId } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

interface AgentTypeInfo { type: string; characterId: CharacterId | null; builtin: boolean; source: string }
interface SkillInfo { name: string; source: string; description?: string }
interface PluginInfo { name: string; marketplace: string; version: string }
interface Capabilities { models: string[]; agentTypes: AgentTypeInfo[]; skills: SkillInfo[]; plugins: PluginInfo[] }

export function CapabilityStrip({ configs }: { configs: CharacterConfig[] }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const characters = useCharacterStore((s) => s.characters);
  const events = useCharacterStore((s) => s.events);
  // 이벤트 버퍼는 30개 롤링이라 관측된 agent type은 로컬 Set에 누적한다
  const [seenTypes, setSeenTypes] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    fetch('/env/capabilities').then((r) => r.json()).then(setCaps).catch(() => setCaps(null));
  }, []);

  useEffect(() => {
    setSeenTypes((prev) => {
      let next: Set<string> | null = null;
      for (const e of events) {
        if (e.type === 'agent.start' && !prev.has(e.agentType) && !(next?.has(e.agentType))) {
          next = next ?? new Set(prev);
          next.add(e.agentType);
        }
      }
      return next ?? prev;
    });
  }, [events]);

  if (!caps) return null;

  const nameById = new Map(configs.map((c) => [c.id, c.name]));
  const observedModels = Object.values(characters)
    .map((c) => c?.currentModel)
    .filter((m): m is string => !!m);

  const agentGroups: { label: string; items: AgentTypeInfo[] }[] = [];
  for (const id of ALL_CHARACTER_IDS) {
    const items = caps.agentTypes.filter((a) => a.characterId === id);
    if (items.length) agentGroups.push({ label: nameById.get(id) ?? id, items });
  }
  const unmapped = caps.agentTypes.filter((a) => a.characterId === null);
  if (unmapped.length) agentGroups.push({ label: '기타', items: unmapped });

  const skillGroups = new Map<string, SkillInfo[]>();
  for (const s of caps.skills) {
    const arr = skillGroups.get(s.source) ?? [];
    arr.push(s);
    skillGroups.set(s.source, arr);
  }

  return (
    <div className="capability-strip">
      <div className="cap-row">
        <span className="cap-label">MODELS</span>
        {caps.models.map((family) => {
          const obs = [...new Set(observedModels.filter((m) => m.includes(family)))];
          return (
            <span
              key={family}
              className={`cap-chip ${obs.length ? 'live' : ''}`}
              title={obs.length ? `관측됨: ${obs.join(', ')}` : '이 세션에서 아직 관측되지 않음'}
            >
              ◈ {family}
            </span>
          );
        })}
      </div>
      <div className="cap-row">
        <span className="cap-label">SUB AGENTS</span>
        {agentGroups.map((g) => (
          <span key={g.label} className="cap-group">
            <span className="cap-group-label">{g.label}</span>
            {g.items.map((a) => (
              <span
                key={a.type}
                className={`cap-chip ${seenTypes.has(a.type) ? 'live' : ''}`}
                title={a.builtin ? '내장 서브에이전트' : a.source === 'router' ? '라우팅 대상 서브에이전트' : `${a.source} 정의 서브에이전트`}
              >
                {a.type}
              </span>
            ))}
          </span>
        ))}
      </div>
      <div className="cap-row">
        <span className="cap-label">SKILLS</span>
        {[...skillGroups.entries()].map(([source, items]) => (
          <span key={source} className="cap-group">
            <span className="cap-group-label">{source}</span>
            {items.map((s) => (
              <span key={`${source}/${s.name}`} className="cap-chip" title={s.description ?? s.name}>
                {s.name}
              </span>
            ))}
          </span>
        ))}
      </div>
      <div className="cap-row">
        <span className="cap-label">PLUGINS</span>
        {caps.plugins.map((p) => (
          <span key={`${p.name}@${p.marketplace}`} className="cap-chip" title={`${p.name}@${p.marketplace}`}>
            {p.name}{p.version !== 'unknown' ? ` v${p.version}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: GridDashboard 통합** — return 블록을 아래로 교체:

```tsx
  return (
    <>
      <div className="grid-office">
        {ALL_CHARACTER_IDS.map((id) => {
          const cfg = configById.get(id);
          return (
            <CharacterCard
              key={id}
              state={characters[id] ?? empty(id)}
              name={cfg?.name ?? id}
              role={cfg?.role ?? ''}
              description={cfg?.description}
            />
          );
        })}
      </div>
      <CapabilityStrip configs={configs} />
    </>
  );
```

import 추가: `import { CapabilityStrip } from '../components/CapabilityStrip.js';`

- [ ] **Step 3: 스타일 추가** — `styles.css` 말미(.model-badge 블록 뒤)에:

```css
/* Capability strip — GRID 뷰 하단 환경 정보 (models/agents/skills/plugins) */
.capability-strip {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
  background: var(--floor-3);
}

.cap-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}

.cap-label {
  font-family: 'Press Start 2P', monospace;
  font-size: 8px;
  color: var(--wall);
  letter-spacing: 0.5px;
  min-width: 92px;
}

.cap-group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: 1px dashed var(--wall);
}

.cap-group-label {
  font-family: 'Press Start 2P', monospace;
  font-size: 7px;
  color: var(--wall);
}

.cap-chip {
  display: inline-block;
  font-family: 'Press Start 2P', monospace;
  font-size: 7px;
  padding: 2px 4px;
  border: 1px solid var(--ink);
  box-shadow: 1px 1px 0 var(--ink);
  color: var(--ink);
  letter-spacing: 0.5px;
}

.cap-chip.live { background: var(--sky); }
```

주의: `var(--floor-3)`, `var(--wall)`, `var(--sky)`, `var(--ink)`는 기존 변수 — styles.css 상단 `:root`에서 존재 확인 후 사용 (없으면 `.model-badge`가 실제 쓰는 변수로 대체).

- [ ] **Step 4: 검증** — `npm run build` (tsc + vite 타입/빌드 통과) 후 `npm run dev`로 GRID 뷰에서:
  - 하단 스트립 4행 표시
  - MODELS 행: fable/opus/sonnet/haiku 일렬, 관측 모델 live 강조
  - SUB AGENTS: 캐릭터 그룹별 칩
  - SKILLS/PLUGINS: 이 머신의 활성 플러그인 8개와 스킬 다수 표시
  - OFFICE 뷰 전환 시 스트립 없음

- [ ] **Step 5: 전체 테스트 + 커밋**

Run: `npm test` → all pass

```bash
git add src/web/components/CapabilityStrip.tsx src/web/views/GridDashboard.tsx src/web/styles.css
git commit -m "feat(web): capability strip below GRID dashboard"
```

---

### Task 4: README 갱신

**Files:**
- Modify: `README.md` "뷰 전환" 섹션의 GRID 설명

- [ ] **Step 1: GRID 설명 갱신** — 기존:

```markdown
  - **GRID**: 카드 대시보드 (팀원 데스크 뷰). 6인의 상태·활동·모델·스탯 한눈에.
```

교체:

```markdown
  - **GRID**: 카드 대시보드 (팀원 데스크 뷰). 6인의 상태·활동·모델·스탯 한눈에.
    하단 Capability Strip에 모델 패밀리(관측 시 하이라이트) · Sub Agent 종류(담당 캐릭터별) ·
    활성 Skills(플러그인별) · 활성 플러그인이 표시됩니다 (`GET /env/capabilities`, 서버 기동 시 1회 스캔).
```

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: document GRID capability strip"
```
