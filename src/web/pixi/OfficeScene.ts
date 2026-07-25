import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { CharacterSprite } from './CharacterSprite.js';
import { depthKey, screenToWorld, worldToScreen } from './isometric.js';

/**
 * Game-dev studio interior. Inspired by classic Kairosoft-style iso pixel
 * offices: wooden plank floor, beige walls (N + W) with framed windows
 * showing a city skyline, game posters, and clustered dev desks with dual
 * monitors. Pantry (coffee / fridge / water cooler) sits top-right;
 * meeting area with a round table on a green rug fills the right; a couch
 * and printer occupy the bottom-left corner.
 *
 * World coords 0..980 × 0..600. Walls are 2D interior panels at the north
 * and west edges of the floor, extending up in +z. Depth sort uses
 * `depthKey(x, y) × 10 + kindOffset` so mid-walk sprites remain in the
 * right z order against furniture.
 */

const OFFICE = { x: 20, y: 30, w: 940, h: 560 };
const WALL_H = 90;

const PANTRY_ZONE = { x: 700, y: 30, w: 260, h: 170 };
const MEETING_ZONE = { x: 700, y: 400, w: 260, h: 190 };

const DESK_W = 90, DESK_D = 34, DESK_H = 6;
const DESK_TO_SEAT_Y = 22;

const Z_KIND_FURNITURE = 1;
const Z_KIND_CHAIR_BACK = 2;
const Z_KIND_CHARACTER = 3;
const Z_KIND_DESK = 4;

const TOOL_DESTINATIONS: Record<string, { x: number; y: number }> = {
  Bash: { x: 830, y: 100 },      // pantry (coffee break)
  WebFetch: { x: 830, y: 490 },   // meeting table
  WebSearch: { x: 830, y: 490 },
};

/* ---------- iso primitives ---------- */

function polygonPath(g: Graphics, pts: { x: number; y: number }[]): void {
  if (pts.length === 0) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
}

interface BoxColors { top: number; south: number; east: number; outline: number }

function drawIsoBox(g: Graphics, x: number, y: number, w: number, d: number, h: number, colors: BoxColors): void {
  const seB = worldToScreen(x + w, y + d, 0);
  const swB = worldToScreen(x, y + d, 0);
  const swT = worldToScreen(x, y + d, h);
  const seT = worldToScreen(x + w, y + d, h);
  const neT = worldToScreen(x + w, y, h);
  const nwT = worldToScreen(x, y, h);
  const neB = worldToScreen(x + w, y, 0);

  polygonPath(g, [swB, seB, seT, swT]);
  g.fill(colors.south).stroke({ color: colors.outline, width: 1 });

  polygonPath(g, [seB, neB, neT, seT]);
  g.fill(colors.east).stroke({ color: colors.outline, width: 1 });

  polygonPath(g, [nwT, neT, seT, swT]);
  g.fill(colors.top).stroke({ color: colors.outline, width: 1 });
}

/* ---------- Floor: wooden planks ---------- */

const WOOD_LIGHT = 0xc59a68;
const WOOD_DARK = 0xa87447;
const WOOD_GRAIN = 0x7d5535;

function drawWoodenFloor(g: Graphics): void {
  const { x, y, w, h } = OFFICE;
  // Base fill
  const nw = worldToScreen(x, y);
  const ne = worldToScreen(x + w, y);
  const se = worldToScreen(x + w, y + h);
  const sw = worldToScreen(x, y + h);
  polygonPath(g, [nw, ne, se, sw]);
  g.fill(WOOD_LIGHT).stroke({ color: WOOD_GRAIN, width: 1.5, alpha: 0.7 });

  // Long planks running east-west (in world x direction). Each plank is
  // ~34 world units tall in y (north-south depth).
  const plankH = 34;
  let stripe = 0;
  for (let py = y; py < y + h; py += plankH) {
    stripe++;
    const py2 = Math.min(y + h, py + plankH);
    if (stripe % 2 === 0) {
      const a = worldToScreen(x, py);
      const b = worldToScreen(x + w, py);
      const c = worldToScreen(x + w, py2);
      const d = worldToScreen(x, py2);
      polygonPath(g, [a, b, c, d]);
      g.fill(WOOD_DARK).stroke({ color: WOOD_GRAIN, width: 0.5, alpha: 0.35 });
    }
    // Plank seam line
    const a = worldToScreen(x, py);
    const b = worldToScreen(x + w, py);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: WOOD_GRAIN, width: 0.5, alpha: 0.55 });
  }
}

