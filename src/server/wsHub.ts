import type { FastifyInstance } from 'fastify';
import type { StateStore } from './stateStore.js';
import type { CharacterState } from '../shared/character.js';
import type { WsMessage } from '../shared/ws.js';

interface Deps { store: StateStore }

export function registerWsHub(app: FastifyInstance, deps: Deps): void {
  const clients = new Set<{ send: (data: string) => void; close: () => void }>();

  deps.store.on('characterUpdated', (state: CharacterState) => {
    const msg: WsMessage = { kind: 'characterUpdated', state };
    const data = JSON.stringify(msg);
    for (const c of clients) c.send(data);
  });

  app.get('/live', { websocket: true }, (socket) => {
    const wrapper = {
      send: (d: string) => socket.send(d),
      close: () => socket.close(),
    };
    clients.add(wrapper);
    const snapshot: WsMessage = { kind: 'snapshot', characters: deps.store.getAll(), sessions: [] };
    socket.send(JSON.stringify(snapshot));
    socket.on('close', () => clients.delete(wrapper));
  });
}
