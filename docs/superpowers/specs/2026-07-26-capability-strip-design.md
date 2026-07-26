# GRID 뷰 Capability Strip — Design

날짜: 2026-07-26
상태: 승인됨

## 목적

GRID 뷰 하단에 현재 실행 환경의 능력치를 한눈에 보여주는 정보 스트립을 추가한다:
모델 리스트(일렬), Sub Agent 종류(담당 캐릭터별 카테고리), 활성 Skills(플러그인별 그룹), 활성 플러그인.

## 제약 및 배경

- Claude Code는 "선택 가능한 모델 목록"을 노출하는 API가 없음 → 정적 패밀리 목록
  (`/config/models`의 fable/opus/sonnet/haiku)을 기본으로 렌더하고, transcript에서
  관측된 실제 모델을 하이라이트하는 하이브리드로 결정.
- Sub Agent는 "둘 다": characterRouter의 `AGENT_TYPE_MAP`(8종) + `~/.claude/agents`,
  프로젝트 `.claude/agents`의 `*.md` 스캔 결과 병합.
- Skills/플러그인: `~/.claude/plugins/installed_plugins.json`(설치 목록·버전) ×
  `~/.claude/settings.json`의 `enabledPlugins`(활성 여부) 병합. 활성 플러그인의
  `installPath/skills/*/SKILL.md` + `~/.claude/skills` + 프로젝트 `.claude/skills` 스캔.
- 표시 위치는 GRID 뷰 안에만 (OFFICE 뷰 변경 없음).

## 아키텍처 (A안: 서버 집계 엔드포인트 + 웹 스트립)

### 서버 — `src/server/env/capabilities.ts` (신규)

순수 파서(유닛 테스트 대상)와 파일시스템 스캐너를 분리:

- `mergePlugins(installedRaw, enabledRaw): PluginInfo[]` — 두 JSON을 병합, enabled=true만.
  `{ name, marketplace, version, scope, installPath }`. 항목이 배열(다중 설치)이면 첫 항목.
- `parseSkillMd(content, fallbackName, source): SkillInfo` — frontmatter `name`/`description`
  파싱, 없으면 디렉터리명. `{ name, source, description? }`.
- `scanSkills(plugins, homeDir, projectDir)` — 활성 플러그인별 `skills/*/SKILL.md`(source=플러그인명),
  `~/.claude/skills`(user), `<project>/.claude/skills`(project).
- `collectAgentTypes(homeDir, projectDir): AgentTypeInfo[]` — `AGENT_TYPE_MAP`(export로 변경)
  → `{ type, characterId, builtin, source: 'router' }` + `.claude/agents/*.md` 스캔(user/project)
  병합. 스캔된 이름이 맵에 있으면 characterId 부여, 없으면 null. type 중복 시 router 우선.
- `collectCapabilities({ homeDir, projectDir, models }): Promise<Capabilities>` — 전체 조립.
  모든 파일 접근은 실패 시 해당 부분 빈 배열 (엔드포인트는 항상 200).

### 서버 — 엔드포인트

- `GET /env/capabilities` → `{ models: string[], agentTypes, skills, plugins }`.
- 서버 기동 시 1회 스캔해 캐시 (스킬/플러그인은 세션 중 거의 불변).
- vite proxy에 `^/env/.*` 추가.

### 웹 — `src/web/components/CapabilityStrip.tsx` (신규)

- 마운트 시 `/env/capabilities` 1회 fetch. 실패 시 스트립 미표시(null).
- 4개 행, 기존 픽셀 레트로 칩 스타일(`.model-badge` 톤)과 통일:
  - `MODELS`: 패밀리 칩 일렬. 카드들의 `currentModel`에 패밀리 문자열이 포함되면 live
    강조 + 정확한 모델 ID 툴팁.
  - `SUB AGENTS`: 담당 캐릭터 이름을 카테고리 라벨로 그룹핑 (미매핑은 `기타`).
    `agent.start` 이벤트에서 관측된 타입은 live 강조 — 이벤트 버퍼가 30개 롤링이므로
    컴포넌트 로컬 Set에 누적.
  - `SKILLS`: source(플러그인명|user|project)별 그룹, hover 시 description 툴팁.
  - `PLUGINS`: `이름 vX.Y.Z` 칩 (version 'unknown'이면 이름만).
- `GridDashboard`가 카드 그리드 아래에 렌더 (configs로 캐릭터 이름 전달).

## 에러 처리

- installed_plugins.json / settings.json 부재·파싱 실패 → plugins/skills 빈 배열.
- SKILL.md frontmatter 파싱 실패 → 디렉터리명만으로 표시.
- fetch 실패 → 스트립 렌더 안 함 (GRID 카드에는 영향 없음).

## 테스트

- 유닛: `mergePlugins`(enabled 필터, 다중 설치, 손상 입력), `parseSkillMd`(frontmatter
  유/무), `collectAgentTypes`(router 항목, 스캔 병합, 중복 우선순위) — fixture 문자열/임시 디렉터리.
- 통합: `/env/capabilities`가 200 + 4개 키 반환.

## 범위 외 (YAGNI)

- 스킬/플러그인 실시간 변경 감지, 활성 토글 UI
- OFFICE 뷰 표시
- MCP 서버 목록