/* ---------- Walls with windows + posters ---------- */

const WALL_BEIGE = 0xf0e0c0;
const WALL_TRIM = 0xa4886a;
const WALL_STROKE = 0x6b4a2b;

/** Beige north wall panel with 3 window openings + city skyline behind. */
function drawNorthWall(g: Graphics): void {
  const { x, y, w } = OFFICE;
  // Bottom-left, bottom-right, top-right, top-left corners of interior face
  const bl = worldToScreen(x, y, 0);
  const br = worldToScreen(x + w, y, 0);
  const tl = { x: bl.x, y: bl.y - WALL_H };
  const tr = { x: br.x, y: br.y - WALL_H };
  polygonPath(g, [bl, br, tr, tl]);
  g.fill(WALL_BEIGE).stroke({ color: WALL_STROKE, width: 1.5 });

  // Windows — 3 across, sky + city silhouette + frame
  const winSpecs = [
    { xStart: 80,  xEnd: 220 },
    { xStart: 300, xEnd: 440 },
    { xStart: 500, xEnd: 640 },
  ];
  const winZBottom = 34;
  const winZTop = 78;
  for (const spec of winSpecs) {
    drawWindowOnNorthWall(g, spec.xStart, spec.xEnd, winZBottom, winZTop);
  }

  // Baseboard trim at wall bottom
  polygonPath(g, [bl, br, { x: br.x, y: br.y - 6 }, { x: bl.x, y: bl.y - 6 }]);
  g.fill(WALL_TRIM).stroke({ color: WALL_STROKE, width: 1 });
}

/** One window on north wall — sky + buildings + frame. */
function drawWindowOnNorthWall(g: Graphics, xStart: number, xEnd: number, zBottom: number, zTop: number): void {
  const { y } = OFFICE;
  // Window pane corners in world space (on the wall, y=OFFICE.y)
  const bl = worldToScreen(xStart, y, zBottom);
  const br = worldToScreen(xEnd, y, zBottom);
  const tr = worldToScreen(xEnd, y, zTop);
  const tl = worldToScreen(xStart, y, zTop);

  // Sky fill
  polygonPath(g, [bl, br, tr, tl]);
  g.fill(0xbfe4f5).stroke({ color: WALL_STROKE, width: 1.5 });

  // City silhouettes — buildings are axis-aligned rects. The iso window pane
  // has vertical left/right edges and diagonal top/bottom, so the safe
  // rectangle inside the parallelogram is:
  //   safeBot = min(bl.y, br.y)   — the upper of the two bottom corners
  //   safeTop = max(tl.y, tr.y)   — the lower of the two top corners
  // Everything drawn between those y values stays inside the pane.
  const safeLeft = bl.x;
  const safeRight = br.x;
  const safeBot = Math.min(bl.y, br.y);
  const safeTop = Math.max(tl.y, tr.y);
  const winW = safeRight - safeLeft;
  const winH = safeBot - safeTop;

  // Group building rects and their window dots per color so Pixi Graphics
  // batches them into fewer draw calls.
  const bldColors = [0x7c8fa8, 0x5f7391, 0x8ba3bd];
  const bldRects: Array<{ x: number; y: number; w: number; h: number; c: number }> = [];
  const dotRects: Array<{ x: number; y: number }> = [];
  const buildings = 5;
  for (let i = 0; i < buildings; i++) {
    const bx = safeLeft + (i / buildings) * winW + winW * 0.02;
    const bw = (winW / buildings) * 0.9;
    const bh = winH * (0.4 + 0.15 * ((i * 31) % 4) / 3);
    const by = safeBot - bh;
    bldRects.push({ x: bx, y: by, w: bw, h: bh, c: bldColors[i % bldColors.length] });
    for (let wy = by + 2; wy < by + bh - 3; wy += 6) {
      for (let wx = bx + 1; wx < bx + bw - 2; wx += 4) {
        if ((wx + wy) % 2 === 0) dotRects.push({ x: wx, y: wy });
      }
    }
  }
  // Fill one path per color to reduce draw calls
  for (const col of bldColors) {
    let any = false;
    for (const r of bldRects) {
      if (r.c !== col) continue;
      g.rect(r.x, r.y, r.w, r.h);
      any = true;
    }
    if (any) g.fill(col);
  }
  for (const d of dotRects) g.rect(d.x, d.y, 1, 1);
  if (dotRects.length > 0) g.fill(0xffeaa5);

  // Frame mullions — horizontal at the pane's vertical midline, and vertical
  // at horizontal midpoint. Use the parallelogram's actual diagonals so the
  // mullions sit on the pane, not the bbox.
  const leftMidY = (bl.y + tl.y) / 2;
  const rightMidY = (br.y + tr.y) / 2;
  g.moveTo(bl.x, leftMidY).lineTo(br.x, rightMidY).stroke({ color: WALL_STROKE, width: 1.5 });
  const topMidX = (tl.x + tr.x) / 2;
  const botMidX = (bl.x + br.x) / 2;
  const topMidY = (tl.y + tr.y) / 2;
  const botMidY = (bl.y + br.y) / 2;
  g.moveTo(topMidX, topMidY).lineTo(botMidX, botMidY).stroke({ color: WALL_STROKE, width: 1.5 });
}

