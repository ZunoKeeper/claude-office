import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { CharacterSprite } from './CharacterSprite.js';
import { WALL_HEIGHT, depthKey, screenToWorld, worldToScreen } from './isometric.js';

/**
 * Small game-dev studio — single open office. World coordinates are the flat
 * pixel plane the config uses (officeSeat.x/y), projected 2:1 via
 * `worldToScreen()`.
 *
 * Layout (world 0..1000 × 0..600):
 *   ┌───────────────────────────┬───────────────┐
 *   │                           │ SERVER ROOM   │
 *   │       DESK GRID           │  (backdrop)   │
 *   │       (2 rows × 3 desks)  ├───────────────┤
 *   │                           │               │
 *   ├───────────────────────────┤   PANTRY      │
 *   │                           │               │
 *   │       MEETING TABLE       │               │
 *   └───────────────────────────┴───────────────┘
 *
 * Server room and pantry are visually distinguished by tinted floor patches +
 * a low back wall behind the server rack — no interior walls between team
 * areas (per the "open studio" brief).
 */

interface Zone {
  x: number; y: number; w: number; h: number;
  floor: number;
  edge: number;
}

const OFFICE_FLOOR: Zone = { x: 20, y: 40, w: 960, h: 550, floor: 0xffe9b0, edge: 0xc0a374 };
const SERVER_AREA: Zone = { x: 700, y: 40, w: 280, h: 130, floor: 0xdfe5ff, edge: 0x8093b7 };
const PANTRY_AREA: Zone = { x: 700, y: 400, w: 280, h: 190, floor: 0xd7f5c6, edge: 0x8bb87a };
const MEETING_AREA: Zone = { x: 60, y: 430, w: 380, h: 160, floor: 0xffdf85, edge: 0xd8a15c };

const DESK_W = 90, DESK_D = 34, DESK_H = 6;
const DESK_TO_SEAT_Y = 22;  // desk center is this far south of character

/** kind offsets used to break depth ties between overlapping same-row items. */
const Z_KIND_FURNITURE = 1;
const Z_KIND_CHAIR_BACK = 2;
const Z_KIND_CHARACTER = 3;
const Z_KIND_DESK = 4;

/**
 * Tool → world destination the character walks to when the tool fires.
 * Return trip goes back to their seat.
 */
const TOOL_DESTINATIONS: Record<string, { x: number; y: number }> = {
  Bash: { x: 820, y: 100 },     // server rack
  WebFetch: { x: 240, y: 480 },  // meeting table
  WebSearch: { x: 240, y: 480 },
};

/* ---------- iso primitives ---------- */

function polygonPath(g: Graphics, pts: { x: number; y: number }[]): void {
  if (pts.length === 0) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
}

function drawZoneFloor(g: Graphics, z: Zone): void {
  const nw = worldToScreen(z.x, z.y);
  const ne = worldToScreen(z.x + z.w, z.y);
  const se = worldToScreen(z.x + z.w, z.y + z.h);
  const sw = worldToScreen(z.x, z.y + z.h);
  polygonPath(g, [nw, ne, se, sw]);
  g.fill(z.floor).stroke({ color: z.edge, width: 1.5, alpha: 0.6 });
  // Faint tile grid — every 40 world units
  const step = 40;
  for (let dx = step; dx < z.w; dx += step) {
    const a = worldToScreen(z.x + dx, z.y);
    const b = worldToScreen(z.x + dx, z.y + z.h);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: z.edge, width: 1, alpha: 0.18 });
  }
  for (let dy = step; dy < z.h; dy += step) {
    const a = worldToScreen(z.x, z.y + dy);
    const b = worldToScreen(z.x + z.w, z.y + dy);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: z.edge, width: 1, alpha: 0.18 });
  }
}

interface BoxColors { top: number; south: number; east: number; outline: number }

function drawIsoBox(g: Graphics, x: number, y: number, w: number, d: number, h: number, colors: BoxColors): void {
  const neB = worldToScreen(x + w, y, 0);
  const seB = worldToScreen(x + w, y + d, 0);
  const swB = worldToScreen(x, y + d, 0);
  const swT = worldToScreen(x, y + d, h);
  const seT = worldToScreen(x + w, y + d, h);
  const neT = worldToScreen(x + w, y, h);
  const nwT = worldToScreen(x, y, h);

  // South face (front, viewer-facing)
  polygonPath(g, [swB, seB, seT, swT]);
  g.fill(colors.south).stroke({ color: colors.outline, width: 1 });

  // East face (right side, viewer-visible)
  polygonPath(g, [seB, neB, neT, seT]);
  g.fill(colors.east).stroke({ color: colors.outline, width: 1 });

  // Top face — draw last so it caps cleanly
  polygonPath(g, [nwT, neT, seT, swT]);
  g.fill(colors.top).stroke({ color: colors.outline, width: 1 });
}

