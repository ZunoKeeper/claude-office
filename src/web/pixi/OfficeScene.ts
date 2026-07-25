import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { CharacterSprite } from './CharacterSprite.js';

/**
 * Office layout — 1024x640 canvas, top-down "isometric-ish" office plan.
 * Rooms are drawn in the flat plan and each character has a fixed desk position.
 * The scene manages: interior background, character sprites, and movement
 * to tool destinations. Only real observed events drive character motion.
 */

interface Room {
  id: string;
  label: string;
  x: number; y: number; w: number; h: number;
  floor: number;
  wall?: number;
}

const ROOMS: Room[] = [
  { id: 'meeting',   label: '회의실',   x: 20,  y: 30,  w: 320, h: 200, floor: 0xffdf85 },
  { id: 'dev',       label: '개발실',   x: 360, y: 30,  w: 340, h: 200, floor: 0xf6c67c },
  { id: 'server',    label: '서버실',   x: 720, y: 30,  w: 280, h: 200, floor: 0xdfe5ff, wall: 0x8093b7 },
  { id: 'archive',   label: '서고',     x: 20,  y: 250, w: 260, h: 200, floor: 0xffd6a5 },
  { id: 'floor',     label: '',         x: 300, y: 250, w: 400, h: 240, floor: 0xffe9b0 },
  { id: 'design-qa', label: '검수/디자인', x: 720, y: 250, w: 280, h: 260, floor: 0xffe6f0 },
  { id: 'lounge',    label: '탕비실/로비', x: 20,  y: 470, w: 660, h: 130, floor: 0xd7f5c6 },
];

/**
 * Tool → destination inside the office. Character walks here on tool.pre,
 * back to seat (from config.officeSeat) on tool.post.
 */
const TOOL_DESTINATIONS: Record<string, { x: number; y: number }> = {
  Bash: { x: 860, y: 120 },        // 서버실 랙
  WebFetch: { x: 180, y: 100 },    // 회의실 화이트보드
  WebSearch: { x: 180, y: 100 },
};

/* Draw furniture bits so the office doesn't look empty */
function drawFurniture(g: Graphics) {
  // Meeting room table (long)
  g.rect(100, 120, 200, 40).fill(0xa87447).stroke({ color: 0x2a1a0a, width: 2 });
  g.rect(120, 122, 160, 12).fill(0xc9946a);

  // Dev room desks (3 stations)
  for (let i = 0; i < 3; i++) {
    const dx = 400 + i * 110;
    g.rect(dx, 120, 90, 30).fill(0x8b5e3c).stroke({ color: 0x2a1a0a, width: 2 });
    g.rect(dx + 20, 108, 50, 14).fill(0x334155).stroke({ color: 0x2a1a0a, width: 1 }); // monitor
    g.rect(dx + 40, 90, 10, 20).fill(0x0f172a); // monitor stand
  }

  // Server rack
  g.rect(830, 60, 40, 130).fill(0x1e293b).stroke({ color: 0x0f172a, width: 2 });
  for (let i = 0; i < 5; i++) {
    g.rect(838, 68 + i * 24, 24, 4).fill(0x38bdf8);
    g.rect(838, 74 + i * 24, 24, 2).fill(0x0ea5e9);
  }
  // Blinking LEDs (static representation)
  g.circle(870, 70, 2).fill(0x22c55e);
  g.circle(870, 80, 2).fill(0xf59e0b);

  // Archive shelves
  for (let i = 0; i < 3; i++) {
    g.rect(60 + i * 65, 290, 55, 20).fill(0x9a6b3f).stroke({ color: 0x2a1a0a, width: 2 });
    // books
    for (let b = 0; b < 4; b++) {
      const bx = 65 + i * 65 + b * 12;
      g.rect(bx, 293, 8, 14).fill([0xdc2626, 0x2563eb, 0x16a34a, 0xf59e0b][b]);
    }
  }

  // QA/Design desks
  g.rect(760, 320, 90, 30).fill(0x8b5e3c).stroke({ color: 0x2a1a0a, width: 2 });
  g.rect(770, 308, 40, 14).fill(0x334155).stroke({ color: 0x2a1a0a, width: 1 });
  g.rect(880, 320, 90, 30).fill(0x8b5e3c).stroke({ color: 0x2a1a0a, width: 2 });
  g.rect(890, 308, 40, 14).fill(0x334155).stroke({ color: 0x2a1a0a, width: 1 });

  // Lounge — coffee machine + printer
  g.rect(80, 500, 40, 60).fill(0x475569).stroke({ color: 0x1e293b, width: 2 });
  g.rect(88, 508, 24, 20).fill(0x0f172a);
  g.rect(88, 532, 24, 10).fill(0x38bdf8);
  g.rect(600, 500, 60, 40).fill(0xe5e7eb).stroke({ color: 0x2a1a0a, width: 2 });
  g.rect(605, 508, 50, 24).fill(0xffffff);
  g.rect(610, 512, 40, 4).fill(0x94a3b8);

  // Central floor rug
  g.rect(340, 380, 320, 90).fill(0xfacc15, 0.3).stroke({ color: 0xca8a04, width: 2 });

  // Doors between rooms (visual dashes)
  g.rect(300, 220, 24, 10).fill(0x2a1a0a); // meeting↔dev? actually decorative
}

