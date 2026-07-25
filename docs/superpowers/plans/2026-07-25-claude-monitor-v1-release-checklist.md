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