/* ---------- Furniture drawing ---------- */

const DESK_COLORS: BoxColors = { top: 0xc9946a, south: 0x8b5e3c, east: 0xa87447, outline: 0x2a1a0a };
const MONITOR_COLORS: BoxColors = { top: 0x0f172a, south: 0x0f172a, east: 0x1e293b, outline: 0x000000 };
const SCREEN_COLORS: BoxColors = { top: 0x38bdf8, south: 0x38bdf8, east: 0x0ea5e9, outline: 0x0369a1 };
const CHAIR_COLORS: BoxColors = { top: 0x475569, south: 0x334155, east: 0x1e293b, outline: 0x0f172a };
const TABLE_COLORS: BoxColors = { top: 0xa87447, south: 0x6b4322, east: 0x8b5e3c, outline: 0x2a1a0a };
const RACK_COLORS: BoxColors = { top: 0x1e293b, south: 0x0f172a, east: 0x334155, outline: 0x000000 };
const COFFEE_COLORS: BoxColors = { top: 0x334155, south: 0x1e293b, east: 0x475569, outline: 0x0f172a };
const FRIDGE_COLORS: BoxColors = { top: 0xe5e7eb, south: 0xd1d5db, east: 0xc0c5cd, outline: 0x2a1a0a };
const COUNTER_COLORS: BoxColors = { top: 0xf5f3ee, south: 0xd6d1c4, east: 0xe4dfd0, outline: 0x2a1a0a };

function drawDesk(g: Graphics, seatX: number, seatY: number): void {
  const x = seatX - DESK_W / 2;
  const y = seatY + DESK_TO_SEAT_Y - DESK_D / 2;
  drawIsoBox(g, x, y, DESK_W, DESK_D, DESK_H, DESK_COLORS);
  // Monitor on desk — small tower + screen
  const mx = seatX - 12;
  const my = y + 4;
  drawIsoBox(g, mx, my, 24, 6, 4, MONITOR_COLORS);          // stand
  drawIsoBox(g, mx - 2, my - 2, 28, 4, 20, MONITOR_COLORS);  // back
  drawIsoBox(g, mx - 1, my - 3, 26, 3, 18, SCREEN_COLORS);   // screen face
  // Keyboard hint (flat)
  drawIsoBox(g, seatX - 15, y + DESK_D - 12, 30, 6, 2, { top: 0xf1f5f9, south: 0xcbd5e1, east: 0xdadfe6, outline: 0x334155 });
}

function drawChair(g: Graphics, seatX: number, seatY: number): void {
  // Chair behind character — north of seat, mostly hidden by character but back is visible
  const x = seatX - 12;
  const y = seatY - 10;
  drawIsoBox(g, x, y, 24, 12, 6, CHAIR_COLORS);           // seat cushion
  drawIsoBox(g, x, y, 24, 3, 22, CHAIR_COLORS);           // backrest
}

function drawMeetingTable(g: Graphics): void {
  const x = 100, y = 470, w = 260, d = 60, h = 10;
  drawIsoBox(g, x, y, w, d, h, TABLE_COLORS);
  // 4 chairs around (2 north, 2 south)
  drawChair(g, x + 60, y - 14);
  drawChair(g, x + 200, y - 14);
  drawChair(g, x + 60, y + d + 24);
  drawChair(g, x + 200, y + d + 24);
}

function drawServerRoom(g: Graphics): void {
  // Back wall (short, at north edge of server area) — evokes a room without a full enclosure
  const wx = SERVER_AREA.x, wy = SERVER_AREA.y;
  const nw = worldToScreen(wx, wy);
  const ne = worldToScreen(wx + SERVER_AREA.w, wy);
  const nwTop = { x: nw.x, y: nw.y - WALL_HEIGHT };
  const neTop = { x: ne.x, y: ne.y - WALL_HEIGHT };
  polygonPath(g, [nw, ne, neTop, nwTop]);
  g.fill(0xb9c1e3).stroke({ color: 0x2a1a0a, width: 1.5 });
  g.moveTo(nwTop.x, nwTop.y).lineTo(neTop.x, neTop.y).stroke({ color: 0x2a1a0a, width: 1.5, alpha: 0.6 });

  // Server rack in the middle of server area
  drawIsoBox(g, 780, 70, 60, 40, 70, RACK_COLORS);
  // LED strips on rack front
  const ledY0 = worldToScreen(780, 110, 60);
  for (let i = 0; i < 4; i++) {
    g.circle(ledY0.x + 8 + i * 12, ledY0.y - 4, 2).fill(0x22c55e);
    g.circle(ledY0.x + 8 + i * 12, ledY0.y - 16, 2).fill(0x38bdf8);
  }
}