export class OfficeScene {
  private app: Application;
  private root = new Container();
  private ready = false;
  private sprites = new Map<CharacterId, CharacterSprite>();
  private seats = new Map<CharacterId, { x: number; y: number }>();
  private lastActivity = new Map<CharacterId, string | undefined>();
  private pendingSetCharacters: { states: CharacterState[]; configs: CharacterConfig[] } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
    void this.init();
  }

  private async init() {
    await this.app.init({
      canvas: this.canvas,
      width: 1024,
      height: 640,
      background: 0xfff2c4,
      antialias: false,
    });
    this.app.stage.addChild(this.root);
    this.drawInterior();
    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS;
      for (const s of this.sprites.values()) s.tick(dt);
    });
    this.ready = true;
    if (this.pendingSetCharacters) {
      this.setCharacters(this.pendingSetCharacters.states, this.pendingSetCharacters.configs);
      this.pendingSetCharacters = null;
    }
  }

  private drawInterior(): void {
    const g = new Graphics();
    // outer floor
    g.rect(0, 0, 1024, 640).fill(0xfff2c4);

    // Room floors + walls
    for (const room of ROOMS) {
      g.rect(room.x, room.y, room.w, room.h).fill(room.floor).stroke({ color: 0x2a1a0a, width: 3 });
      // small tile grid inside room
      for (let x = room.x; x < room.x + room.w; x += 32) {
        g.moveTo(x, room.y).lineTo(x, room.y + room.h).stroke({ color: 0x0000000f, width: 1 });
      }
      for (let y = room.y; y < room.y + room.h; y += 32) {
        g.moveTo(room.x, y).lineTo(room.x + room.w, y).stroke({ color: 0x0000000f, width: 1 });
      }
    }

    drawFurniture(g);
    this.root.addChild(g);

    // Room labels
    for (const room of ROOMS) {
      if (!room.label) continue;
      const t = new Text({
        text: room.label,
        style: {
          fontFamily: 'Press Start 2P, monospace',
          fontSize: 9,
          fill: 0x2a1a0a,
        },
      });
      t.x = room.x + 8;
      t.y = room.y + 8;
      this.root.addChild(t);
    }
  }

  setCharacters(states: CharacterState[], configs: CharacterConfig[]): void {
    if (!this.ready) {
      this.pendingSetCharacters = { states, configs };
      return;
    }
    const cfgMap = new Map(configs.map((c) => [c.id, c]));
    // Refresh seat map from configs each call so overrides / edits propagate.
    for (const c of configs) this.seats.set(c.id, { x: c.officeSeat.x, y: c.officeSeat.y });

    for (const s of states) {
      const cfg = cfgMap.get(s.id);
      if (!cfg) continue;
      const seat = this.seats.get(s.id);
      if (!seat) continue;

      let sprite = this.sprites.get(s.id);
      if (!sprite) {
        sprite = new CharacterSprite(s.id, cfg.name);
        sprite.x = seat.x;
        sprite.y = seat.y;
        this.root.addChild(sprite);
        this.sprites.set(s.id, sprite);
      }
      sprite.setStatus(s.status);

      const currTool = s.currentActivity?.toolName;
      const prevTool = this.lastActivity.get(s.id);
      if (currTool !== prevTool) {
        this.lastActivity.set(s.id, currTool);
        const dest = currTool ? TOOL_DESTINATIONS[currTool] : null;
        if (dest) {
          void sprite.moveTo(dest.x, dest.y, 900);
        } else {
          void sprite.moveTo(seat.x, seat.y, 600);
        }
      }

    }
  }

  destroy(): void {
    this.app.destroy(true);
  }
}
