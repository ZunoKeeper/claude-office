# MetroCity 스프라이트 교체 + 조합 에디터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 절차적 도트 캐릭터를 MetroCity 32×32 스프라이트 시트 합성(피부×헤어×의상)으로 교체하고, 캐릭터 설정창에서 조합을 편집해 에이전트별로 저장한다.

**Architecture:** 시트는 32×32 프레임 × 24열(S 0–5 / E 6–11 / N 12–17 / W 18–23, W는 E의 시트 내 미러). 공유 카탈로그(`src/shared/sprites.ts`)가 파트 id·행 수·기본 외모를 정의하고, 서버는 `~/.claude-office/sprites.json`에 AppearanceDoc을 저장, 웹은 시트를 1회 로드 후 canvas 합성으로 Pixi atlas를 만든다.

**Tech Stack:** Vite + React + Pixi.js 8, Fastify, Vitest.

## Global Constraints

- 스프라이트 프레임 32×32, `PIXEL_SCALE = 3` (이름표 오프셋 `SPRITE_H*PIXEL_SCALE = 96` 유지)
- 엔드포인트 이름 유지: `GET/PUT /config/sprites`
- 파트 카탈로그: skin 6, hair `hairs`(8)+`hair-gold`(5), outfit `suit`(4)+`suit1`(5)+`outfit1~6`(각 1)
- 앉기/타이핑 = 정면(stand-S) 프레임, type2는 y+1px 오프셋
- 기존 파일 삭제: bodyPoses/heads/faces/accessories/palettes/SpriteEditorScreen (emotes.ts 유지)

---

### Task 1: 자산 복사 + 프레임 좌표 모듈

**Files:**
- Create: `src/web/assets/metrocity/{body,shadow,hairs,hair-gold,suit,suit1,outfit1..outfit6}.png` (원본 `src/characters/MetroCity`에서 복사)
- Create: `src/web/pixi/sprites/frames.ts`
- Test: `test/unit/spriteFrames.test.ts`

**Interfaces:**
- Produces: `FRAME_W/FRAME_H=32`, `type Direction`, `frameRect(dir, frame, row): {x,y,w,h}`, `poseToFrame(pose): {dir, frame, yOff}`

- [ ] 복사 명령:

```bash
cd c:/Apps/claude-office
mkdir -p src/web/assets/metrocity
cp "src/characters/MetroCity/CharacterModel/Character Model.png" src/web/assets/metrocity/body.png
cp "src/characters/MetroCity/CharacterModel/Shadow.png" src/web/assets/metrocity/shadow.png
cp "src/characters/MetroCity/Hairs.png" src/web/assets/metrocity/hairs.png  # 주의: Hair/ 하위 아님
cp "src/characters/MetroCity/Hair.png" src/web/assets/metrocity/hair-gold.png
cp "src/characters/MetroCity/Suit.png" src/web/assets/metrocity/suit.png
cp "src/characters/MetroCity/Suit1.png" src/web/assets/metrocity/suit1.png
for i in 1 2 3 4 5 6; do cp "src/characters/MetroCity/Outfits/Outfit$i.png" "src/web/assets/metrocity/outfit$i.png"; done
```

주의: `Hairs.png`는 저장소 루트 `src/characters/MetroCity/Hairs.png`가 아니라 `Hair/Hairs.png`에 있음 — 실제 위치는 `src/characters/MetroCity/Hair/Hairs.png`.

- [ ] `frames.ts` 작성:

```ts
export const FRAME_W = 32;
export const FRAME_H = 32;
export type Direction = 'S' | 'N' | 'E' | 'W';

/** 시트 내 방향별 시작 열. W(18–23)는 E(6–11)의 좌우 미러 프레임. */
const DIR_BLOCK: Record<Direction, number> = { S: 0, E: 6, N: 12, W: 18 };

export function frameCol(dir: Direction, frame: number): number {
  const f = Math.min(5, Math.max(0, Math.floor(frame)));
  return DIR_BLOCK[dir] + f;
}

export interface FrameRect { x: number; y: number; w: number; h: number }

export function frameRect(dir: Direction, frame: number, row: number): FrameRect {
  return { x: frameCol(dir, frame) * FRAME_W, y: row * FRAME_H, w: FRAME_W, h: FRAME_H };
}
```

