# 유휴(배회) 잡담 멘트 설계

날짜: 2026-07-26

## 목표

idle 상태 캐릭터가 배회할 때 아무 말도 하지 않아 어색하다. idle에서도
이따금 잡담 말풍선이 뜨게 한다.

## 현황

- `src/server/dialogue/ambient.ts`: `TALKATIVE = ['working','thinking','blocked','error']`
  상태에서만 3.2~6초 간격으로 발화. idle은 `nextAt`을 지우고 침묵.
- 대사 풀: `config/dialogue/<characterId>.json`의
  `{ "eventType": "ambient", "status": ... }` 항목. idle 항목은 없음.
- 말풍선(lastLine)은 WS로 브로드캐스트되어 씬에서 캐릭터 위치를 따라다닌다 —
  배회 중에도 표시엔 문제 없음.

## 변경

### ambient.ts — idle 전용 느린 케이던스

- idle을 두 번째 발화 그룹으로 추가. 활동 상태의 3~6초 케이던스와 분리해
  `idleMinGapMs`(기본 20000) + `idleJitterMs`(기본 25000) 간격으로 발화.
- idle 진입 후 첫 발화는 8000 + random×12000 ms 뒤 — 배회 시작(15~60초)과
  겹치는 시간대라 걷는 중/직후 잡담처럼 보인다.
- 상태가 활동↔idle로 바뀌면 해당 상태 케이던스로 due를 다시 잡는다
  (구현: 상태 그룹이 바뀌면 nextAt 재설정).
- 'off'와 'done'은 지금처럼 침묵.

### config/dialogue/*.json — idle 잡담 풀

6개 캐릭터 각각 `{ "eventType": "ambient", "status": "idle" }` 항목 1개,
성격에 맞는 잡담 템플릿 8개 안팎 (커피·산책·스트레칭·모니터 구경 등,
슬롯 변수는 {done}/{calls} 정도만 선택적으로 사용).

## 테스트

- `test/unit/ambientDialogue.test.ts`
  - 기존 "stays silent for idle characters" 테스트를 교체: idle 풀이 있으면
    idle 케이던스 경과 후 발화한다.
  - idle 풀이 없는 캐릭터는 여전히 침묵.
  - off 상태는 발화하지 않는다.
- 수동: dev 서버에서 idle 캐릭터 말풍선 확인.
