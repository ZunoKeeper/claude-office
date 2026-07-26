# MetroCity 스프라이트 교체 + 조합 에디터 설계

날짜: 2026-07-26

## 목표

기존 절차적 도트(24×32 문자 매트릭스) 캐릭터를 `src/characters/MetroCity`의
32×32 스프라이트 시트 기반 합성으로 교체한다. 캐릭터 설정창(TEAM SETUP)에서
피부톤 × 헤어 × 의상 조합으로 캐릭터 외모를 만들고, 조합 결과를 에이전트
(CharacterId)별로 저장·적용한다.

## 스프라이트 시트 분석 결과

모든 시트는 32×32 프레임, 가로 24열(768px) 구성:

| 열 구간 | 방향 | 비고 |
|---------|------|------|
| 0–5 | S (정면) | 프레임 0 = 서기, 0–5 = 걷기 사이클 |
| 6–11 | E (오른쪽) | 픽셀 검증 완료 (눈·코가 오른쪽) |
| 12–17 | N (후면) | |
| 18–23 | W (왼쪽) | E 구간의 정확한 좌우 미러 (픽셀 diff=0) |

시트 목록(행 = 배리에이션):

- `CharacterModel/Character Model.png` — 몸통(피부톤) 6행
- `CharacterModel/Shadow.png` — 32×32 그림자 1프레임
- `Hairs.png` — 헤어 8행, `Hair.png` — 헤어(금발 계열) 5행
- `Suit.png` — 제복류 4행, `Suit1.png` — 캐주얼 5행, `Outfits/Outfit1~6.png` — 각 1행
- `Hair/HairN.png`(32×32 단일 프레임)는 미리보기용 중복 자산 — 사용하지 않음
  (썸네일은 시트의 0번 프레임에서 직접 그린다)

파트 합계: 피부 6종, 헤어 13종(8+5), 의상 15종(4+5+6).

앉기/타이핑 전용 프레임은 시트에 없다 → 앉기/타이핑은 정면 서기 프레임을
사용하고, 타이핑은 type2 프레임에서 1px 아래로 오프셋해 미세한 움직임을 준다
(기존 CharacterSprite 애니메이션 구조 유지).

## 아키텍처

### 자산 배치

`src/characters/MetroCity` → `src/web/assets/metrocity/`로 이동하고 공백 없는
이름으로 정리(`body.png`, `shadow.png`, `hairs.png`, `hair-gold.png`,
`suit.png`, `suit1.png`, `outfit1~6.png`). Vite root(`src/web`) 안에 있어야
dev/빌드 모두에서 URL import(`import url from './assets/...png'`)가 동작한다.

### 공유 타입·카탈로그 — `src/shared/sprites.ts` (전면 재작성)

기존 픽셀 오버라이드 타입을 제거하고 조합(appearance) 모델로 교체:

```ts
export interface SpritePartRef { sheet: string; row: number }
export interface CharacterAppearance {
  skin: number;                    // 0..5
  hair: SpritePartRef | null;      // null = 민머리
  outfit: SpritePartRef | null;    // null = 기본(속옷)
}
export type AppearanceDoc = Partial<Record<CharacterId, CharacterAppearance>>;
```

시트별 행 수를 서버·클라이언트가 공유하는 카탈로그
(`HAIR_SHEETS`, `OUTFIT_SHEETS`, `SKIN_COUNT`)로 정의하고, 6개 에이전트의
기본 외모(`DEFAULT_APPEARANCES`)를 서로 구분되는 조합으로 지정한다.

### 웹 렌더링 — `src/web/pixi/sprites/`

- `sheets.ts`(신규): 시트 URL 레지스트리 + `loadSheets()`(HTMLImageElement
  1회 로드, 시작 시 await) + `getSheet(name)`.
- `types.ts`: `SPRITE_W/H = 32`, PoseKey를
  `stand-D | walk1..6-D | sit | type1 | type2`로 확장(걷기 6프레임).