- [ ] 실패 테스트 작성 후 `npx vitest run test/unit/spriteFrames.test.ts` (frames.ts 작성 전 FAIL 확인 → 작성 후 PASS):

```ts
import { describe, expect, it } from 'vitest';
import { frameRect, frameCol } from '../../src/web/pixi/sprites/frames.js';

describe('frameRect', () => {
  it('S 방향 0번 프레임은 원점', () => {
    expect(frameRect('S', 0, 0)).toEqual({ x: 0, y: 0, w: 32, h: 32 });
  });
  it('E 블록은 6열부터', () => {
    expect(frameRect('E', 2, 1)).toEqual({ x: 8 * 32, y: 32, w: 32, h: 32 });
  });
  it('N 블록은 12열부터, W 블록은 18열부터', () => {
    expect(frameCol('N', 5)).toBe(17);
    expect(frameCol('W', 0)).toBe(18);
  });
  it('프레임 인덱스는 0..5로 클램프', () => {
    expect(frameCol('S', 9)).toBe(5);
    expect(frameCol('S', -1)).toBe(0);
  });
});
```

- [ ] 커밋: `feat(web): MetroCity 시트 자산 + 프레임 좌표 모듈`

### Task 2: 공유 카탈로그 + 서버 저장/검증 재작성

**Files:**
- Rewrite: `src/shared/sprites.ts`
- Rewrite: `src/server/setup/sprites.ts`
- Modify: `src/server/index.ts` (sanitize 함수명 교체)
- Test: `test/unit/spriteAppearance.test.ts`

**Interfaces:**
- Produces: `SpritePartRef {sheet,row}`, `CharacterAppearance {skin, hair, outfit}`, `AppearanceDoc`, `SKIN_COUNT`, `HAIR_SHEETS`, `OUTFIT_SHEETS`, `DEFAULT_APPEARANCES`, `isValidAppearance(a)`, 서버 `loadSprites(): Promise<AppearanceDoc>`, `saveSprites(doc)`, `sanitizeAppearanceDoc(input): AppearanceDoc | null`

- [ ] `src/shared/sprites.ts` 전면 교체:

```ts
import type { CharacterId } from './character.js';

/** 스프라이트 조합 파트 참조 — sheet는 카탈로그 키, row는 시트 내 행. */
export interface SpritePartRef { sheet: string; row: number }

export interface CharacterAppearance {
  /** 몸통 시트 행(피부톤) 0..SKIN_COUNT-1 */
  skin: number;
  /** null = 민머리 */
  hair: SpritePartRef | null;
  /** null = 기본(속옷) */
  outfit: SpritePartRef | null;
}

export type AppearanceDoc = Partial<Record<CharacterId, CharacterAppearance>>;

export const SKIN_COUNT = 6;
export const HAIR_SHEETS: Readonly<Record<string, number>> = { hairs: 8, 'hair-gold': 5 };
export const OUTFIT_SHEETS: Readonly<Record<string, number>> = {
  suit: 4, suit1: 5, outfit1: 1, outfit2: 1, outfit3: 1, outfit4: 1, outfit5: 1, outfit6: 1,
};

function isValidPart(ref: SpritePartRef | null, sheets: Readonly<Record<string, number>>): boolean {
  if (ref === null) return true;
  if (!ref || typeof ref !== 'object') return false;
  const rows = sheets[ref.sheet];
  return rows !== undefined && Number.isInteger(ref.row) && ref.row >= 0 && ref.row < rows;
}

export function isValidAppearance(a: CharacterAppearance): boolean {
  return !!a && typeof a === 'object'
    && Number.isInteger(a.skin) && a.skin >= 0 && a.skin < SKIN_COUNT
    && isValidPart(a.hair ?? null, HAIR_SHEETS)
    && isValidPart(a.outfit ?? null, OUTFIT_SHEETS);
}

/** 에이전트별 기본 외모 — 서로 구분되는 조합. */
export const DEFAULT_APPEARANCES: Record<CharacterId, CharacterAppearance> = {
  'team-lead':          { skin: 0, hair: { sheet: 'hairs', row: 0 }, outfit: { sheet: 'suit', row: 0 } },
  'planner-researcher': { skin: 1, hair: { sheet: 'hair-gold', row: 0 }, outfit: { sheet: 'suit1', row: 2 } },
  'tester':             { skin: 2, hair: { sheet: 'hairs', row: 2 }, outfit: { sheet: 'outfit1', row: 0 } },
  'debugger':           { skin: 3, hair: { sheet: 'hairs', row: 6 }, outfit: { sheet: 'suit', row: 1 } },
  'code-reviewer':      { skin: 4, hair: { sheet: 'hairs', row: 3 }, outfit: { sheet: 'suit1', row: 0 } },
  'docs-manager':       { skin: 5, hair: { sheet: 'hairs', row: 1 }, outfit: { sheet: 'outfit4', row: 0 } },
};
```