/** Beige west wall panel + posters on it. */
function drawWestWall(g: Graphics): void {
  const { x, y, h } = OFFICE;
  const bl = worldToScreen(x, y + h, 0);
  const br = worldToScreen(x, y, 0);
  const tr = { x: br.x, y: br.y - WALL_H };
  const tl = { x: bl.x, y: bl.y - WALL_H };
  polygonPath(g, [bl, br, tr, tl]);
  g.fill(WALL_BEIGE).stroke({ color: WALL_STROKE, width: 1.5 });

  const posterSpecs = [
    { yStart: 60,  yEnd: 150, body: 0xff7ba9, accent: 0xffd166 },
    { yStart: 200, yEnd: 290, body: 0x74c69d, accent: 0xffd166 },
    { yStart: 340, yEnd: 430, body: 0x4361ee, accent: 0xf72585 },
  ];
  for (const spec of posterSpecs) {
    drawPosterOnWestWall(g, spec.yStart, spec.yEnd, spec.body, spec.accent);
  }

  // Baseboard trim
  polygonPath(g, [bl, br, { x: br.x, y: br.y - 6 }, { x: bl.x, y: bl.y - 6 }]);
  g.fill(WALL_TRIM).stroke({ color: WALL_STROKE, width: 1 });
}

function drawPosterOnWestWall(g: Graphics, yStart: number, yEnd: number, body: number, accent: number): void {
  const { x } = OFFICE;
  const zBottom = 30;
  const zTop = 78;
  const bl = worldToScreen(x, yEnd, zBottom);
  const br = worldToScreen(x, yStart, zBottom);
  const tr = worldToScreen(x, yStart, zTop);
  const tl = worldToScreen(x, yEnd, zTop);

  // Poster panel
  polygonPath(g, [bl, br, tr, tl]);
  g.fill(body).stroke({ color: WALL_STROKE, width: 1.5 });

  // Accent stripe across (screen-space horizontal band)
  const midY = (bl.y + tl.y) / 2;
  const leftX = Math.min(bl.x, tl.x);
  const rightX = Math.max(br.x, tr.x);
  g.rect(leftX + 3, midY - 4, rightX - leftX - 6, 6).fill(accent);
}

/* ---------- Furniture: colors ---------- */

