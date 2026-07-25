# 캐릭터 & 애니메이션 리워크 설계

**날짜**: 2026-07-26
**대상**: `src/web/pixi/CharacterSprite.ts`, `src/web/components/PixelAvatar.tsx`, 신규 `src/web/pixi/sprites/*`

## 목표

Kairosoft *Game Dev Story* 스타일을 벤치마크로, 현재의 정적 정면 뷰(16×20, `Graphics.rect()` 재렌더) 스프라이트를 **4방향 · 프레임 애니메이션 · 감정 이모트**를 갖춘 시스템으로 교체한다. "실제 게임에서 쓸 수 있는" 수준의 시각적 하한선을 확보한다.

## 사양 (확정)

- **해상도**: 24×32 (기존 16×20 대비 폭 1.5×, 높이 1.6×)
- **뷰**: 4방향 (S/N/E/W). 아이소메트릭 이동 시 8방향 중 가까운 4방향으로 스냅.
- **애니메이션 세트**
  - `stand` × 4방향 (기본 정지)
  - `walk1`, `walk2` × 4방향 (2프레임 걷기 사이클, 150ms/프레임)
  - `sit` (S 방향, 책상 근무)
  - `type1`, `type2` (앉은 상태 타이핑, 200ms/프레임)
  - **총 15 포즈** (공유 실루엣)
- **이모트**: `?`, `!`, `sweat`, `idea`, `heart` (12×12, 팝인/팝아웃 애니)
- **눈 깜빡임**: idle 상태에서 3~5초 간격, 80ms 감김

## 아키텍처: 레이어드 컴포지션

15 포즈 × 6 캐릭터 × 프레임 = 90+ 매트릭스를 매번 손으로 그리는 대신 **공유 실루엣 + 캐릭터별 오버레이**로 분리한다.

### 레이어 스택 (하 → 상)

1. **BODY_POSES** — 공유. `K`(윤곽), `F`(얼굴 살), `S`(셔츠), `P`(바지), `A`(팔), `T`(액센트). 15개.
2. **HEAD_OVERLAYS[char][dir]** — 캐릭터별 헤어. `H`(머리색), 방향별 4개.
3. **FACE_OVERLAYS[char]** — 눈·입·안경. 방향별로 옆·뒤에서는 눈 표시 방식 다름 (뒷모습은 눈 없음).
4. **ACCESSORY[char]** — 소품(안경, 넥타이, 책, 돋보기 등). 포즈별로 위치 오프셋.
5. **PALETTE[char]** — 실제 색상 매핑 (`H`, `S`, `T`, `A` 등에 hex 지정).

### 파일 배치

```
src/web/pixi/sprites/
  bodyPoses.ts       # 15개 공유 실루엣 (24×32)
  heads.ts           # 6×4 = 24개 헤어 오버레이
  faces.ts           # 눈/입/안경 오버레이
  accessories.ts     # 캐릭터별 소품
  palettes.ts        # 캐릭터별 색 팔레트
  emotes.ts          # 5개 12×12 이모트
  atlas.ts           # 매트릭스 → PIXI.Texture 프리렌더
  types.ts           # PoseKey, LayerSpec 타입
```

## 상태 머신 (CharacterSprite)

```
internal state: 'idle' | 'walking' | 'sitting' | 'typing'
external status: 'off' | 'idle' | 'thinking' | 'working' | 'blocked' | 'error' | 'done'
direction:      'N' | 'S' | 'E' | 'W'
emote:          null | '?' | '!' | 'sweat' | 'idea' | 'heart'
```

### 상태 매핑

| status    | anim state | emote     | 비고                                 |
|-----------|------------|-----------|--------------------------------------|
| off       | idle       | —         | alpha 0.4 회색화                     |
| idle      | idle       | —         | 서 있음, 눈 깜빡임                   |
| thinking  | sitting    | `?` pulse | 자리에 앉아 물음표                   |
| working   | typing     | —         | 타이핑 사이클                        |
| blocked   | sitting    | `sweat`   | 땀방울                               |
| error     | sitting    | `!`       | 빨간 느낌표                          |
| done      | sitting    | `idea` 2s → 사라짐 | 전구, 이후 idle                     |

