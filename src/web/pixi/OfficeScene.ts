import { Application, Assets, Container, type FederatedPointerEvent, Sprite } from 'pixi.js';
import type { CharacterId, CharacterState, CharacterStatus } from '../../shared/character.js';
import type { CharacterConfig, SeatDirection, ToolDestination, WaypointMap, WaypointPoint } from '../../shared/config.js';
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
  /** toolName → 목적지 (920×510 논리 좌표). setDestinations로 주입. */
  private toolDests = new Map<string, { id: string; x: number; y: number }>();
  private destList: ToolDestination[] = [];
  private waypoints: WaypointMap = {};
  /** 캐릭터별 이동 명령 토큰 — 새 명령이 오면 진행 중인 경로 걷기를 중단시킨다. */
  private moveSeq = new Map<CharacterId, number>();
  /** 지금 가 있는(또는 가는 중인) 목적지 id — 복귀 시 경유점을 역순으로 쓰기 위함. */
  private lastDestId = new Map<CharacterId, string>();
  private statuses = new Map<CharacterId, CharacterStatus>();
  private seatDirs = new Map<CharacterId, SeatDirection>();
  private wandering = new Set<CharacterId>();
  private nextWanderAt = new Map<CharacterId, number>();
  private wanderTimer: ReturnType<typeof setInterval> | null = null;
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
    // 자유 배회 — 한가한 캐릭터가 이따금 목적지 한 곳을 다녀온다
    this.wanderTimer = setInterval(() => this.wanderTick(), 4000);

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
      } else if (!this.lastActivity.get(s.id) && !sprite.isMoving && !this.wandering.has(s.id)) {
        // Config hot-reload: seat / direction / pose may have moved. Snap
        // idle sprites so edits show up immediately. Sprites mid-walk or
        // out wandering keep their current position.
        if (sprite.x !== seat.x || sprite.y !== seat.y) {
          sprite.x = seat.x;
          sprite.y = seat.y;
          sprite.worldPos = { x: seat.x, y: seat.y };
        }
        sprite.setAway(false);
        sprite.setDirection(seatDir);
        sprite.setSeatPose(seatPose);
      }
      sprite.setStatus(s.status);
      this.statuses.set(s.id, s.status);
      this.seatDirs.set(s.id, seatDir);

      const currTool = s.currentActivity?.toolName;
      const prevTool = this.lastActivity.get(s.id);
      if (currTool !== prevTool) {
        this.lastActivity.set(s.id, currTool);
        const dest = currTool ? this.toolDests.get(currTool) : null;
        if (dest) {
          this.wandering.delete(s.id);
          this.lastDestId.set(s.id, dest.id);
          sprite.setAway(true); // 목적지엔 의자가 없다 — 서서 작업
          const wps = this.waypoints[s.id]?.[dest.id] ?? [];
          void this.walkPath(sprite, [...wps, { x: dest.x, y: dest.y }]);
        } else {
          // 갔던 목적지의 경유점을 역순으로 밟으며 자리로 복귀
          const backWps = [...(this.waypoints[s.id]?.[this.lastDestId.get(s.id) ?? ''] ?? [])].reverse();
          this.lastDestId.delete(s.id);
          this.wandering.delete(s.id);
          void this.walkPath(sprite, [...backWps, { x: seat.x, y: seat.y }]).then((completed) => {
            if (completed) {
              sprite?.setAway(false);
              sprite?.setDirection(seatDir);
            }
          });
        }
      }
    }
  }

  /** 지점들을 순서대로 걷는다. 새 이동 명령(토큰 교체)이 오면 다음 구간부터
   *  중단하고 false를 반환한다. 구간별 시간은 거리에 비례(속도 일정). */
  private async walkPath(sprite: CharacterSprite, pts: WaypointPoint[]): Promise<boolean> {
    const id = sprite.characterId;
    const token = (this.moveSeq.get(id) ?? 0) + 1;
    this.moveSeq.set(id, token);
    for (const p of pts) {
      if (this.destroyed || this.moveSeq.get(id) !== token) return false;
      const dist = Math.hypot(p.x - sprite.x, p.y - sprite.y);
      const dur = Math.max(180, Math.min(1600, dist / 0.28));
      await this.moveSpriteScreen(sprite, p.x, p.y, dur);
    }
    return !this.destroyed && this.moveSeq.get(id) === token;
  }

  /** 자유 배회: idle 캐릭터가 이따금 목적지 한 곳을 (경유점 경로로) 다녀온다. */
  private wanderTick(): void {
    if (this.destroyed || this.editMode || this.destList.length === 0) return;
    const now = Date.now();
    for (const sprite of this.sprites.values()) {
      const id = sprite.characterId;
      if (this.statuses.get(id) !== 'idle') {
        this.nextWanderAt.delete(id);
        continue;
      }
      if (sprite.isMoving || this.wandering.has(id)) continue;
      const due = this.nextWanderAt.get(id);
      if (due === undefined) {
        // idle 진입 후 첫 배회는 15~60초 뒤
        this.nextWanderAt.set(id, now + 15_000 + Math.random() * 45_000);
        continue;
      }
      if (now < due) continue;
      this.nextWanderAt.set(id, now + 30_000 + Math.random() * 60_000);
      void this.wanderOnce(sprite);
    }
  }

  private async wanderOnce(sprite: CharacterSprite): Promise<void> {
    const id = sprite.characterId;
    const dest = this.destList[Math.floor(Math.random() * this.destList.length)];
    const seat = this.seats.get(id);
    if (!dest || !seat) return;
    this.wandering.add(id);
    sprite.setAway(true);
    try {
      const wps = this.waypoints[id]?.[dest.id] ?? [];
      const arrived = await this.walkPath(sprite, [...wps, { x: dest.x, y: dest.y }]);
      if (!arrived) return;
      const myToken = this.moveSeq.get(id);
      // 목적지에서 잠깐 머물다가 (그 사이 일이 들어오면 복귀는 활동 로직에 맡김)
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2500));
      if (this.destroyed || this.moveSeq.get(id) !== myToken || this.statuses.get(id) !== 'idle') return;
      const back = await this.walkPath(sprite, [...[...wps].reverse(), { x: seat.x, y: seat.y }]);
      if (back) {
        sprite.setAway(false);
        sprite.setDirection(this.seatDirs.get(id) ?? 'S');
      }
    } finally {
      this.wandering.delete(id);
    }
  }

  setEditMode(enable: boolean): void {
    this.editMode = enable;
    for (const s of this.sprites.values()) {
      s.eventMode = enable ? 'dynamic' : 'static';
      s.cursor = enable ? 'grab' : 'default';
    }
    if (enable) {
      // 진행 중인 배회는 중단하고 자리로 되돌린다 — 편집 중 드래그와 충돌 방지
      for (const s of this.sprites.values()) {
        const id = s.characterId;
        this.moveSeq.set(id, (this.moveSeq.get(id) ?? 0) + 1);
        if (this.wandering.has(id)) {
          void s.moveTo(s.x, s.y, 0); // 현재 트윈 취소
          const seat = this.seats.get(id);
          if (seat) {
            s.x = seat.x;
            s.y = seat.y;
            s.worldPos = { x: seat.x, y: seat.y };
          }
          s.setAway(false);
        }
      }
      this.wandering.clear();
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

  /** 툴 → 목적지 매핑 교체. 이후의 툴 이동부터 새 좌표가 적용된다. */
  setDestinations(dests: ToolDestination[]): void {
    this.destList = dests;
    this.toolDests.clear();
    for (const d of dests) {
      for (const tool of d.tools) this.toolDests.set(tool, { id: d.id, x: d.x, y: d.y });
    }
  }

  /** 캐릭터×목적지별 경유점 교체. 이후의 걷기부터 새 경로가 적용된다. */
  setWaypoints(map: WaypointMap): void {
    this.waypoints = map;
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
    if (this.wanderTimer) {
      clearInterval(this.wanderTimer);
      this.wanderTimer = null;
    }
    if (!this.ready) return;
    this.safeDestroyApp();
  }
}
