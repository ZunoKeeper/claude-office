# Claude Monitor

Claude Code 서브에이전트를 "중소기업 외주 개발팀" 캐릭터로 시각화하는 로컬 대시보드.

## 개발 (M1 완료 시점)

- 요구: Node.js 20 이상
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
