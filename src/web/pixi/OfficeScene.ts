import { Application, Assets, Container, Sprite } from 'pixi.js';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { CharacterSprite } from './CharacterSprite.js';

/**
 * Game-dev studio office. The interior is a pre-rendered background image
 * (public/office-bg.png). Since the visuals are baked into the PNG, seat
 * coordinates are interpreted directly in screen (canvas) space so each
 * character lands on a specific chair in the drawn scene. Depth sort keys
 * on the sprite's screen y so anyone standing further south renders on top.
 */

// Canvas matches the source image aspect (1408×780 ≈ 1.805). Using 920×510
// keeps that ratio (~1.804) and shrinks the OFFICE view compared to the old
// 1024×640 stage so the surrounding page can breathe.
const CANVAS_W = 920;
const CANVAS_H = 510;
const BG_URL = '/office-bg.png';

const Z_KIND_CHARACTER = 3;

/** Tool → screen destination the character walks to when the tool fires. */
const TOOL_DESTINATIONS: Record<string, { x: number; y: number }> = {
  Bash: { x: 830, y: 160 },      // pantry / coffee area (top-right)
  WebFetch: { x: 833, y: 363 },  // meeting table area (right)
  WebSearch: { x: 833, y: 363 },
};

function pickDirection(dx: number, dy: number): 'N' | 'S' | 'E' | 'W' {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}

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
        // Screen y drives depth — characters further south (larger y)
        // render on top, matching how the baked isometric art layers.
        s.zIndex = Math.round(s.y) * 10 + Z_KIND_CHARACTER;
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
      const seatDir = cfg.seatDirection ?? 'S';
      if (!sprite) {
        sprite = new CharacterSprite(s.id, cfg.name);
        sprite.x = seat.x;
        sprite.y = seat.y;
        sprite.worldPos = { x: seat.x, y: seat.y };
        sprite.setDirection(seatDir);
        this.worldLayer.addChild(sprite);
        this.sprites.set(s.id, sprite);
      } else if (!this.lastActivity.get(s.id)) {
        // Config hot-reload: seat / direction may have moved. Snap idle
        // sprites so edits to characters.json show up immediately. Sprites
        // mid-tool-walk keep their current tween.
        if (sprite.x !== seat.x || sprite.y !== seat.y) {
          sprite.x = seat.x;
          sprite.y = seat.y;
          sprite.worldPos = { x: seat.x, y: seat.y };
        }
        sprite.setDirection(seatDir);
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
          void this.moveSpriteScreen(sprite, dest.x, dest.y, 900);
        } else {
          void this.moveSpriteScreen(sprite, seat.x, seat.y, 600).then(() => {
            sprite?.setDirection(seatDir);
          });
        }
      }
    }
  }

  private moveSpriteScreen(sprite: CharacterSprite, screenX: number, screenY: number, durationMs: number): Promise<void> {
    const dir = pickDirection(screenX - sprite.x, screenY - sprite.y);
    sprite.worldPos = { x: screenX, y: screenY };
    return sprite.moveTo(screenX, screenY, durationMs, dir);
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