- [ ] `src/server/setup/sprites.ts` 전면 교체:

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { ALL_CHARACTER_IDS, type CharacterId } from '../../shared/character.js';
import { isValidAppearance, type AppearanceDoc, type CharacterAppearance } from '../../shared/sprites.js';

const OVERRIDES_DIR = path.join(homedir(), '.claude-office');
const SPRITES_FILE = path.join(OVERRIDES_DIR, 'sprites.json');

/** PUT 바디 전체 검증. 형식이 어긋나면 null (구버전 픽셀 오버라이드 문서 포함). */
export function sanitizeAppearanceDoc(input: unknown): AppearanceDoc | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: AppearanceDoc = {};
  for (const [id, entry] of Object.entries(input as Record<string, unknown>)) {
    if (!ALL_CHARACTER_IDS.includes(id as CharacterId)) return null;
    const a = entry as CharacterAppearance;
    if (!isValidAppearance(a)) return null;
    out[id as CharacterId] = { skin: a.skin, hair: a.hair ?? null, outfit: a.outfit ?? null };
  }
  return out;
}

export async function loadSprites(): Promise<AppearanceDoc> {
  try {
    const raw = await readFile(SPRITES_FILE, 'utf8');
    return sanitizeAppearanceDoc(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

export async function saveSprites(doc: AppearanceDoc): Promise<string> {
  await mkdir(OVERRIDES_DIR, { recursive: true });
  await writeFile(SPRITES_FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return SPRITES_FILE;
}
```

- [ ] `src/server/index.ts`: `sanitizeSpriteOverrides` import/호출을 `sanitizeAppearanceDoc`으로 교체 (엔드포인트·브로드캐스트 로직 불변).

- [ ] 테스트 `test/unit/spriteAppearance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sanitizeAppearanceDoc } from '../../src/server/setup/sprites.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';
import { DEFAULT_APPEARANCES, isValidAppearance } from '../../src/shared/sprites.js';

describe('sanitizeAppearanceDoc', () => {
  it('유효한 문서를 통과시킨다', () => {
    const doc = { 'team-lead': { skin: 2, hair: { sheet: 'hairs', row: 7 }, outfit: null } };
    expect(sanitizeAppearanceDoc(doc)).toEqual(doc);
  });
  it('skin 범위 초과 거부', () => {
    expect(sanitizeAppearanceDoc({ tester: { skin: 6, hair: null, outfit: null } })).toBeNull();
  });
  it('모르는 시트/행 초과 거부', () => {
    expect(sanitizeAppearanceDoc({ tester: { skin: 0, hair: { sheet: 'nope', row: 0 }, outfit: null } })).toBeNull();
    expect(sanitizeAppearanceDoc({ tester: { skin: 0, hair: null, outfit: { sheet: 'suit', row: 4 } } })).toBeNull();
  });
  it('모르는 캐릭터 id 거부', () => {
    expect(sanitizeAppearanceDoc({ ghost: { skin: 0, hair: null, outfit: null } })).toBeNull();
  });
  it('구버전 픽셀 오버라이드 문서 거부', () => {
    expect(sanitizeAppearanceDoc({ bodies: { stand: [] } })).toBeNull();
  });
});

describe('DEFAULT_APPEARANCES', () => {
  it('모든 캐릭터가 유효한 기본 외모를 가진다', () => {
    for (const id of ALL_CHARACTER_IDS) expect(isValidAppearance(DEFAULT_APPEARANCES[id])).toBe(true);
  });
});
```

- [ ] `npx vitest run test/unit/spriteAppearance.test.ts` PASS 확인, 커밋: `feat: 스프라이트 조합(AppearanceDoc) 공유 카탈로그 + 서버 검증`

### Task 3: 웹 합성 엔진 재작성 (sheets/compose/atlas/types) + 구 도트 파일 삭제

**Files:**
- Create: `src/web/pixi/sprites/sheets.ts`
- Rewrite: `src/web/pixi/sprites/types.ts`, `compose.ts`, `atlas.ts`
- Rewrite: `src/web/components/PixelAvatar.tsx`
- Delete: `src/web/pixi/sprites/{bodyPoses,heads,faces,accessories,palettes}.ts`, `src/web/views/SpriteEditorScreen.tsx`
- Modify: `src/web/App.tsx` (loadSheets 게이팅 + setAppearances)

**Interfaces:**
- Consumes: Task 1 `frames.ts`, Task 2 shared 카탈로그
- Produces: `loadSheets(): Promise<void>`, `getSheet(name): HTMLImageElement`, `composeFrame(a: CharacterAppearance, pose: PoseKey): HTMLCanvasElement`, `setAppearances(doc)`, `getAppearance(char): CharacterAppearance`, `buildAtlas()/invalidateAtlas()` (API 불변), `PoseKey = stand-D | walk1..6-D | sit | type1 | type2`, `SPRITE_W/H = 32`

- [ ] `types.ts`:

```ts
export { FRAME_W as SPRITE_W, FRAME_H as SPRITE_H } from './frames.js';
export type { Direction } from './frames.js';
import type { Direction } from './frames.js';

export type PoseKey =
  | `stand-${Direction}`
  | `walk${1 | 2 | 3 | 4 | 5 | 6}-${Direction}`
  | 'sit' | 'type1' | 'type2';

const DIRS: Direction[] = ['S', 'N', 'E', 'W'];
export const ALL_POSES: PoseKey[] = [
  ...DIRS.map((d) => `stand-${d}` as PoseKey),
  ...([1, 2, 3, 4, 5, 6] as const).flatMap((n) => DIRS.map((d) => `walk${n}-${d}` as PoseKey)),
  'sit', 'type1', 'type2',
];

/** 포즈 → 시트 프레임 매핑. 앉기/타이핑 전용 프레임이 없어 stand-S로 대체, type2만 1px 아래. */
export function poseToFrame(pose: PoseKey): { dir: Direction; frame: number; yOff: number } {
  if (pose === 'sit' || pose === 'type1') return { dir: 'S', frame: 0, yOff: 0 };
  if (pose === 'type2') return { dir: 'S', frame: 0, yOff: 1 };
  const [kind, dir] = pose.split('-') as [string, Direction];
  if (kind === 'stand') return { dir, frame: 0, yOff: 0 };
  return { dir, frame: Number(kind.slice(4)) - 1, yOff: 0 };
}
```

- [ ] `sheets.ts` (URL import는 vite가 처리; `.png` 모듈 선언이 없으면 `src/web/vite-env.d.ts`에 `/// <reference types="vite/client" />` 추가):

```ts
import bodyUrl from '../../assets/metrocity/body.png';
import shadowUrl from '../../assets/metrocity/shadow.png';
import hairsUrl from '../../assets/metrocity/hairs.png';
import hairGoldUrl from '../../assets/metrocity/hair-gold.png';
import suitUrl from '../../assets/metrocity/suit.png';
import suit1Url from '../../assets/metrocity/suit1.png';
import outfit1Url from '../../assets/metrocity/outfit1.png';
import outfit2Url from '../../assets/metrocity/outfit2.png';
import outfit3Url from '../../assets/metrocity/outfit3.png';
import outfit4Url from '../../assets/metrocity/outfit4.png';
import outfit5Url from '../../assets/metrocity/outfit5.png';
import outfit6Url from '../../assets/metrocity/outfit6.png';

const SHEET_URLS: Record<string, string> = {
  body: bodyUrl, shadow: shadowUrl, hairs: hairsUrl, 'hair-gold': hairGoldUrl,
  suit: suitUrl, suit1: suit1Url,
  outfit1: outfit1Url, outfit2: outfit2Url, outfit3: outfit3Url,
  outfit4: outfit4Url, outfit5: outfit5Url, outfit6: outfit6Url,
};

const loaded = new Map<string, HTMLImageElement>();

export async function loadSheets(): Promise<void> {
  await Promise.all(Object.entries(SHEET_URLS).map(([name, url]) =>
    new Promise<void>((resolve, reject) => {
      if (loaded.has(name)) return resolve();
      const img = new Image();
      img.onload = () => { loaded.set(name, img); resolve(); };
      img.onerror = () => reject(new Error(`스프라이트 시트 로드 실패: ${name}`));
      img.src = url;
    })));
}

export function getSheet(name: string): HTMLImageElement {
  const img = loaded.get(name);
  if (!img) throw new Error(`시트가 로드되지 않음: ${name}`);
  return img;
}
```

- [ ] `compose.ts` 재작성 (문자 매트릭스 제거):

```ts
import type { CharacterId } from '../../../shared/character.js';
import { DEFAULT_APPEARANCES, isValidAppearance, type AppearanceDoc, type CharacterAppearance } from '../../../shared/sprites.js';
import { FRAME_H, FRAME_W, frameRect } from './frames.js';
import { getSheet } from './sheets.js';
import { poseToFrame, type PoseKey } from './types.js';

let activeDoc: AppearanceDoc = {};
export function setAppearances(doc: AppearanceDoc | null | undefined): void { activeDoc = doc ?? {}; }
export function getAppearance(char: CharacterId): CharacterAppearance {
  const a = activeDoc[char];
  return a && isValidAppearance(a) ? a : DEFAULT_APPEARANCES[char];
}

/** 그림자 → 몸통(피부) → 의상 → 헤어 순서로 32×32 캔버스에 합성. */
export function composeFrame(a: CharacterAppearance, pose: PoseKey): HTMLCanvasElement {
  const { dir, frame, yOff } = poseToFrame(pose);
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('compose: 2D context unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getSheet('shadow'), 0, 0);
  const layers: Array<{ sheet: string; row: number }> = [{ sheet: 'body', row: a.skin }];
  if (a.outfit) layers.push(a.outfit);
  if (a.hair) layers.push(a.hair);
  for (const { sheet, row } of layers) {
    const r = frameRect(dir, frame, row);
    ctx.drawImage(getSheet(sheet), r.x, r.y, r.w, r.h, 0, yOff, r.w, r.h);
  }
  return canvas;
}

export function composeSprite(char: CharacterId, pose: PoseKey): HTMLCanvasElement {
  return composeFrame(getAppearance(char), pose);
}
```

- [ ] `atlas.ts`: `composeSprite`가 canvas를 반환하므로 `Texture.from(canvas)`만 수행하도록 축약 (`invalidateAtlas`/`buildAtlas` API 유지, 캐시 키 `${char}|${pose}` 유지).

- [ ] `PixelAvatar.tsx` 재작성 — canvas 렌더:

```tsx
import { useEffect, useRef } from 'react';
import type { CharacterId } from '../../shared/character.js';
import { composeSprite } from '../pixi/sprites/compose.js';
import { SPRITE_H, SPRITE_W } from '../pixi/sprites/types.js';
import type { PoseKey } from '../pixi/sprites/types.js';

export function PixelAvatar({ id, size = 48, pose = 'stand-S' }: { id: CharacterId; size?: number; pose?: PoseKey }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
    try { ctx.drawImage(composeSprite(id, pose), 0, 0); } catch { /* 시트 미로드 */ }
  });
  return (
    <canvas ref={ref} width={SPRITE_W} height={SPRITE_H} className="pixel-avatar"
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }} />
  );
}
```

- [ ] `App.tsx`: `loadSheets()` 완료 전 오피스 레이아웃 미마운트(`sheetsReady` state, 실패 시 에러 문구), `/config/sprites` fetch 콜백을 `setAppearances(doc)`로 교체.
- [ ] 삭제: `bodyPoses.ts, heads.ts, faces.ts, accessories.ts, palettes.ts, SpriteEditorScreen.tsx` 후 `grep -rn "bodyPoses\|HEADS\|FACES\|ACCESSORIES\|PALETTES\|SpriteEditor\|composeSpriteWith\|effectiveLayers\|setSpriteOverrides" src/` 로 잔존 참조 0 확인.
- [ ] `npx tsc -p tsconfig.web.json --noEmit` + `npm run build:web` 통과, 커밋: `feat(web): MetroCity 시트 합성 엔진으로 교체`

### Task 4: CharacterSprite 6프레임 걷기 + 스케일

**Files:**
- Modify: `src/web/pixi/CharacterSprite.ts`

**Interfaces:**
- Consumes: `PoseKey`(walk1..6), atlas API 불변

- [ ] `PIXEL_SCALE`을 3으로 변경 (주석 갱신: 32×3=96, 이름표 오프셋 불변).
- [ ] `frame: 0|1` → `frame: number`; `currentPose()`에서 walking은 `walk${frame+1}-${dir}`, typing은 `frame % 2 === 0 ? 'type1' : 'type2'`.
- [ ] `tick()` 프레임 전진을 `this.frame = (this.frame + 1) % (this.animState === 'walking' ? 6 : 2)`로.
- [ ] `moveTo()`의 `this.frame = 0` 유지. 빌드 확인 후 커밋: `feat(web): 6프레임 걷기 사이클 + 32px 스프라이트 스케일`

### Task 5: 설정창 외모(조합) 에디터

**Files:**
- Create: `src/web/components/AppearanceEditor.tsx`
- Modify: `src/web/views/SettingsScreen.tsx`, `src/web/styles.css`(또는 기존 CSS 파일)

**Interfaces:**
- Consumes: `composeFrame`, `getSheet`, `frameRect`, 카탈로그, `PUT /config/sprites`
- Produces: `<AppearanceEditor charId value onChange />` — 저장은 SettingsScreen이 문서 전체 PUT

- [ ] `AppearanceEditor.tsx`: 피부 6 스와치 + 헤어(없음+13) + 의상(없음+15) 썸네일 그리드(각 시트 행의 stand-S 프레임을 32×32 canvas에 그림), 미리보기 4방향 + walk 애니메이션(160ms interval, walk1..6-S).
- [ ] `SettingsScreen.tsx`: 마운트 시 `/config/sprites` fetch → `AppearanceDoc` state(기본값 병합), 행마다 "외모" 토글 버튼 → 해당 행 아래 AppearanceEditor 확장. SAVE ALL 시 이름 PATCH와 함께 문서 전체 `PUT /config/sprites`, 성공 시 `setAppearances(doc)` + `invalidateAtlas()` + `bumpSpritesVersion()`.
- [ ] CSS: `.appearance-editor`, `.part-grid`, `.part-thumb(.active)`, `.appearance-preview` 추가 — 기존 settings 패널 톤 유지.
- [ ] 빌드 통과, 커밋: `feat(web): 캐릭터 설정창 스프라이트 조합 에디터`

### Task 6: 통합 검증

- [ ] `npm run test` 전체 PASS, `npm run build` 성공.
- [ ] dev 서버 기동(`npm run dev` 백그라운드) 후 Chrome DevTools MCP로 접속:
  - 씬에서 6캐릭터가 MetroCity 스프라이트로 렌더되는지 스크린샷 확인
  - 이동 중 E/W 방향이 진행 방향과 일치하는지 확인 (불일치 시 frames.ts의 E/W 블록 스왑)
  - 설정창에서 파트 변경 → 저장 → 씬·카드 즉시 반영 확인
- [ ] README의 스프라이트 편집 관련 문구가 있으면 갱신.
- [ ] 최종 커밋 + 계획 문서 체크박스 갱신.
