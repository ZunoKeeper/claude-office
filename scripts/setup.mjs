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
    lines.push('note     : hook 커맨드는 POSIX(sh) 문법으로 설치됩니다 — Claude Code가 Windows에서도 Git Bash로 훅을 실행');
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