const DESK_COLORS: BoxColors = { top: 0xc9946a, south: 0x8b5e3c, east: 0xa87447, outline: 0x2a1a0a };
const MONITOR_BEZEL: BoxColors = { top: 0x111827, south: 0x0f172a, east: 0x1e293b, outline: 0x000000 };
const MONITOR_SCREEN: BoxColors = { top: 0x1e40af, south: 0x38bdf8, east: 0x0ea5e9, outline: 0x0369a1 };
const CHAIR_COLORS: BoxColors = { top: 0x2c3e57, south: 0x1e2a3d, east: 0x1a2438, outline: 0x0f172a };
const COFFEE_COLORS: BoxColors = { top: 0x334155, south: 0x1e293b, east: 0x475569, outline: 0x0f172a };
const FRIDGE_COLORS: BoxColors = { top: 0xe5e7eb, south: 0xd1d5db, east: 0xbfc4cc, outline: 0x2a1a0a };
const COUNTER_COLORS: BoxColors = { top: 0xefe5d0, south: 0xc6b28c, east: 0xd9c8a8, outline: 0x6b4a2b };
const COUCH_COLORS: BoxColors = { top: 0x628a3d, south: 0x466a2b, east: 0x557735, outline: 0x2d4419 };
const COUCH_CUSHION: BoxColors = { top: 0x8ba854, south: 0x628a3d, east: 0x769746, outline: 0x2d4419 };
const PRINTER_COLORS: BoxColors = { top: 0xd6d6d6, south: 0xa4a4a4, east: 0xbababa, outline: 0x2a1a0a };
const POT_COLORS: BoxColors = { top: 0x8b5e3c, south: 0x5a3d24, east: 0x724a2f, outline: 0x2a1a0a };
const BOOK_SHELF_COLORS: BoxColors = { top: 0x7a4d2b, south: 0x5b3820, east: 0x66412a, outline: 0x2a1a0a };
const WATER_JUG: BoxColors = { top: 0xbae6fd, south: 0x7dd3fc, east: 0x99e0fb, outline: 0x0284c7 };
const WATER_BASE: BoxColors = { top: 0xf1f5f9, south: 0xcbd5e1, east: 0xdadfe6, outline: 0x334155 };

/* ---------- Furniture: draws ---------- */

function drawDesk(g: Graphics, seatX: number, seatY: number): void {
  const x = seatX - DESK_W / 2;
  const y = seatY + DESK_TO_SEAT_Y - DESK_D / 2;
  drawIsoBox(g, x, y, DESK_W, DESK_D, DESK_H, DESK_COLORS);

  // Dual monitors: left + right, forming a mini workstation
  const cx = seatX;
  const monY = y + 4;
  drawIsoBox(g, cx - 30, monY, 24, 4, 4, MONITOR_BEZEL);   // left stand
  drawIsoBox(g, cx - 32, monY - 2, 26, 3, 22, MONITOR_BEZEL);
  drawIsoBox(g, cx - 31, monY - 3, 24, 2, 20, MONITOR_SCREEN);

  drawIsoBox(g, cx + 6, monY, 24, 4, 4, MONITOR_BEZEL);    // right stand
  drawIsoBox(g, cx + 4, monY - 2, 26, 3, 22, MONITOR_BEZEL);
  drawIsoBox(g, cx + 5, monY - 3, 24, 2, 20, MONITOR_SCREEN);

  // Keyboard
  drawIsoBox(g, cx - 15, y + DESK_D - 14, 30, 6, 2, { top: 0xf1f5f9, south: 0xcbd5e1, east: 0xdadfe6, outline: 0x334155 });
  // Mug (small brown circle)
  const mug = worldToScreen(cx + 28, y + DESK_D - 10, DESK_H);
  g.circle(mug.x, mug.y - 2, 3).fill(0xffffff).stroke({ color: 0x2a1a0a, width: 1 });
  g.rect(mug.x - 2, mug.y - 4, 4, 2).fill(0x6b4a2b);
}

function drawChair(g: Graphics, seatX: number, seatY: number): void {
  const x = seatX - 12;
  const y = seatY - 10;
  drawIsoBox(g, x, y, 24, 12, 6, CHAIR_COLORS);
  drawIsoBox(g, x, y, 24, 3, 22, CHAIR_COLORS);
}

