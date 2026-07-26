# Cross-Platform Setup & Volta 기반 Node 관리 — Design

날짜: 2026-07-26
상태: 승인됨

## 목적

새 머신에서 이 저장소를 clone한 직후 스크립트 한 번 실행으로 개발 환경 셋업이 끝나야 한다.
Node 버전은 Volta로 프로젝트에 고정(pin)하며, Linux/macOS와 Windows(PowerShell) 모두에서
동일한 결과를 보장한다. 또한 런타임 코드에 남아 있는 POSIX 전제를 제거해
멀티 플랫폼에서 환경에 맞게 동작하는 구조를 정립한다.

## 배경 (발견된 플랫폼 이슈)

- 이 프로젝트는 Linux에서 시작되어 POSIX 전제가 코드에 남아 있음.
- `src/server/index.ts`의 isMain 가드가 `file://${process.argv[1]}` 문자열 비교를 사용해
  Windows(백슬래시 경로)에서 서버가 시작되지 않던 버그 → `pathToFileURL` 비교로 수정됨(미커밋).
- `src/server/setup/installHooks.ts`의 hook 커맨드가 `'단일따옴표'`, `2>/dev/null`, `|| true` 등
  POSIX 셸 문법을 사용 → Windows에서 hook 실행 시 깨질 수 있음.

## 결정 사항

| 항목 | 결정 |
|---|---|
| Node 버전 관리 | Volta, `volta pin node@22` (Node 22 LTS, 정확 버전이 package.json `volta` 필드에 기록) |
| npm | Node 번들 버전 사용 (별도 pin 없음) |
| Volta 미설치 시 | 스크립트가 자동 설치 (Linux: 공식 curl 스크립트, Windows: winget). 실패 시 수동 설치 안내 후 종료 |
| 셋업 범위 | Volta 확보 → Node pin 적용 → `npm install` → `npm run build` → `npm test` → doctor 진단 리포트 |
| 스크립트 구조 | OS별 얇은 부트스트랩(`setup.sh` / `setup.ps1`) + 공용 Node 스크립트(`setup.mjs`) |
| hook 커맨드 | `process.platform` 기준으로 POSIX/Windows용 커맨드를 분기 생성 |

## 아키텍처

### 1. Node 버전 pin

- `volta pin node@22` 실행 결과(정확 버전)를 `package.json`의 `"volta"` 필드로 커밋.
- 기존 `engines.node >= 18.17`은 유지 (Volta 미사용자를 위한 최소 요건 명시).
- Volta 사용자는 프로젝트 디렉터리에 진입하면 자동으로 pin된 버전을 사용.

### 2. scripts/ 구성

셋업의 "Node 확보 전" 단계는 네이티브 셸이 필수이므로 OS별로 이중화하고,
"Node 확보 후" 로직은 크로스 플랫폼 Node 스크립트 하나로 위임한다.

```
scripts/
  setup.sh    # Linux/macOS 부트스트랩 (bash)
  setup.ps1   # Windows 부트스트랩 (PowerShell 5.1+ 호환)
  setup.mjs   # 공용 본체 (npm install → build → test → doctor)
```

**setup.sh** (Linux/macOS)
1. `volta` 커맨드 존재 확인. 없으면 `curl https://get.volta.sh | bash`로 설치.
2. 현재 셸 세션에 `VOLTA_HOME=$HOME/.volta`, `PATH=$VOLTA_HOME/bin:$PATH` 주입
   (설치 직후 프로필 재로드 없이 바로 사용하기 위함).
3. `package.json`에 `volta` 필드가 없으면 `volta pin node@22` 실행 (최초 1회, 이후엔 no-op).
4. `node scripts/setup.mjs` 실행 (PATH의 Volta 셔임을 통해 pin된 버전으로 실행됨) → 이후 공용 로직.
5. curl 부재 등 선행 조건 실패 시 명확한 에러 메시지와 수동 설치 URL 출력 후 비 0 종료.

