import { Application, Assets, Container, type FederatedPointerEvent, Sprite } from 'pixi.js';
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
  private editMode = false;
  private dragging: { sprite: CharacterSprite; offsetX: number; offsetY: number } | null = null;
  private onSelectCallback: ((id: CharacterId | null) => void) | null = null;
  private onFrameCallback: ((positions: Array<{ id: CharacterId; x: number; y: number }>) => void) | null = null;
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
      // HTML 이름표 오버레이가 스프라이트를 따라오도록 매 프레임 논리 좌표 통지
      if (this.onFrameCallback && this.sprites.size > 0) {
        this.onFrameCallback(
          [...this.sprites.values()].map((s) => ({ id: s.characterId, x: s.x, y: s.y })),
        );
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
      const seatPose = cfg.seatPose ?? 'stand';
      if (!sprite) {
        sprite = new CharacterSprite(s.id);
        sprite.x = seat.x;
        sprite.y = seat.y;
        sprite.worldPos = { x: seat.x, y: seat.y };
        sprite.setDirection(seatDir);
        sprite.setSeatPose(seatPose);
        this.attachDragHandlers(sprite);
        sprite.eventMode = this.editMode ? 'dynamic' : 'static';
        sprite.cursor = this.editMode ? 'grab' : 'default';
        this.worldLayer.addChild(sprite);
        this.sprites.set(s.id, sprite);
      } else if (!this.lastActivity.get(s.id)) {
        // Config hot-reload: seat / direction / pose may have moved. Snap
        // idle sprites so edits show up immediately. Sprites mid-tool-walk
        // keep their current tween.
        if (sprite.x !== seat.x || sprite.y !== seat.y) {
          sprite.x = seat.x;
          sprite.y = seat.y;
          sprite.worldPos = { x: seat.x, y: seat.y };
        }
        sprite.setDirection(seatDir);
        sprite.setSeatPose(seatPose);
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

  setEditMode(enable: boolean): void {
    this.editMode = enable;
    for (const s of this.sprites.values()) {
      s.eventMode = enable ? 'dynamic' : 'static';
      s.cursor = enable ? 'grab' : 'default';
    }
    if (!enable) {
      if (this.dragging) {
        this.dragging.sprite.cursor = 'default';
        this.dragging = null;
      }
      this.onSelectCallback?.(null);
    }
  }

  onSelectionChange(cb: (id: CharacterId | null) => void): void {
    this.onSelectCallback = cb;
  }

  /** 매 프레임 스프라이트의 논리 좌표(920×510 기준, 발끝 앵커)를 통지한다.
   *  HTML 이름표 오버레이가 걷는 캐릭터를 따라가는 데 쓰인다. */
  onFramePositions(cb: (positions: Array<{ id: CharacterId; x: number; y: number }>) => void): void {
    this.onFrameCallback = cb;
  }

  /** Optimistic update so the browser reflects a direction change immediately;
   *  the eventual configUpdated round-trip will re-apply the same value. */
  applyDirection(id: CharacterId, dir: 'N' | 'S' | 'E' | 'W'): void {
    this.sprites.get(id)?.setDirection(dir);
  }

  applySeatPose(id: CharacterId, pose: 'stand' | 'sit' | 'type'): void {
    this.sprites.get(id)?.setSeatPose(pose);
  }

  private attachDragHandlers(sprite: CharacterSprite): void {
    sprite.on('pointerdown', (e: FederatedPointerEvent) => {
      if (!this.editMode) return;
      const local = this.worldLayer.toLocal(e.global);
      this.dragging = {
        sprite,
        offsetX: sprite.x - local.x,
        offsetY: sprite.y - local.y,
      };
      sprite.cursor = 'grabbing';
      // Bring dragged sprite to front so it's not hidden under others while
      // moving. zIndex resets on the next ticker frame anyway.
      sprite.zIndex = 10_000;
    });

    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = { contains: () => true };
    stage.on('pointermove', (e: FederatedPointerEvent) => {
      if (!this.dragging || this.dragging.sprite !== sprite) return;
      const p = this.worldLayer.toLocal(e.global);
      sprite.x = Math.max(0, Math.min(CANVAS_W, p.x + this.dragging.offsetX));
      sprite.y = Math.max(0, Math.min(CANVAS_H, p.y + this.dragging.offsetY));
    });
    const finishDrag = () => {
      if (!this.dragging || this.dragging.sprite !== sprite) return;
      const droppedX = Math.round(sprite.x);
      const droppedY = Math.round(sprite.y);
      sprite.cursor = 'grab';
      this.dragging = null;
      // Selecting after drop lets the React panel show direction / pose
      // controls right at the character's new home.
      this.onSelectCallback?.(sprite.characterId);
      void fetch(`/config/characters/${sprite.characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officeSeat: { x: droppedX, y: droppedY } }),
      }).catch(() => {
        /* swallow — the WS configUpdated broadcast will re-sync on success,
         * and on failure the next config refetch corrects the sprite. */
      });
    };
    stage.on('pointerup', finishDrag);
    stage.on('pointerupoutside', finishDrag);
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
