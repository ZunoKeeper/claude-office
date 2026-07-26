# GRID → OFFICE 통합 설계

날짜: 2026-07-26

## 목표

GRID 모드와 OFFICE 모드를 하나의 화면으로 통합한다. GRID에서만 보이던 캐릭터 상세
데이터(상태·현재 활동·모델·통계·티켓 큐)를 오피스 화면 오른쪽 사이드 패널로 올려
표시하고, GRID 모드와 상단 GRID/OFFICE 전환 버튼은 완전히 제거한다.

## 확정 사항

- 표시 방식: 오피스 캔버스 **상단에 가로로 상시 표시**되는 패널
  (초기 설계는 오른쪽 세로 + 컴팩트/클릭 확장이었으나, 사용자 피드백으로
  상단 가로 배치 + 전체 카드 상시 표시로 변경)
- 카드 형태: 기존 `CharacterCard` 전체를 항상 렌더 — 접이식/컴팩트 없음
- GRID 모드: `GridDashboard.tsx`, `ViewSwitcher.tsx` 및 App의 `view` state 삭제
- CapabilityStrip: 통합 화면 하단에 항상 표시 (기존엔 GRID에서만 표시)
- 레이아웃: flex 형제 배치 — 오버레이 아님

## 화면 구조

```
┌───────────────────────────────────┐
│ 캐릭터 패널 — 전체 카드 가로 나열      │
│ (grid auto-fill minmax 280px)     │
├───────────────────────────────────┤
│   오피스 캔버스 920px (중앙 정렬)     │
├───────────────────────────────────┤
│ CapabilityStrip (항상 표시)         │
├───────────────────────────────────┤
│ ► EventTicker                     │
└───────────────────────────────────┘
```

창 폭이 캔버스(920px)보다 좁으면 `app-main`에 가로 스크롤을 허용한다
(기존 `overflow-x: hidden` → `auto`). 카드가 한 줄에 다 안 들어가면
grid auto-fill로 여러 줄로 감싼다.

## 컴포넌트 변경

| 파일 | 변경 |
|------|------|
| `src/web/views/GridDashboard.tsx` | 삭제 |
| `src/web/views/ViewSwitcher.tsx` | 삭제 |
| `src/web/views/CharacterPanel.tsx` | 신규 — 전체 카드 가로 나열 |
| `src/web/App.tsx` | `view` state·전환 버튼 제거, 오피스+패널+CapabilityStrip 상시 렌더 |
| `src/web/components/CharacterCard.tsx` | 수정 없음 (확장 시 그대로 재사용) |
| `src/web/styles.css` | `.office-layout` flex, 패널·컴팩트 카드 스타일, `.grid-office` 제거 |

### CharacterPanel

- 캐릭터별 기존 `CharacterCard`를 항상 전체 렌더 (접이식 없음)
- props: `configs: CharacterConfig[]` (GridDashboard와 동일 패턴), 상태는
  `useCharacterStore`에서 구독

## 데이터 흐름

변경 없음. 패널도 기존 `useCharacterStore` + `configs` prop을 그대로 사용한다.
서버 변경 없음.

## 엣지 케이스

- config 로드 전/누락 캐릭터: GRID와 동일하게 empty state 카드 표시
- 온보딩 화면 분기는 유지 — 온보딩 중에는 패널·CapabilityStrip 미표시
- 오피스 좌석 티켓 칩(OfficeOverlay)과 패널 티켓 큐는 중복이지만 좌석 칩은 씬
  생동감 요소이므로 유지

## 검증

웹 UI 자동 테스트가 없으므로: `tsc` 타입체크 + Vite 빌드 + 브라우저 확인.
`GridDashboard`/`ViewSwitcher` 잔여 참조를 grep으로 확인.
