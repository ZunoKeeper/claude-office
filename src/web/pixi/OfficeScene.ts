import { Application, Assets, Container, Sprite } from 'pixi.js';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { CharacterSprite } from './CharacterSprite.js';
import { depthKey, screenToWorld, worldToScreen } from './isometric.js';

/**
 * Game-dev studio office. The interior is a pre-rendered background image
 * (public/office-bg.png) — characters are the only interactive layer. World
 * coordinates continue to use the flat plane the config uses (officeSeat.x/y),
 * projected 2:1 via `worldToScreen()` so movement between rooms still reads
 * as isometric walking.
 */

const CANVAS_W = 1024;
const CANVAS_H = 640;
const BG_URL = '/office-bg.png';

const Z_KIND_CHARACTER = 3;

/** Tool → world destination the character walks to when the tool fires. */
const TOOL_DESTINATIONS: Record<string, { x: number; y: number }> = {
  Bash: { x: 830, y: 100 },
  WebFetch: { x: 830, y: 490 },
  WebSearch: { x: 830, y: 490 },
};

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
      width: CANVAS_W,
      height: CANVAS_H,
      background: 0x7ab7d9,
      antialias: false,
    });
    if (this.destroyed) {
      this.safeDestroyApp();
      return;
    }
    this.worldLayer.sortableChildren = true;
    this.root.addChild(this.worldLayer);
    this.app.stage.addChild(this.root);

    await this.loadBackground();
    if (this.destroyed) {
      this.safeDestroyApp();
      return;
    }

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

  private async loadBackground(): Promise<void> {
    const tex = await Assets.load(BG_URL);
    if (this.destroyed) return;
    const bg = new Sprite(tex);
    // Fit to canvas — the source PNG has its own aspect but we squash to fill.
    bg.width = CANVAS_W;
    bg.height = CANVAS_H;
    bg.zIndex = -1000;
    this.worldLayer.addChild(bg);
  }

  setCharacters(states: CharacterState[], configs: CharacterConfig[]): void {
    if (!this.ready) {
      this.pendingSetCharacters = { states, configs };
      return;
    }
    const cfgMap = new Map(configs.map((c) => [c.id, c]));
    for (const c of configs) {
      this.seats.set(c.id, { x: c.officeSeat.x, y: c.officeSeat.y });
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

  private safeDestroyApp(): void {
    try {
      this.app.destroy(true);
    } catch {
      /* Pixi may not be fully initialized; teardown is best-effort. */
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.ready) return;
    this.safeDestroyApp();
  }
}