/* ---------- Meeting area: round table + rug + chairs ---------- */

function drawMeetingArea(g: Graphics): void {
  const cx = MEETING_ZONE.x + MEETING_ZONE.w / 2;
  const cy = MEETING_ZONE.y + MEETING_ZONE.h / 2;

  // Green rug — iso-projected ellipse (approximate with polygon)
  const rugRx = 130, rugRy = 90;
  drawIsoEllipse(g, cx, cy, rugRx, rugRy, 0x4ea34a, 0x2f6a2f);

  // Round wooden table — smaller than rug, centered
  const tableRx = 70, tableRy = 45;
  // Table has slight height — draw base ellipse, then top with offset up
  drawIsoEllipse(g, cx, cy, tableRx, tableRy, 0x6b4322, 0x2a1a0a);
  drawIsoEllipseAt(g, cx, cy, tableRx, tableRy, 12, 0xa87447, 0x2a1a0a);

  // 4 chairs around the table (N, S, E, W of center)
  drawChair(g, cx, cy - rugRy + 20);
  drawChair(g, cx, cy + rugRy - 20);
  drawChair(g, cx - rugRx + 25, cy);
  drawChair(g, cx + rugRx - 25, cy);
}

/** Approximate an iso ellipse (world circle) as a polygon on the floor. */
function drawIsoEllipse(g: Graphics, cx: number, cy: number, rx: number, ry: number, fill: number, stroke: number): void {
  drawIsoEllipseAt(g, cx, cy, rx, ry, 0, fill, stroke);
}

function drawIsoEllipseAt(g: Graphics, cx: number, cy: number, rx: number, ry: number, z: number, fill: number, stroke: number): void {
  const segments = 24;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const wx = cx + Math.cos(angle) * rx;
    const wy = cy + Math.sin(angle) * ry;
    pts.push(worldToScreen(wx, wy, z));
  }
  polygonPath(g, pts);
  g.fill(fill).stroke({ color: stroke, width: 1.2 });
}

/* ---------- Pantry: coffee, fridge, water cooler, cabinet ---------- */

function drawPantry(g: Graphics): void {
  // Counter along the back
  drawIsoBox(g, 720, 60, 220, 24, 16, COUNTER_COLORS);
  // Coffee machine
  drawIsoBox(g, 740, 56, 26, 20, 30, COFFEE_COLORS);
  const cs = worldToScreen(755, 76, 20);
  g.rect(cs.x - 3, cs.y - 12, 6, 2).fill(0xef4444); // red indicator
  g.circle(cs.x, cs.y - 4, 2).fill(0x111);          // dispenser hole
  // Water cooler (bottle + base)
  drawIsoBox(g, 785, 58, 22, 20, 16, WATER_BASE);
  drawIsoBox(g, 790, 62, 12, 12, 22, WATER_JUG);
  const ws = worldToScreen(796, 74, 16);
  g.circle(ws.x, ws.y - 2, 2).fill(0x0284c7);
  // Cabinet (mid)
  drawIsoBox(g, 820, 58, 30, 20, 22, COUNTER_COLORS);
  // Fridge (tall)
  drawIsoBox(g, 895, 58, 30, 22, 46, FRIDGE_COLORS);
  const hs = worldToScreen(910, 78, 30);
  g.rect(hs.x - 4, hs.y - 12, 2, 6).fill(0x64748b);
  g.rect(hs.x - 4, hs.y - 26, 2, 6).fill(0x64748b);
}

/* ---------- Lounge: couch + printer + plants ---------- */

function drawGreenCouch(g: Graphics): void {
  // Base
  drawIsoBox(g, 30, 480, 120, 40, 12, COUCH_COLORS);
  // Backrest
  drawIsoBox(g, 30, 480, 120, 10, 30, COUCH_COLORS);
  // Seat cushions
  drawIsoBox(g, 34, 494, 36, 24, 8, COUCH_CUSHION);
  drawIsoBox(g, 74, 494, 36, 24, 8, COUCH_CUSHION);
  drawIsoBox(g, 114, 494, 32, 24, 8, COUCH_CUSHION);
}

