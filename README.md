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

## Roadmap

- M1: 백엔드 이벤트 파이프라인 ✅
- M2: 그리드 대시보드 MVP
- M3: 아이소메트릭 오피스
- M4: 재생·온보딩·폴리시
