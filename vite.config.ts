import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Regex patterns (leading ^) require exact endpoint matches so client
      // paths like /hooks/useNow.ts don't collide with the /hook endpoint.
      '^/hook$': 'http://localhost:4000',
      '^/setup/.*': 'http://localhost:4000',
      '^/health$': 'http://localhost:4000',
      '^/config/.*': 'http://localhost:4000',
      '^/env/.*': 'http://localhost:4000',
      '^/replay/.*': 'http://localhost:4000',
      '/live': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
