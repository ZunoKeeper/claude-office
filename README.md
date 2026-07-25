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

## Known v1 Debt

다음 항목은 v1 범위에서 제외되었으며 v1.1에서 처리 예정입니다.

- **Playwright E2E 스모크 테스트**: 스펙 §10의 4개 시나리오(온보딩, hook→카드, view 토글, WS 재접속)는 v1.1로 이월. v1에서는 vitest 단위/통합 테스트(48개)로 커버.
- **캐릭터 스프라이트 업그레이드**: v1은 프로그래매틱 스프라이트(도형 기반) 사용. v1.1에서 chibi 스타일 SVG 또는 폰트 리치 아트로 대체 예정.
- **npm audit high 취약점**: Fastify 4의 transitive dep(`find-my-way`)에서 high-severity 경고 존재. Fastify 5로 업그레이드 시 자연 해소 예정 (v1.1 트랙).
