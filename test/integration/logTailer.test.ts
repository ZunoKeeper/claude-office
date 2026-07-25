import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLogTailer } from '../../src/server/logTailer.js';

describe('logTailer', () => {
  let dir = '';
  let tailer: ReturnType<typeof createLogTailer> | undefined;
  afterEach(async () => { await tailer?.stop(); await rm(dir, { recursive: true, force: true }); });

  it('emits lines from new jsonl files as they are appended', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cm-tail-'));
    const projDir = path.join(dir, 'projects', 'p1');
    await mkdir(projDir, { recursive: true });
    const file = path.join(projDir, 'session.jsonl');
    await writeFile(file, '{"session_id":"s1","first":1}\n');

    const lines: unknown[] = [];
    tailer = createLogTailer(dir, (_sid, raw) => lines.push(raw));
    await tailer.start();
    await new Promise((r) => setTimeout(r, 200));

    await appendFile(file, '{"session_id":"s1","second":2}\n');
    await new Promise((r) => setTimeout(r, 300));

    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[lines.length - 1]).toMatchObject({ second: 2 });
  });
});