- `compose.ts`(재작성): `composeFrame(appearance, pose) → 32×32 canvas`.
  레이어 순서 그림자 → 몸통 → 의상 → 헤어. W 방향은 시트의 18–23열 사용
  (미러 프레임이 시트에 이미 있음). sit/type은 stand-S 프레임 매핑,
  type2는 y+1px. 문자 매트릭스·팔레트 개념 삭제.
- `atlas.ts`: API 유지(`buildAtlas`, `invalidateAtlas`). 캐릭터×포즈 텍스처를
  합성 canvas에서 생성. `setAppearances(doc)` 주입 방식은 기존
  `setSpriteOverrides` 패턴 그대로.
- 삭제: `bodyPoses.ts`, `heads.ts`, `faces.ts`, `accessories.ts`,
  `palettes.ts`, `SpriteEditorScreen.tsx`(도트 편집기 — 조합 에디터로 대체).
  `emotes.ts`는 독립적이므로 유지.

### CharacterSprite / 씬

- 걷기 프레임 카운터 0..5(6프레임 사이클), 타이핑은 type1/type2 유지.
- `PIXEL_SCALE = 3` (32×3 = 96px — 기존 48×64×1.5 = 72×96 풋프린트와 동일한
  높이·이름표 오프셋 `SPRITE_H*PIXEL_SCALE=96` 불변).
- 시트 로드는 비동기이므로 App에서 `loadSheets()` 완료 후 오피스 씬을 마운트.
- `spritesVersion` 재마운트 흐름(저장 → atlas 무효화 → 씬 재생성)은 그대로.

### PixelAvatar

SVG rect 방식 → 합성 canvas를 그리는 `<canvas>` 컴포넌트로 재작성.
카드·설정창 아바타가 새 스프라이트를 자동 반영.

### 서버 — `src/server/setup/sprites.ts` (재작성)

- 저장 파일: `~/.claude-office/sprites.json` (새 스키마 `AppearanceDoc`).
  구버전(픽셀 오버라이드) 파일은 스키마 불일치 시 무시하고 기본값으로 시작.
- `sanitizeAppearanceDoc`: 공유 카탈로그로 skin 범위·sheet id·row 범위 검증.
- 엔드포인트 유지: `GET/PUT /config/sprites` (index.ts는 사니타이저 교체만).

### 조합 에디터 — 캐릭터 설정창(SettingsScreen)

각 캐릭터 행에 "외모 편집" 토글 → 인라인 섹션 확장:

- 피부톤 6개 스와치(몸통 시트 0번 프레임 얼굴 크롭 썸네일)
- 헤어 13개 + "없음" 썸네일 그리드(각 시트 행의 0번 프레임)
- 의상 15개 + "없음" 썸네일 그리드
- 실시간 미리보기: 4방향 stand + 걷기 애니메이션 1개
- 저장 → `PUT /config/sprites` → 브로드캐스트/재취득 → 씬·아바타 즉시 반영
  (App.tsx의 기존 sprites fetch 흐름 재사용, 저장 성공 시
  `bumpSpritesVersion` 트리거)

## 에러 처리

- 시트 로드 실패: 콘솔 경고 + 해당 레이어 생략(몸통 실패 시 로딩 화면에서
  에러 문구). PUT 검증 실패는 400 유지.
- 저장 문서에 없는 캐릭터는 `DEFAULT_APPEARANCES`로 폴백.

## 테스트

- unit: `sanitizeAppearanceDoc` 유효/무효 케이스, 카탈로그 무결성
  (모든 sheet id·행 수 정합), 프레임 좌표 계산(`frameRect(dir, frame)`
  — 순수 함수, W 미러 열 포함).
- 수동 검증: dev 서버 기동 후 브라우저 스크린샷으로 방향(E/W)·조합 에디터·
  씬 반영 확인.

## 결정 사항 (기본값)

1. 도트 편집기(SpriteEditorScreen)는 제거하고 조합 에디터로 대체 —
   "지금의 캐릭터를 대체" 요청에 따름.
2. 걷기는 6프레임 풀 사이클 사용(품질 향상, 변경 폭 작음).
3. 앉기/타이핑은 정면 서기 프레임으로 대체(시트에 전용 프레임 없음).
4. 그림자(Shadow.png)를 프레임 합성 최하단 레이어로 포함.
