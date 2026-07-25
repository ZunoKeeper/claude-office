import type { WsMessage } from '../../shared/ws.js';
import type { useCharacterStore } from '../store/characterStore.js';

type Store = ReturnType<typeof useCharacterStore.getState>;

export function connectWs(url: string, store: () => Store): { close: () => void } {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let closed = false;

  function open() {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => { attempt = 0; store().setConnected(true); };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as WsMessage;
      switch (msg.kind) {
        case 'snapshot': store().applySnapshot(msg.characters); break;
        case 'characterUpdated': store().upsert(msg.state); break;
        case 'event': store().pushEvent(msg.event); break;
        case 'configUpdated': store().bumpConfigVersion(); break;
        default: break;
      }
    };
    ws.onclose = () => {
      store().setConnected(false);
      if (closed) return;
      attempt += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      setTimeout(open, delay);
    };
    ws.onerror = () => ws?.close();
  }

  open();
  return { close: () => { closed = true; ws?.close(); } };
}