이동 중 (`moveTo` 활성) → **무조건 walking으로 오버라이드**, 목적지 방향으로 dir 설정.

### 방향 결정

`moveTo(x, y)`: `dx = x - this.x`, `dy = y - this.y`. `abs(dx) > abs(dy)`면 `dx>0 ? 'E' : 'W'`, 아니면 `dy>0 ? 'S' : 'N'`.

## 렌더 파이프라인

### 현재 문제

`CharacterSprite.drawSprite()`는 생성 시 1회 실행이나 프레임 애니를 추가하면 매 프레임 `Graphics.clear() + rect()×768`이 6 캐릭터 × 60fps = 276k 콜/초. Pixi에서 벤치마크 없이도 명백한 낭비.

### 해결: Texture 프리렌더 + Sprite 스왑

앱 시작 시 `atlas.ts`가 6 캐릭터 × 15 포즈 = **90개 Texture**를 생성:

1. 오프스크린 `HTMLCanvasElement` (24×32 * PIXEL_SIZE) 생성
2. 레이어 스택 순서로 매트릭스 스캔 → 팔레트로 hex 조회 → `ctx.fillRect`
3. `Texture.from(canvas)` → 캐릭터/포즈 키로 저장

`CharacterSprite`는 `PIXI.Sprite` 하나만 들고 있고, 상태 변경 시 `sprite.texture = atlas.get(id, poseKey)`.

### 감정 이모트

별도 `PIXI.Sprite` 이모트가 헤드 위 y=-40 위치. 상태 진입 시:
- 팝인: scale 0 → 1.2 → 1.0 (100+100ms)
- 지속(pulse): idle 상태에선 sin(t)로 y=-40±2 흔들림
- 팝아웃: scale → 0 (200ms) 후 `.visible=false`

## 기존 코드 영향

- `CharacterSprite.ts`: **전면 재작성**. Graphics → Sprite + Emote 컨테이너.
- `PixelAvatar.tsx` (그리드 카드): 같은 매트릭스 데이터를 SVG로 렌더 유지. `stand-S` 포즈 + 캐릭터 오버레이 조합.
- `pixelData.ts`: 삭제. 신규 sprites/ 디렉토리로 이관.
- `OfficeScene.ts`: 스타트업 시 `await buildAtlas()` 추가. 이후 API는 그대로.

## 논-고얼 (YAGNI)

- 8방향, 대각선 별도 스프라이트: 4방향 스냅으로 충분.
- 걷기 3프레임 (중간): 2프레임(walk1↔walk2)이 Kairosoft 표준. 오버킬.
- 대화 프레임(입 벌림 애니): 말풍선이 이미 있음.
- 승리/좌절 특수 포즈: 이모트로 대체 가능.
- PNG 스프라이트시트 파이프라인: 매트릭스가 코드-diffable하고 리사이즈 자유.

## 검증 계획

1. `npm run dev` 후 브라우저에서 아이소메트릭 오피스 뷰 열기
2. 각 캐릭터 자리에서 상태별 애니 확인 (thinking/working/blocked/error/done)
3. 이동 트리거 (Bash, WebFetch 툴 활동 시뮬레이션) 시 walk cycle + 방향 전환 확인
4. 그리드 뷰 카드에서 정적 초상화가 이전과 동일하거나 개선됨 확인
5. `npm run test` 통과 (기존 테스트에 영향 없어야 함)

## 구현 순서

1. 타입 정의 (`types.ts`) + 팔레트 (`palettes.ts`)
2. 15개 공유 바디 포즈 (`bodyPoses.ts`)
3. 6×4 헤어 오버레이 (`heads.ts`)
4. 얼굴·소품 오버레이 (`faces.ts`, `accessories.ts`)
5. 아틀라스 빌더 (`atlas.ts`) — 여기서 시각 확인 가능
6. `CharacterSprite` 재작성 (상태 머신 + 이모트)
7. 5개 이모트 매트릭스 (`emotes.ts`)
8. `PixelAvatar.tsx` 신규 시스템 사용하도록 교체
9. `pixelData.ts` 삭제
10. 브라우저 수동 검증 + 커밋
