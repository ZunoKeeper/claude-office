# Cross-Platform Setup & Volta Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** clone 직후 스크립트 한 번으로 Volta 설치 → Node 22 pin → npm install → build → test → 환경 진단까지 끝나는 크로스 플랫폼(Windows/Linux) 셋업을 만들고, 런타임의 POSIX 전제(hook 커맨드)를 제거한다.

**Architecture:** OS별 얇은 부트스트랩(`scripts/setup.sh`, `scripts/setup.ps1`)이 Volta/Node 확보만 담당하고, 공용 로직은 `scripts/setup.mjs` 하나에 둔다. `installHooks.ts`의 hook 커맨드는 `process.platform` 분기로 POSIX/cmd 문법을 각각 생성한다.

**Tech Stack:** bash, PowerShell 5.1+, Node ESM(mjs), Volta, vitest

## Global Constraints

- Node pin: `volta pin node@22` (Node 22 LTS, npm은 번들 사용)
- `engines.node >= 18.17` 유지
- PowerShell 스크립트는 5.1 호환 (`&&`/`||` 체인 금지, ternary 금지)
- 스펙: `docs/superpowers/specs/2026-07-26-cross-platform-setup-design.md`
- 커밋 메시지 말미: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 미커밋 isMain 수정 커밋

**Files:**
- Modify: 없음 (워킹 트리에 이미 적용됨 — `src/server/index.ts`의 `pathToFileURL` 비교)

**Interfaces:**
- Consumes: 없음
- Produces: 이후 태스크가 깨끗한 워킹 트리에서 시작

- [ ] **Step 1: 테스트 전체 실행**

Run: `npm test`
Expected: 69 passed

- [ ] **Step 2: 커밋**

```bash
git add src/server/index.ts
git commit -m "fix(server): detect main-module via pathToFileURL so the server starts on Windows"
```

---

### Task 2: hook 커맨드 플랫폼 분기 (installHooks)

**Files:**
- Modify: `src/server/setup/installHooks.ts:23-25` (claudeMonitorCommand), `mergeHooks` 시그니처
- Test: `test/unit/installHooks.test.ts`

**Interfaces:**
- Produces: `claudeMonitorCommand(endpoint: string, eventName: string, platform?: NodeJS.Platform): string` (export),
  `mergeHooks(existing: unknown, endpoint: string, events: string[], platform?: NodeJS.Platform): SettingsJson`
  — platform 기본값은 `process.platform`. `installHooks()` 시그니처는 변경 없음.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/unit/installHooks.test.ts`에 추가

```ts
import { mergeHooks, claudeMonitorCommand } from '../../src/server/setup/installHooks.js';