function drawPrinter(g: Graphics): void {
  drawIsoBox(g, 170, 500, 40, 30, 18, PRINTER_COLORS);
  // Paper feed
  drawIsoBox(g, 174, 502, 32, 6, 20, PRINTER_COLORS);
  const ps = worldToScreen(185, 502, 22);
  g.rect(ps.x - 6, ps.y - 4, 12, 4).fill(0xffffff).stroke({ color: 0x2a1a0a, width: 1 });
  // Control panel dot
  const cs = worldToScreen(195, 508, 18);
  g.circle(cs.x, cs.y - 2, 1.5).fill(0x22c55e);
}

function drawBookshelf(g: Graphics, x: number, y: number): void {
  drawIsoBox(g, x, y, 60, 16, 60, BOOK_SHELF_COLORS);
  // Book stripes (2 shelves)
  const bookColors = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7, 0xf472b6];
  for (let shelf = 0; shelf < 2; shelf++) {
    const shelfZ = 22 + shelf * 20;
    for (let b = 0; b < 6; b++) {
      const bx = x + 4 + b * 8;
      drawIsoBox(g, bx, y - 2, 6, 3, 14, {
        top: bookColors[b], south: bookColors[(b + 3) % 6], east: bookColors[b], outline: 0x2a1a0a,
      });
      // shelf edge
      const shelfPos = worldToScreen(bx, y, shelfZ);
      g.rect(shelfPos.x - 1, shelfPos.y, 2, 1).fill(0x2a1a0a);
    }
  }
}

function drawPottedPlant(g: Graphics, x: number, y: number, big = false): void {
  const potW = big ? 22 : 16;
  const potH = big ? 20 : 14;
  drawIsoBox(g, x, y, potW, potW, potH, POT_COLORS);
  // Leaves: overlapping green circles above pot
  const foliageCenter = worldToScreen(x + potW / 2, y + potW / 2, potH);
  const leaves = big ? 5 : 3;
  const r = big ? 10 : 7;
  const spread = big ? 6 : 4;
  for (let i = 0; i < leaves; i++) {
    const angle = (i / leaves) * Math.PI * 2;
    const lx = foliageCenter.x + Math.cos(angle) * spread;
    const ly = foliageCenter.y - r - Math.sin(angle) * spread;
    g.circle(lx, ly, r).fill(0x4c8b3f).stroke({ color: 0x2d4419, width: 1 });
  }
  g.circle(foliageCenter.x, foliageCenter.y - r - 2, r).fill(0x74b556).stroke({ color: 0x2d4419, width: 1 });
}

/* ---------- Labels ---------- */

interface LabelSpec { text: string; wx: number; wy: number }

function drawLabel(spec: LabelSpec, alpha = 0.6): Text {
  const t = new Text({
    text: spec.text,
    style: {
      fontFamily: 'Press Start 2P, monospace',
      fontSize: 9,
      fill: 0x2a1a0a,
    },
  });
  t.anchor.set(0.5, 0.5);
  t.alpha = alpha;
  const p = worldToScreen(spec.wx, spec.wy);
  t.x = p.x;
  t.y = p.y - 4;
  return t;
}

/* ---------- Scene ---------- */

