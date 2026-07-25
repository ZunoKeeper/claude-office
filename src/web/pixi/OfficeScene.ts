import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { CharacterSprite } from './CharacterSprite.js';

/**
 * Office layout — 1024x640 canvas, top-down "isometric-ish" office plan.
 * Rooms are drawn in the flat plan and each character has a fixed desk position.
 * The scene manages: interior background, character sprites, movement to
 * tool destinations, and PL dispatcher walk-over interactions.
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

interface DispatchAnim {
  targetChar: CharacterId;
  startedAt: number;
  phase: 'out' | 'back';
}

export class OfficeScene {
  private app: Application;
  private root = new Container();
  private ready = false;
  private sprites = new Map<CharacterId, CharacterSprite>();
  private seats = new Map<CharacterId, { x: number; y: number }>();
  private lastActivity = new Map<CharacterId, string | undefined>();
  private lastLineTs = new Map<CharacterId, number>();
  private pendingSetCharacters: { states: CharacterState[]; configs: CharacterConfig[] } | null = null;
  private plDispatch: DispatchAnim | null = null;

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
      this.tickPlDispatch();
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

      if (s.id === 'park-planner' && s.lastLine) {
        const prevTs = this.lastLineTs.get(s.id) ?? 0;
        if (s.lastLine.ts > prevTs) {
          this.lastLineTs.set(s.id, s.lastLine.ts);
          this.startPlDispatch(s.lastLine.text);
        }
      }
    }
  }

  /** When PL emits a dispatch line like "정막내에게 맡깁시다", extract the
   *  target name → find matching character seat → briefly walk PL there. */
  private startPlDispatch(line: string): void {
    const pl = this.sprites.get('park-planner');
    if (!pl) return;
    const m = /^(.+?)에게/.exec(line);
    if (!m) return;
    const target = this.findCharacterByName(m[1]);
    if (!target) return;
    const targetSeat = this.seats.get(target);
    const home = this.seats.get('park-planner');
    if (!targetSeat || !home) return;
    if (this.plDispatch) return;
    const midX = (home.x + targetSeat.x) / 2;
    const midY = (home.y + targetSeat.y) / 2;
    this.plDispatch = { targetChar: target, startedAt: Date.now(), phase: 'out' };
    void pl.moveTo(midX, midY, 500).then(() => {
      window.setTimeout(() => {
        if (!this.plDispatch) return;
        this.plDispatch.phase = 'back';
        void pl.moveTo(home.x, home.y, 500).then(() => {
          this.plDispatch = null;
        });
      }, 400);
    });
  }

  private tickPlDispatch(): void {
    if (this.plDispatch && Date.now() - this.plDispatch.startedAt > 3000) {
      const pl = this.sprites.get('park-planner');
      const home = this.seats.get('park-planner');
      if (pl && home) void pl.moveTo(home.x, home.y, 300);
      this.plDispatch = null;
    }
  }

  private findCharacterByName(name: string): CharacterId | null {
    // Match against cfg names — the caller has cfgMap. But we hold sprites
    // that were created with cfg.name. Fallback: prefix match on common names.
    for (const [id, sprite] of this.sprites.entries()) {
      // Sprite doesn't hold name, so use static lookup via known Korean names
      const known = KOREAN_NAMES[id];
      if (known && known === name) return id;
    }
    // Trim trailing whitespace/punctuation
    const cleaned = name.replace(/[\s.,!?]+$/g, '');
    for (const [id] of Object.entries(KOREAN_NAMES)) {
      if (KOREAN_NAMES[id as CharacterId] === cleaned) return id as CharacterId;
    }
    return null;
  }

  destroy(): void {
    this.app.destroy(true);
  }
}

/** Fallback name lookup for dispatch parsing when config isn't stored on sprites. */
const KOREAN_NAMES: Record<CharacterId, string> = {
  'kim-team-lead': '김대리',
  'park-planner': '박PL',
  'lee-researcher': '이대리',
  'yu-dev': '유대리',
  'han-qa': '한주임',
  'seo-designer': '서주임',
  'jo-senior': '조과장',
  'jung-newbie': '정막내',
  'choi-office': '최주임',
};
