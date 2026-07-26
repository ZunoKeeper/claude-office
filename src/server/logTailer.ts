import chokidar, { type FSWatcher } from 'chokidar';
import { createReadStream, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import ndjson from 'ndjson';
import path from 'node:path';

interface Options {
  rootDir: string;
  onLine: (sessionId: string, raw: unknown, filePath: string) => void;
}

interface Handle { start(): Promise<void>; stop(): Promise<void> }

export function createLogTailer(rootDir: string, onLine: Options['onLine']): Handle {
  let watcher: FSWatcher | undefined;
  const positions = new Map<string, number>();

  async function readFromPosition(file: string) {
    const st = await stat(file).catch(() => null);
    if (!st) return;
    const start = positions.get(file) ?? 0;
    if (st.size <= start) return;
    positions.set(file, st.size);
    await new Promise<void>((resolve) => {
      createReadStream(file, { start, end: st.size - 1 })
        .pipe(ndjson.parse({ strict: false }))
        .on('data', (obj: unknown) => {
          const sid = (obj as { session_id?: string; sessionId?: string })?.session_id
            ?? (obj as { sessionId?: string })?.sessionId
            ?? path.basename(file, '.jsonl');
          onLine(sid, obj, file);
        })
        .on('end', () => resolve())
        .on('error', () => resolve());
    });
  }

  return {
    async start() {
      watcher = chokidar.watch(path.join(rootDir, 'projects/**/*.jsonl'), {
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      });
      // 기동 시점에 이미 존재하던 transcript는 EOF에서부터 tail한다.
      // 히스토리를 재생하면 중단된 과거 세션의 tool_result 없는 Agent tool_use가
      // 고아 agent.start로 들어와 캐릭터 큐에 영구히 남는다.
      let initialScan = true;
      watcher.on('add', (f) => {
        if (initialScan) {
          try { positions.set(f, statSync(f).size); } catch { positions.set(f, 0); }
          return;
        }
        positions.set(f, 0);
        void readFromPosition(f);
      });
      watcher.on('change', (f) => void readFromPosition(f));
      await new Promise<void>((resolve) => {
        watcher!.once('ready', () => { initialScan = false; resolve(); });
      });
    },
    async stop() {
      await watcher?.close();
      watcher = undefined;
    },
  };
}