describe('claudeMonitorCommand platform variants', () => {
  const endpoint = 'http://localhost:4000/hook';

  it('generates POSIX command on linux', () => {
    const cmd = claudeMonitorCommand(endpoint, 'SessionStart', 'linux');
    expect(cmd).toContain("-H 'X-CM-Event: SessionStart'");
    expect(cmd).toContain('2>/dev/null || true');
  });

  it('generates cmd-compatible command on win32', () => {
    const cmd = claudeMonitorCommand(endpoint, 'SessionStart', 'win32');
    expect(cmd).toContain('-H "X-CM-Event: SessionStart"');
    expect(cmd).toContain('2>nul');
    expect(cmd).not.toContain("'");
    expect(cmd).not.toContain('|| true');
  });

  it('mergeHooks embeds platform-appropriate command', () => {
    const out = mergeHooks({}, endpoint, ['SessionStart'], 'win32');
    const cmd = out.hooks!.SessionStart[0].hooks[0].command;
    expect(cmd).toContain('2>nul');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/unit/installHooks.test.ts`
Expected: FAIL — `claudeMonitorCommand` export 없음 / 인자 불일치

- [ ] **Step 3: 구현**

`src/server/setup/installHooks.ts`에서:

```ts
export function claudeMonitorCommand(
  endpoint: string,
  eventName: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    return `curl -sS -X POST ${endpoint} -H "X-CM-Event: ${eventName}" -H "Content-Type: application/json" -d @- 2>nul`;
  }
  return `curl -sS -X POST ${endpoint} -H 'X-CM-Event: ${eventName}' -H 'Content-Type: application/json' -d @- 2>/dev/null || true`;
}

export function mergeHooks(
  existing: unknown,
  endpoint: string,
  events: string[],
  platform: NodeJS.Platform = process.platform,
): SettingsJson {
  // 기존 본문 유지, claudeMonitorCommand(endpoint, ev) 호출만
  // claudeMonitorCommand(endpoint, ev, platform)으로 변경
}
```

기존 `function claudeMonitorCommand` (비export)는 위 export 버전으로 대체.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/unit/installHooks.test.ts`
Expected: PASS (기존 4개 + 신규 3개)

주의: 기존 테스트는 platform 인자 없이 호출하므로 이 머신(win32)에서는 win32 커맨드가 생성됨 — `'X-CM-Event: SessionStart'` 검색이 있는 기존 테스트(`preserves unrelated existing hooks`)의 `includes('X-CM-Event: SessionStart')`는 따옴표 없이 매치되므로 그대로 통과.

- [ ] **Step 5: 전체 테스트 + 커밋**

Run: `npm test` → all pass

```bash
git add src/server/setup/installHooks.ts test/unit/installHooks.test.ts
git commit -m "feat(setup): platform-aware hook commands (POSIX sh vs cmd)"
```

---

### Task 3: scripts/setup.mjs — 공용 셋업 본체 + doctor

**Files:**
- Create: `scripts/setup.mjs`
- Test: `test/unit/setupScript.test.ts`
- Modify: `package.json` (scripts에 `setup`, `doctor` 추가)

**Interfaces:**
- Produces (setup.mjs exports): `checkPinMatch(pinned: string|undefined, actual: string): {ok: boolean, reason?: string}`,
  `portInUse(port: number): Promise<boolean>`
- CLI: `node scripts/setup.mjs [--doctor-only]` — 단계 실패 시 비 0 종료

- [ ] **Step 1: 실패하는 테스트 작성** — `test/unit/setupScript.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import net from 'node:net';
import { checkPinMatch, portInUse } from '../../scripts/setup.mjs';

describe('checkPinMatch', () => {
  it('matches v-prefixed actual against pin', () => {
    expect(checkPinMatch('22.15.0', 'v22.15.0').ok).toBe(true);
  });
  it('fails on mismatch with reason', () => {
    const r = checkPinMatch('22.15.0', 'v24.13.0');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('24.13.0');
  });
  it('fails when no pin exists', () => {
    expect(checkPinMatch(undefined, 'v22.15.0').ok).toBe(false);
  });
});

describe('portInUse', () => {
  it('detects a listening port', async () => {
    const srv = net.createServer();
    await new Promise((res) => srv.listen(0, '127.0.0.1', () => res(null)));
    const port = (srv.address() as net.AddressInfo).port;
    expect(await portInUse(port)).toBe(true);
    await new Promise((res) => srv.close(() => res(null)));
    expect(await portInUse(port)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/unit/setupScript.test.ts`
Expected: FAIL — `scripts/setup.mjs` 없음

- [ ] **Step 3: 구현** — `scripts/setup.mjs` 전체:

```js
#!/usr/bin/env node
// 공용 셋업 본체: npm install → build → test → doctor.
// 부트스트랩(setup.sh/setup.ps1)이 Volta/Node 확보 후 호출한다.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkPinMatch(pinned, actual) {
  if (!pinned) return { ok: false, reason: 'package.json에 volta pin 없음' };
  const a = String(actual).replace(/^v/, '');
  if (a === pinned) return { ok: true };
  return { ok: false, reason: `node ${a} ≠ pin ${pinned}` };
}

export function portInUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    srv.once('listening', () => srv.close(() => resolve(false)));
    srv.listen(port, '127.0.0.1');
  });
}

function sh(command) {
  const r = spawnSync(command, { stdio: 'inherit', shell: true, cwd: ROOT });
  return r.status === 0;
}

function cmdOk(command) {
  const r = spawnSync(command, { shell: true, cwd: ROOT, stdio: 'ignore' });
  return r.status === 0;
}

async function doctor() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const pin = checkPinMatch(pkg.volta?.node, process.version);
  const lines = [
    `platform : ${process.platform} (${os.release()})`,
    `node     : ${process.version}${pin.ok ? ' — volta pin 일치' : ` — 주의: ${pin.reason}`}`,
    `npm      : ${(spawnSync('npm --version', { shell: true, cwd: ROOT, encoding: 'utf8' }).stdout ?? '').trim() || '확인 실패'}`,
    `volta    : ${cmdOk('volta --version') ? 'OK' : '없음 (scripts/setup.sh|ps1로 설치 권장)'}`,
    `curl     : ${cmdOk('curl --version') ? 'OK' : '없음 — hook 커맨드가 curl에 의존합니다'}`,
    `~/.claude: ${existsSync(path.join(homedir(), '.claude')) ? 'OK' : '없음 — transcript tail 대상이 없습니다 (Claude Code 첫 실행 후 생성)'}`,
    `port 4000: ${(await portInUse(4000)) ? '사용 중 — 서버가 이미 떠 있거나 다른 프로세스 점유' : '비어 있음'}`,
    `port 5173: ${(await portInUse(5173)) ? '사용 중 — Vite가 이미 떠 있거나 다른 프로세스 점유' : '비어 있음'}`,
  ];
  if (process.platform === 'win32') {
    lines.push('note     : Windows에서는 hook 커맨드가 cmd 문법(2>nul)으로 설치됩니다');
  }
  console.log('\n=== doctor ===');
  for (const l of lines) console.log('  ' + l);
}

async function main() {
  const doctorOnly = process.argv.includes('--doctor-only');
  if (!doctorOnly) {
    const steps = [
      ['npm install', 'npm install'],
      ['npm run build', 'npm run build'],
      ['npm test', 'npm test'],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [label, command] = steps[i];
      console.log(`\n[${i + 1}/${steps.length + 1}] ${label}`);
      if (!sh(command)) {
        console.error(`\nFAIL: "${label}" 단계에서 실패했습니다. 위 출력을 확인하세요.`);
        process.exit(1);
      }
    }
    console.log(`\n[${steps.length + 1}/${steps.length + 1}] 환경 진단`);
  }
  await doctor();
  if (!doctorOnly) console.log('\n셋업 완료. npm run dev 로 개발 서버를 시작하세요.');
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
```

`package.json` scripts에 추가:

```json
"setup": "node scripts/setup.mjs",
"doctor": "node scripts/setup.mjs --doctor-only"
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/unit/setupScript.test.ts`
Expected: PASS (4 tests)

Run: `npm run doctor`
Expected: doctor 리포트 출력, exit 0

- [ ] **Step 5: 전체 테스트 + 커밋**

```bash
git add scripts/setup.mjs test/unit/setupScript.test.ts package.json
git commit -m "feat(setup): shared cross-platform setup runner with doctor report"
```

---

### Task 4: scripts/setup.sh — Linux/macOS 부트스트랩

**Files:**
- Create: `scripts/setup.sh` (실행 비트: `git update-index --chmod=+x`)

**Interfaces:**
- Consumes: `scripts/setup.mjs` CLI
- Produces: `bash scripts/setup.sh` 단일 진입점

- [ ] **Step 1: 작성** — `scripts/setup.sh` 전체:

```bash
#!/usr/bin/env bash
# claude-office 초기 셋업 (Linux/macOS).
# Volta 확보 → Node 22 pin → 공용 셋업(scripts/setup.mjs) 실행.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl이 필요합니다. 패키지 매니저로 설치 후 다시 실행하세요." >&2
  exit 1
fi

if ! command -v volta >/dev/null 2>&1; then
  echo "[setup] Volta가 없어 설치합니다 (https://get.volta.sh)..."
  curl -fsSL https://get.volta.sh | bash
  export VOLTA_HOME="${VOLTA_HOME:-$HOME/.volta}"
  export PATH="$VOLTA_HOME/bin:$PATH"
fi

if ! command -v volta >/dev/null 2>&1; then
  echo "ERROR: Volta 설치에 실패했습니다. https://docs.volta.sh/guide/getting-started 참고 후 다시 실행하세요." >&2
  exit 1
fi

if ! grep -q '"volta"' package.json; then
  echo "[setup] Node 22 LTS를 프로젝트에 pin합니다..."
  volta pin node@22
fi

exec node scripts/setup.mjs "$@"
```

- [ ] **Step 2: 문법 검증** (이 머신은 Windows이므로 Git Bash로)

Run: `bash -n scripts/setup.sh`
Expected: 출력 없음, exit 0

- [ ] **Step 3: 실행 비트 + 커밋**

```bash
git add scripts/setup.sh
git update-index --chmod=+x scripts/setup.sh
git commit -m "feat(setup): Linux/macOS bootstrap script (Volta install + pin)"
```

---

### Task 5: scripts/setup.ps1 — Windows 부트스트랩

**Files:**
- Create: `scripts/setup.ps1`

**Interfaces:**
- Consumes: `scripts/setup.mjs` CLI
- Produces: `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1` 단일 진입점

- [ ] **Step 1: 작성** — `scripts/setup.ps1` 전체 (PowerShell 5.1 호환):

```powershell
# claude-office 초기 셋업 (Windows).
# Volta 확보 → Node 22 pin → 공용 셋업(scripts/setup.mjs) 실행.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Test-Command($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user;$env:Path"
  $voltaHome = [Environment]::GetEnvironmentVariable('VOLTA_HOME', 'Machine')
  if ($null -eq $voltaHome) { $voltaHome = [Environment]::GetEnvironmentVariable('VOLTA_HOME', 'User') }
  if ($null -ne $voltaHome) { $env:VOLTA_HOME = $voltaHome }
}

if (-not (Test-Command 'volta')) {
  Write-Host '[setup] Volta가 없어 winget으로 설치합니다...'
  if (-not (Test-Command 'winget')) {
    Write-Host 'ERROR: winget이 없습니다. https://docs.volta.sh/guide/getting-started 에서 Volta를 수동 설치한 뒤 다시 실행하세요.'
    exit 1
  }
  winget install --id Volta.Volta --accept-source-agreements --accept-package-agreements
  Update-SessionPath
}

if (-not (Test-Command 'volta')) {
  Write-Host 'ERROR: Volta 설치에 실패했습니다. 새 터미널에서 다시 시도하거나 수동 설치하세요: https://docs.volta.sh/guide/getting-started'
  exit 1
}

$pkg = Get-Content package.json -Raw
if ($pkg -notmatch '"volta"') {
  Write-Host '[setup] Node 22 LTS를 프로젝트에 pin합니다...'
  volta pin node@22
  if ($LASTEXITCODE -ne 0) { Write-Host 'ERROR: volta pin 실패'; exit 1 }
}

node scripts/setup.mjs @args
exit $LASTEXITCODE
```

- [ ] **Step 2: 문법 검증**

Run: `powershell -NoProfile -Command "[void][System.Management.Automation.PSParser]::Tokenize((Get-Content scripts/setup.ps1 -Raw), [ref]$null)"`
Expected: 에러 없음, exit 0

- [ ] **Step 3: 커밋**

```bash
git add scripts/setup.ps1
git commit -m "feat(setup): Windows bootstrap script (winget Volta install + pin)"
```

---

### Task 6: 실제 실행 검증 (이 머신, Windows) + volta pin 커밋

**Files:**
- Modify: `package.json` (`volta` 필드 — setup.ps1 실행이 기록)

**Interfaces:**
- Consumes: Task 3~5의 스크립트 전부

- [ ] **Step 1: 전체 플로우 실행**

Run: `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1`
Expected: Volta winget 설치 → `volta pin node@22` → npm install/build/test 전부 성공 → doctor 리포트 → "셋업 완료" 메시지, exit 0

주의: winget/네트워크 실패 시 에러 메시지 확인 후 수동 설치로 대체하고, 스크립트의 에러 경로가 안내를 제대로 출력했는지 기록.

- [ ] **Step 2: pin 결과 확인**

Run: `git diff package.json`
Expected: `"volta": { "node": "22.x.y" }` 필드 추가됨

- [ ] **Step 3: 커밋**

```bash
git add package.json
git commit -m "chore: pin Node 22 LTS via Volta"
```

---

### Task 7: README 갱신

**Files:**
- Modify: `README.md` "설치" 섹션 (7-12행)

- [ ] **Step 1: 설치 섹션 교체**

기존:

```markdown
## 설치

- 요구: Node.js 18.17 이상
- `npm install`
- `npm run build`
- `npm start` → http://localhost:4000 접속
```

교체:

```markdown
## 설치

clone 직후 아래 한 번이면 Volta 설치 → Node 22 pin → 의존성 설치 → 빌드 → 테스트 → 환경 진단까지 완료됩니다.

- **Linux/macOS**: `bash scripts/setup.sh`
- **Windows**: `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1`

이미 Volta(또는 Node 18.17+)가 있다면 `npm run setup`만으로 동일합니다.
환경 점검만 다시 보려면 `npm run doctor`.

실행: `npm start` → http://localhost:4000 접속
```

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: document one-shot cross-platform setup in README"
```
