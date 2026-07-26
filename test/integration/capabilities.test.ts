import { describe, it, expect, afterEach } from 'vitest';
import { startServer } from '../../src/server/index.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /env/capabilities', () => {
  it('returns models, agent types, skills, plugins', async () => {
    app = await startServer({ port: 0 });
    const res = await app.inject({ method: 'GET', url: '/env/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      models: string[];
      agentTypes: { type: string; characterId: string | null }[];
      skills: unknown[];
      plugins: unknown[];
    };
    expect(body.models).toContain('opus');
    expect(body.agentTypes.find((a) => a.type === 'Plan')?.characterId).toBe('planner-researcher');
    expect(Array.isArray(body.skills)).toBe(true);
    expect(Array.isArray(body.plugins)).toBe(true);
  });
});
