import chokidar, { type FSWatcher } from 'chokidar';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import ndjson from 'ndjson';
import path from 'node:path';

interface Options { rootDir: string; onLine: (sessionId: string, raw: unknown) => void }

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
          const sid = (obj as { session_id?: string })?.session_id ?? path.basename(file, '.jsonl');
          onLine(sid, obj);
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
      watcher.on('add', (f) => {
        positions.set(f, 0);
        void readFromPosition(f);
      });
      watcher.on('change', (f) => void readFromPosition(f));
    },
    async stop() {
      await watcher?.close();
      watcher = undefined;
    },
  };
}