export class OfficeScene {
  private app: Application;
  private root = new Container();
  private worldLayer = new Container();
  private ready = false;
  private destroyed = false;
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
      background: 0x7ab7d9,  // sky above the office
      antialias: false,
    });
    // React StrictMode / HMR can unmount the scene between the init() call
    // and its resolution. Bail out cleanly if we've been destroyed since.
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.worldLayer.sortableChildren = true;
    this.root.addChild(this.worldLayer);
    this.app.stage.addChild(this.root);
    this.drawInterior();
    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS;
      for (const s of this.sprites.values()) {
        s.tick(dt);
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
    // Sky background (visible through north windows since walls are drawn on top)
    const bg = new Graphics();
    bg.rect(0, 0, 1024, 640).fill(0x7ab7d9);
    bg.zIndex = -1000;
    this.worldLayer.addChild(bg);

    // Wooden floor
    const floor = new Graphics();
    drawWoodenFloor(floor);
    floor.zIndex = -500;
    this.worldLayer.addChild(floor);

    // Walls — drawn early so furniture/characters can overlap on top
    const walls = new Graphics();
    drawNorthWall(walls);
    drawWestWall(walls);
    walls.zIndex = -450;
    this.worldLayer.addChild(walls);

    // Zone labels — thin, subtle
    for (const label of [
      drawLabel({ text: '탕비실', wx: PANTRY_ZONE.x + PANTRY_ZONE.w / 2, wy: PANTRY_ZONE.y + PANTRY_ZONE.h - 20 }),
      drawLabel({ text: '회의공간', wx: MEETING_ZONE.x + MEETING_ZONE.w / 2, wy: MEETING_ZONE.y + 15 }),
    ]) {
      label.zIndex = -300;
      this.worldLayer.addChild(label);
    }

    // Pantry
    const pantryGfx = new Graphics();
    drawPantry(pantryGfx);
    pantryGfx.zIndex = depthKey(820, 84) * 10 + Z_KIND_FURNITURE;
    this.worldLayer.addChild(pantryGfx);

    // Bookshelf against west wall (below posters)
    const shelfGfx = new Graphics();
    drawBookshelf(shelfGfx, 40, 260);
    shelfGfx.zIndex = depthKey(40, 276) * 10 + Z_KIND_FURNITURE;
    this.worldLayer.addChild(shelfGfx);

    // Meeting area
    const meetingGfx = new Graphics();
    drawMeetingArea(meetingGfx);
    meetingGfx.zIndex = depthKey(MEETING_ZONE.x + MEETING_ZONE.w / 2, MEETING_ZONE.y + MEETING_ZONE.h - 20) * 10 + Z_KIND_FURNITURE;
    this.worldLayer.addChild(meetingGfx);

    // Lounge: couch + printer + big plant
    const loungeGfx = new Graphics();
    drawGreenCouch(loungeGfx);
    drawPrinter(loungeGfx);
    loungeGfx.zIndex = depthKey(90, 520) * 10 + Z_KIND_FURNITURE;
    this.worldLayer.addChild(loungeGfx);

    // Scattered plants — each in its own Graphics so they sort against
    // characters/furniture individually. Their base y (south edge = plant y + potW)
    // is used for the depth key.
    const plantSpecs: Array<{ x: number; y: number; big: boolean }> = [
      { x: 40,  y: 420, big: true  }, // near west wall (south)
      { x: 240, y: 40,  big: false }, // north near pantry
      { x: 680, y: 250, big: true  }, // between desks and meeting
    ];
    for (const spec of plantSpecs) {
      const pg = new Graphics();
      drawPottedPlant(pg, spec.x, spec.y, spec.big);
      const potW = spec.big ? 22 : 16;
      pg.zIndex = depthKey(spec.x + potW / 2, spec.y + potW) * 10 + Z_KIND_FURNITURE;
      this.worldLayer.addChild(pg);
    }
  }

  private drawDeskFor(seatX: number, seatY: number): void {
    const chairGfx = new Graphics();
    drawChair(chairGfx, seatX, seatY);
    chairGfx.zIndex = depthKey(seatX, seatY - 6) * 10 + Z_KIND_CHAIR_BACK;
    this.worldLayer.addChild(chairGfx);

    const deskGfx = new Graphics();
    drawDesk(deskGfx, seatX, seatY);
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
    this.destroyed = true;
    // If init hasn't finished, Pixi's internal fields (_cancelResize etc.)
    // aren't set up yet and destroy() throws. Defer until init resolves —
    // the ready check inside init() will handle the actual teardown.
    if (!this.ready) return;
    try {
      this.app.destroy(true);
    } catch {
      // Swallow: React may unmount mid-frame; another destroy path will run.
    }
  }
}
