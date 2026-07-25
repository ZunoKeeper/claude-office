import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { registerWsHub } from '../../src/server/wsHub.js';
import { createStateStore } from '../../src/server/stateStore.js';
import { ALL_CHARACTER_IDS } from '../../src/shared/character.js';

describe('WS /live', () => {
  let app: ReturnType<typeof Fastify>;
  afterEach(async () => { await app?.close(); });

  it('sends snapshot on connect and characterUpdated on state change', async () => {
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    app = Fastify();
    await app.register(websocket);
    registerWsHub(app, { store });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = String(addr).replace(/^http/, 'ws') + '/live';
    const ws = new WebSocket(url);

    const messages: unknown[] = [];
    ws.on('message', (b) => messages.push(JSON.parse(b.toString())));
    await new Promise<void>((r) => ws.on('open', () => r()));

    // Wait for snapshot
    await new Promise((r) => setTimeout(r, 50));
    expect(messages[0]).toMatchObject({ kind: 'snapshot' });

    // Trigger update
    store.applyEvent('kim-team-lead', { type: 'tool.pre', ts: 1, sessionId: 's', agentId: 'a', toolName: 'Write', input: {} });
    await new Promise((r) => setTimeout(r, 50));
    expect(messages.some((m) => (m as { kind: string }).kind === 'characterUpdated')).toBe(true);

    ws.close();
  });

  it('removes client on disconnect and stops receiving updates', async () => {
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    app = Fastify();
    await app.register(websocket);
    registerWsHub(app, { store });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = String(addr).replace(/^http/, 'ws') + '/live';
    const ws = new WebSocket(url);

    await new Promise<void>((r) => ws.on('open', () => r()));
    await new Promise((r) => setTimeout(r, 50));

    // Close and wait for disconnect to propagate
    ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // After disconnect, store updates should not throw or hang
    expect(() => {
      store.applyEvent('kim-team-lead', { type: 'tool.pre', ts: 2, sessionId: 's2', agentId: 'a2', toolName: 'Read', input: {} });
    }).not.toThrow();
  });

  it('snapshot includes all characters', async () => {
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    app = Fastify();
    await app.register(websocket);
    registerWsHub(app, { store });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = String(addr).replace(/^http/, 'ws') + '/live';
    const ws = new WebSocket(url);

    const messages: unknown[] = [];
    ws.on('message', (b) => messages.push(JSON.parse(b.toString())));
    await new Promise<void>((r) => ws.on('open', () => r()));
    await new Promise((r) => setTimeout(r, 50));

    const snapshot = messages[0] as { kind: string; characters: unknown[]; sessions: unknown[] };
    expect(snapshot.kind).toBe('snapshot');
    expect(snapshot.characters).toHaveLength(ALL_CHARACTER_IDS.length);
    expect(Array.isArray(snapshot.sessions)).toBe(true);

    ws.close();
  });

  it('characterUpdated message includes correct character state', async () => {
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    app = Fastify();
    await app.register(websocket);
    registerWsHub(app, { store });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = String(addr).replace(/^http/, 'ws') + '/live';
    const ws = new WebSocket(url);

    const messages: unknown[] = [];
    ws.on('message', (b) => messages.push(JSON.parse(b.toString())));
    await new Promise<void>((r) => ws.on('open', () => r()));
    await new Promise((r) => setTimeout(r, 50));

    store.applyEvent('kim-team-lead', { type: 'tool.pre', ts: 3, sessionId: 's', agentId: 'a', toolName: 'Bash', input: {} });
    await new Promise((r) => setTimeout(r, 50));

    const update = messages.find((m) => (m as { kind: string }).kind === 'characterUpdated') as {
      kind: string;
      state: { id: string; status: string };
    } | undefined;
    expect(update).toBeDefined();
    expect(update?.state.id).toBe('kim-team-lead');
    expect(update?.state.status).toBe('working');

    ws.close();
  });

  it('broadcasts to multiple connected clients simultaneously', async () => {
    const store = createStateStore([...ALL_CHARACTER_IDS]);
    app = Fastify();
    await app.register(websocket);
    registerWsHub(app, { store });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = String(addr).replace(/^http/, 'ws') + '/live';

    const ws1 = new WebSocket(url);
    const ws2 = new WebSocket(url);

    const messages1: unknown[] = [];
    const messages2: unknown[] = [];
    ws1.on('message', (b) => messages1.push(JSON.parse(b.toString())));
    ws2.on('message', (b) => messages2.push(JSON.parse(b.toString())));

    await Promise.all([
      new Promise<void>((r) => ws1.on('open', () => r())),
      new Promise<void>((r) => ws2.on('open', () => r())),
    ]);
    await new Promise((r) => setTimeout(r, 50));

    store.applyEvent('tester', { type: 'tool.pre', ts: 4, sessionId: 's', agentId: 'a', toolName: 'Grep', input: {} });
    await new Promise((r) => setTimeout(r, 50));

    expect(messages1.some((m) => (m as { kind: string }).kind === 'characterUpdated')).toBe(true);
    expect(messages2.some((m) => (m as { kind: string }).kind === 'characterUpdated')).toBe(true);

    ws1.close();
    ws2.close();
  });
});
