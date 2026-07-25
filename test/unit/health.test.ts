import { describe, it, expect, afterEach } from 'vitest';
import { startServer } from '../../src/server/index.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('server health', () => {
  it('responds to GET /health with { ok: true }', async () => {
    app = await startServer({ port: 0 });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
