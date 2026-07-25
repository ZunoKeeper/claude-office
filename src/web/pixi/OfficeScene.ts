import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { CharacterSprite } from './CharacterSprite.js';
import { WALL_HEIGHT, depthKey, projectRect, worldToScreen } from './isometric.js';

/**
 * Isometric office. World coordinates are the same flat pixel plane the
 * config uses (officeSeat.x/y), projected 2:1 via `worldToScreen()`.
 * Painters-algorithm depth sort keeps southern/eastern objects on top.
 */

interface Room {
  id: string;
  label: string;
  x: number; y: number; w: number; h: number;
  floor: number;
  floorEdge: number; // slightly darker tone for tile grid lines
  wall: number;
  wallShade: number; // side wall (in shadow)
}

const ROOMS: Room[] = [
  { id: 'meeting',   label: '회의실',     x: 20,  y: 30,  w: 320, h: 200, floor: 0xffdf85, floorEdge: 0xe6b85f, wall: 0xf3d8a8, wallShade: 0xd6b271 },
  { id: 'dev',       label: '개발실',     x: 360, y: 30,  w: 340, h: 200, floor: 0xf6c67c, floorEdge: 0xd8a15c, wall: 0xe6b98b, wallShade: 0xbf9563 },
  { id: 'server',    label: '서버실',     x: 720, y: 30,  w: 280, h: 200, floor: 0xdfe5ff, floorEdge: 0x8093b7, wall: 0xb9c1e3, wallShade: 0x8493b8 },
  { id: 'archive',   label: '서고',       x: 20,  y: 250, w: 260, h: 200, floor: 0xffd6a5, floorEdge: 0xd6a26a, wall: 0xe9c795, wallShade: 0xb99968 },
  { id: 'floor',     label: '',           x: 300, y: 250, w: 400, h: 240, floor: 0xffe9b0, floorEdge: 0xd6b57a, wall: 0xefd696, wallShade: 0xc0a874 },
  { id: 'design-qa', label: '검수/디자인', x: 720, y: 250, w: 280, h: 260, floor: 0xffe6f0, floorEdge: 0xd39cba, wall: 0xf2c8d9, wallShade: 0xc4a1b3 },
  { id: 'lounge',    label: '탕비실/로비', x: 20,  y: 470, w: 660, h: 130, floor: 0xd7f5c6, floorEdge: 0x8bb87a, wall: 0xb8dfa4, wallShade: 0x8ab082 },
];

const TOOL_DESTINATIONS: Record<string, { x: number; y: number }> = {
  Bash: { x: 860, y: 120 },
  WebFetch: { x: 180, y: 100 },
  WebSearch: { x: 180, y: 100 },
};

function polygonPath(g: Graphics, points: { x: number; y: number }[]): void {
  if (points.length === 0) return;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.closePath();
}

function drawRoomFloor(g: Graphics, room: Room): void {
  const [nw, ne, se, sw] = projectRect(room.x, room.y, room.w, room.h);
  polygonPath(g, [nw, ne, se, sw]);
  g.fill(room.floor).stroke({ color: room.floorEdge, width: 1.5, alpha: 0.9 });

  // Interior tile grid — subtle diagonal lines every 40 world units
  const step = 40;
  for (let dx = step; dx < room.w; dx += step) {
    const a = worldToScreen(room.x + dx, room.y);
    const b = worldToScreen(room.x + dx, room.y + room.h);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: room.floorEdge, width: 1, alpha: 0.25 });
  }
  for (let dy = step; dy < room.h; dy += step) {
    const a = worldToScreen(room.x, room.y + dy);
    const b = worldToScreen(room.x + room.w, room.y + dy);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: room.floorEdge, width: 1, alpha: 0.25 });
  }
}