function drawPantry(g: Graphics): void {
  // Counter along the back of pantry area
  drawIsoBox(g, 720, 420, 240, 22, 14, COUNTER_COLORS);
  // Coffee machine
  drawIsoBox(g, 740, 418, 26, 18, 30, COFFEE_COLORS);
  // small coffee spout / handle
  const cs = worldToScreen(760, 430, 20);
  g.circle(cs.x, cs.y, 2).fill(0xef4444);
  // Fridge
  drawIsoBox(g, 900, 418, 30, 22, 46, FRIDGE_COLORS);
  const hs = worldToScreen(910, 435, 30);
  g.rect(hs.x - 3, hs.y - 8, 2, 6).fill(0x64748b);
}

function zoneLabel(text: string, z: Zone): Text {
  const t = new Text({
    text,
    style: {
      fontFamily: 'Press Start 2P, monospace',
      fontSize: 9,
      fill: 0x2a1a0a,
    },
  });
  t.anchor.set(0.5, 0.5);
  t.alpha = 0.7;
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  const p = worldToScreen(cx, cy);
  t.x = p.x;
  t.y = p.y - 4;
  t.zIndex = 2;
  return t;
}

/* ---------- Scene ---------- */

export class OfficeScene {
  private app: Application;
  private root = new Container();
  private worldLayer = new Container();
  private ready = false;
  private sprites = new Map<CharacterId, CharacterSprite>();
  private seats = new Map<CharacterId, { x: number; y: number }>();
  private lastActivity = new Map<CharacterId, string | undefined>();
  private lastLineSeen = new Map<CharacterId, number>();
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
    this.worldLayer.sortableChildren = true;
    this.root.addChild(this.worldLayer);
    this.app.stage.addChild(this.root);
    this.drawInterior();
    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS;
      for (const s of this.sprites.values()) {
        s.tick(dt);
        // Depth follows current screen position (mid-walk sprites sort correctly)
        const wp = screenToWorld(s.x, s.y);
        s.worldPos = wp;
        s.zIndex = depthKey(wp.x, wp.y) * 10 + Z_KIND_CHARACTER;
      }
    });
    this.ready = true;
    if (this.pendingSetCharacters) {
      this.setCharacters(this.pendingSetCharacters.states, this.pendingSetCharacters.configs);
      this.pendingSetCharacters = null;
    }
  }

  private drawInterior(): void {
    // Background — the space around the office
    const bg = new Graphics();
    bg.rect(0, 0, 1024, 640).fill(0xfff2c4);
    bg.zIndex = -1000;
    this.worldLayer.addChild(bg);

    // Main office floor (single open space)
    const mainFloor = new Graphics();
    drawZoneFloor(mainFloor, OFFICE_FLOOR);
    mainFloor.zIndex = -500;
    this.worldLayer.addChild(mainFloor);

    // Tinted floor patches for server/pantry/meeting (no interior walls)
    const patches = new Graphics();
    drawZoneFloor(patches, SERVER_AREA);
    drawZoneFloor(patches, PANTRY_AREA);
    drawZoneFloor(patches, MEETING_AREA);
    patches.zIndex = -400;
    this.worldLayer.addChild(patches);

    // Zone labels — placed at zone centers so the viewer can read the space
    for (const label of [
      zoneLabel('서버실', SERVER_AREA),
      zoneLabel('탕비실', PANTRY_AREA),
      zoneLabel('회의공간', MEETING_AREA),
    ]) {
      label.zIndex = -300;
      this.worldLayer.addChild(label);
    }

    // Server room (back wall + rack). Rack sits around (780..840 x 70..110).
    const serverGfx = new Graphics();
    drawServerRoom(serverGfx);
    serverGfx.zIndex = depthKey(810, 110) * 10 + Z_KIND_FURNITURE;
    this.worldLayer.addChild(serverGfx);

    // Pantry furniture — south edge of counter row at y ≈ 442
    const pantryGfx = new Graphics();
    drawPantry(pantryGfx);
    pantryGfx.zIndex = depthKey(800, 442) * 10 + Z_KIND_FURNITURE;
    this.worldLayer.addChild(pantryGfx);

    // Meeting table + chairs — south edge of table around y = 530
    const meetingGfx = new Graphics();
    drawMeetingTable(meetingGfx);
    meetingGfx.zIndex = depthKey(230, 530) * 10 + Z_KIND_FURNITURE;
    this.worldLayer.addChild(meetingGfx);
  }

  /** Draw one character's desk + chair. Called from setCharacters so seat
   *  positions come from configs — no duplicated coordinate table. */
  private drawDeskFor(seatX: number, seatY: number): void {
    const chairGfx = new Graphics();
    drawChair(chairGfx, seatX, seatY);
    // Chair back is north of the character; smaller depthKey → drawn behind
    // the character sprite so the character appears seated in it.
    chairGfx.zIndex = depthKey(seatX, seatY - 6) * 10 + Z_KIND_CHAIR_BACK;
    this.worldLayer.addChild(chairGfx);

    const deskGfx = new Graphics();
    drawDesk(deskGfx, seatX, seatY);
    // Desk south edge sits south of the character; larger depthKey and the
    // DESK kind offset (highest) ensure it draws on top of the character legs.
    const deskSouthY = seatY + DESK_TO_SEAT_Y + DESK_D / 2;
    deskGfx.zIndex = depthKey(seatX, deskSouthY) * 10 + Z_KIND_DESK;
    this.worldLayer.addChild(deskGfx);
  }

  setCharacters(states: CharacterState[], configs: CharacterConfig[]): void {
    if (!this.ready) {
      this.pendingSetCharacters = { states, configs };
      return;
    }
    const cfgMap = new Map(configs.map((c) => [c.id, c]));
    for (const c of configs) {
      const existing = this.seats.get(c.id);
      const next = { x: c.officeSeat.x, y: c.officeSeat.y };
      if (!existing || existing.x !== next.x || existing.y !== next.y) {
        this.seats.set(c.id, next);
        // First-time placement: draw the character's desk + chair now that we
        // know their seat position.
        this.drawDeskFor(next.x, next.y);
      }
    }

    for (const s of states) {
      const cfg = cfgMap.get(s.id);
      if (!cfg) continue;
      const seat = this.seats.get(s.id);
      if (!seat) continue;

      let sprite = this.sprites.get(s.id);
      if (!sprite) {
        sprite = new CharacterSprite(s.id, cfg.name);
        const seatScreen = worldToScreen(seat.x, seat.y);
        sprite.x = seatScreen.x;
        sprite.y = seatScreen.y;
        sprite.worldPos = { x: seat.x, y: seat.y };
        this.worldLayer.addChild(sprite);
        this.sprites.set(s.id, sprite);
      }
      sprite.setStatus(s.status);

      const line = s.lastLine;
      if (line) {
        const prevTs = this.lastLineSeen.get(s.id) ?? 0;
        const ageMs = Date.now() - line.ts;
        const remainingMs = line.ttlMs - ageMs;
        if (line.ts > prevTs && remainingMs > 300) {
          sprite.showLine(line.text, remainingMs);
          this.lastLineSeen.set(s.id, line.ts);
        }
      }

      const currTool = s.currentActivity?.toolName;
      const prevTool = this.lastActivity.get(s.id);
      if (currTool !== prevTool) {
        this.lastActivity.set(s.id, currTool);
        const dest = currTool ? TOOL_DESTINATIONS[currTool] : null;
        if (dest) {
          this.moveSpriteWorld(sprite, dest.x, dest.y, 900);
        } else {
          this.moveSpriteWorld(sprite, seat.x, seat.y, 600);
        }
      }
    }
  }

  private moveSpriteWorld(sprite: CharacterSprite, worldX: number, worldY: number, durationMs: number): void {
    const cur = sprite.worldPos ?? { x: worldX, y: worldY };
    const dx = worldX - cur.x;
    const dy = worldY - cur.y;
    let dir: 'N' | 'S' | 'E' | 'W' = 'S';
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'E' : 'W';
    else dir = dy > 0 ? 'S' : 'N';

    sprite.worldPos = { x: worldX, y: worldY };
    const dest = worldToScreen(worldX, worldY);
    void sprite.moveTo(dest.x, dest.y, durationMs, dir);
  }

  destroy(): void {
    this.app.destroy(true);
  }
}