**setup.ps1** (Windows)
1. `volta` 커맨드 존재 확인. 없으면 `winget install --id Volta.Volta` 시도.
   winget 부재/실패 시 https://docs.volta.sh/guide/getting-started 안내 후 비 0 종료.
2. winget 설치 직후 현재 세션 PATH에 Volta 경로가 없으므로, 레지스트리(User/Machine
   Environment)에서 PATH를 다시 읽어 현재 세션에 반영.
3. 이후 단계는 setup.sh와 동일 (pin 확인 → `node scripts/setup.mjs`).

**setup.mjs** (공용 본체)
- 단계형 러너: 각 단계 시작/성공/실패를 `[1/4] ...` 형태로 출력, 실패 시 어느 단계에서
  왜 실패했는지 표시하고 비 0 종료.
  1. `npm install`
  2. `npm run build`
  3. `npm test`
  4. doctor 리포트
- `--doctor-only` 플래그: 1~3을 건너뛰고 진단만 출력.
- doctor 점검 항목:
  - OS/플랫폼, 셸 정보
  - node/npm 실제 버전과 `package.json` volta pin 일치 여부
  - `curl` 실행 가능 여부 (hook 커맨드 의존)
  - `~/.claude` 디렉터리 존재 여부 (transcript tail 대상)
  - 4000(서버)/5173(Vite) 포트 점유 여부
  - 플랫폼별 주의사항 (예: Windows에서 hook은 cmd 문법 커맨드로 설치됨)

**package.json scripts 추가**
- `"setup": "node scripts/setup.mjs"` — Node 확보 후 재실행용
- `"doctor": "node scripts/setup.mjs --doctor-only"`

### 3. 런타임 멀티 플랫폼 대응

**installHooks.ts — hook 커맨드 플랫폼 분기**
- `claudeMonitorCommand(endpoint, event)`가 `process.platform === 'win32'` 여부로 분기:
  - POSIX: 기존과 동일 — `curl -sS -X POST <ep> -H 'X-CM-Event: <ev>' -H 'Content-Type: application/json' -d @- 2>/dev/null || true`
  - Windows(cmd): `curl -sS -X POST <ep> -H "X-CM-Event: <ev>" -H "Content-Type: application/json" -d @- 2>nul`
    (이중따옴표, `2>nul`, `|| true` 제거 — hook은 `async: true`라 실패해도 세션에 영향 없음)
- hooks는 설치된 머신에서만 실행되므로 설치 시점의 `process.platform` 판단이 안전.
- 중복 감지(`h.command === cmd`)는 기존 로직 그대로 동작 (같은 플랫폼에서는 항상 같은 문자열).
- 기왕 설치된 반대 플랫폼 커맨드의 마이그레이션은 범위 외 (재설치로 해결).

**index.ts — isMain 가드**
- 이미 적용된 `pathToFileURL(process.argv[1]).href === import.meta.url` 수정을 이 작업의
  일부로 커밋.

### 4. 문서

- README "설치" 섹션 갱신:
  - Linux/macOS: `bash scripts/setup.sh`
  - Windows: `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1`
  - Volta가 이미 있으면 `npm run setup`만으로도 동일 결과.

## 테스트 전략

- `mergeHooks`/`claudeMonitorCommand` 플랫폼 분기: 유닛 테스트에서 platform을 주입 가능한
  형태(파라미터 기본값 `process.platform`)로 만들어 win32/linux 두 케이스 모두 검증.
- `setup.mjs`의 doctor 점검 로직 중 순수 함수(버전 비교, pin 파싱)는 유닛 테스트.
- 부트스트랩 셸 스크립트는 자동 테스트 범위 외 — 실제 실행으로 수동 검증
  (이 Windows 머신에서 setup.ps1 전체 플로우 실행 확인).

## 범위 외 (YAGNI)

- macOS 전용 처리 (setup.sh가 macOS에서도 동작하지만 별도 검증은 하지 않음)
- CI 파이프라인 연동
- 기존에 설치된 hook 커맨드의 플랫폼 마이그레이션
- nvm/asdf 등 다른 버전 매니저 지원