function drawRoomWalls(g: Graphics, room: Room): void {
  // North (back) wall — parallelogram from (nw..ne) floor to (nw..ne) at height
  const nw = worldToScreen(room.x, room.y);
  const ne = worldToScreen(room.x + room.w, room.y);
  const nwTop = { x: nw.x, y: nw.y - WALL_HEIGHT };
  const neTop = { x: ne.x, y: ne.y - WALL_HEIGHT };
  polygonPath(g, [nw, ne, neTop, nwTop]);
  g.fill(room.wall).stroke({ color: 0x2a1a0a, width: 1.5 });

  // West (side) wall — in shadow
  const sw = worldToScreen(room.x, room.y + room.h);
  const swTop = { x: sw.x, y: sw.y - WALL_HEIGHT };
  polygonPath(g, [nw, sw, swTop, nwTop]);
  g.fill(room.wallShade).stroke({ color: 0x2a1a0a, width: 1.5 });

  // Wall top trim line for depth
  g.moveTo(nwTop.x, nwTop.y).lineTo(neTop.x, neTop.y).stroke({ color: 0x2a1a0a, width: 1.5, alpha: 0.6 });
  g.moveTo(nwTop.x, nwTop.y).lineTo(swTop.x, swTop.y).stroke({ color: 0x2a1a0a, width: 1.5, alpha: 0.6 });
}

function roomCenterScreen(room: Room): { x: number; y: number } {
  return worldToScreen(room.x + room.w / 2, room.y + room.h / 2);
}

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
        // Depth: sprites use their world position (stored in .userData) for zIndex
        const wp = (s as unknown as { worldPos?: { x: number; y: number } }).worldPos;
        if (wp) s.zIndex = 100 + depthKey(wp.x, wp.y);
      }
    });
    this.ready = true;
    if (this.pendingSetCharacters) {
      this.setCharacters(this.pendingSetCharacters.states, this.pendingSetCharacters.configs);
      this.pendingSetCharacters = null;
    }
  }

  private drawInterior(): void {
    // Background floor — everything outside rooms
    const bg = new Graphics();
    bg.rect(0, 0, 1024, 640).fill(0xfff2c4);
    this.worldLayer.addChild(bg);

    // Per-room floor + walls, drawn in depth order (small depthKey first)
    const sorted = [...ROOMS].sort((a, b) => depthKey(a.x, a.y) - depthKey(b.x, b.y));
    for (const room of sorted) {
      const layer = new Container();
      layer.zIndex = depthKey(room.x, room.y);

      const walls = new Graphics();
      drawRoomWalls(walls, room);
      layer.addChild(walls);

      const floor = new Graphics();
      drawRoomFloor(floor, room);
      layer.addChild(floor);

      if (room.label) {
        const label = new Text({
          text: room.label,
          style: {
            fontFamily: 'Press Start 2P, monospace',
            fontSize: 9,
            fill: 0x2a1a0a,
          },
        });
        label.anchor.set(0.5, 0.5);
        const c = roomCenterScreen(room);
        label.x = c.x;
        label.y = c.y - 4;
        label.zIndex = 5;
        layer.addChild(label);
      }

      this.worldLayer.addChild(layer);
    }
  }

  setCharacters(states: CharacterState[], configs: CharacterConfig[]): void {
    if (!this.ready) {
      this.pendingSetCharacters = { states, configs };
      return;
    }
    const cfgMap = new Map(configs.map((c) => [c.id, c]));
    for (const c of configs) this.seats.set(c.id, { x: c.officeSeat.x, y: c.officeSeat.y });

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
        (sprite as unknown as { worldPos: { x: number; y: number } }).worldPos = { x: seat.x, y: seat.y };
        this.worldLayer.addChild(sprite);
        this.sprites.set(s.id, sprite);
      }
      sprite.setStatus(s.status);

      // Speech bubble — show when a new lastLine appears, but only if it hasn't
      // already aged past its TTL (e.g., from an initial WS snapshot).
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
    const box = sprite as unknown as { worldPos: { x: number; y: number } };
    const cur = box.worldPos ?? { x: worldX, y: worldY };
    // Direction is derived from world delta (not screen delta) — iso projection
    // rotates east/south deltas so screen dx/dy would misidentify direction.
    const dx = worldX - cur.x;
    const dy = worldY - cur.y;
    let dir: 'N' | 'S' | 'E' | 'W' = 'S';
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'E' : 'W';
    else dir = dy > 0 ? 'S' : 'N';

    box.worldPos = { x: worldX, y: worldY };
    const dest = worldToScreen(worldX, worldY);
    void sprite.moveTo(dest.x, dest.y, durationMs, dir);
  }

  destroy(): void {
    this.app.destroy(true);
  }
}
