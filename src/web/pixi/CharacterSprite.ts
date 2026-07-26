import { Container, Sprite } from 'pixi.js';
import type { CharacterId, CharacterStatus } from '../../shared/character.js';
import type { SeatPose } from '../../shared/config.js';
import { bob } from './animations.js';
import { buildAtlas, type CharacterAtlas } from './sprites/atlas.js';
import { buildEmoteTextures, type EmoteId } from './sprites/emotes.js';
import type { Direction, PoseKey } from './sprites/types.js';
import { SPRITE_H } from './sprites/types.js';

/** 48×64 합성 결과를 화면에서 1.5배 — 기존 24×32×3과 같은 72×96 풋프린트. */
export const PIXEL_SCALE = 1.5;
/** 이모트 아트는 여전히 저해상 원본이라 별도 3배 스케일 유지. */
const EMOTE_SCALE = 3;

const WALK_FRAME_MS = 160;
const TYPE_FRAME_MS = 220;
const DONE_EMOTE_MS = 2000;

type AnimState = 'idle' | 'walking' | 'sitting' | 'typing';

interface Tween {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  durationMs: number;
  elapsed: number;
  resolve: () => void;
}

function poseToAnim(pose: SeatPose): AnimState {
  return pose === 'sit' ? 'sitting' : pose === 'type' ? 'typing' : 'idle';
}

function deriveAnimStateAndEmote(status: CharacterStatus, seatPose: SeatPose): { anim: AnimState; emote: EmoteId | null; timedEmote: boolean } {
  switch (status) {
    case 'off':
    case 'idle':
      // Fall through to the seat's resting pose so a character parked at
      // a desk sits/types instead of standing rigidly next to it.
      return { anim: poseToAnim(seatPose), emote: null, timedEmote: false };
    case 'working':
      return { anim: 'typing', emote: null, timedEmote: false };
    case 'thinking':
      return { anim: 'sitting', emote: 'question', timedEmote: false };
    case 'blocked':
      return { anim: 'sitting', emote: 'sweat', timedEmote: false };
    case 'error':
      return { anim: 'sitting', emote: 'exclaim', timedEmote: false };
    case 'done':
      return { anim: 'sitting', emote: 'idea', timedEmote: true };
  }
}

export class CharacterSprite extends Container {
  private atlas: CharacterAtlas;
  private emoteTextures: ReturnType<typeof buildEmoteTextures>;

  private body: Sprite;
  private emoteSprite: Sprite;

  private status: CharacterStatus = 'idle';
  private animState: AnimState = 'idle';
  private direction: Direction = 'S';
  private seatPose: SeatPose = 'stand';
  /** 자리를 떠나 있는 동안(목적지·배회)은 의자가 없으므로 앉기/타이핑 대신 서기. */
  private away = false;

  private currentEmote: EmoteId | null = null;
  private emoteExpiresAt: number | null = null;
  private emoteElapsedMs = 0;

  private frame: 0 | 1 = 0;
  private frameElapsedMs = 0;
  private idleElapsedMs = 0;

  private tweenTo?: Tween;

  /** Populated by the scene when the sprite is anchored to a world position.
   *  Used for isometric depth sort and world-space direction inference. */
  worldPos?: { x: number; y: number };

  get characterId(): CharacterId {
    return this.id;
  }

  /** 이동 트윈이 진행 중인지 — 배회 스케줄러가 겹침을 피하는 데 쓴다. */
  get isMoving(): boolean {
    return this.tweenTo !== undefined;
  }

  /** 자리 이탈 여부 설정. 떠나 있으면 앉기/타이핑 자세 대신 서 있는다. */
  setAway(away: boolean): void {
    if (this.away === away) return;
    this.away = away;
    if (!this.tweenTo) {
      const { anim } = deriveAnimStateAndEmote(this.status, this.seatPose);
      this.animState = this.effectiveAnim(anim);
      this.updateTexture();
    }
  }

  /** away 상태에서는 의자가 필요한 자세를 서기로 바꾼다. */
  private effectiveAnim(anim: AnimState): AnimState {
    return this.away && (anim === 'sitting' || anim === 'typing') ? 'idle' : anim;
  }

  // 이름표는 캔버스 밖 HTML 오버레이(IsometricOffice)가 그린다 — 캔버스가
  // CSS 스케일될 때 글씨가 흐려지지 않도록 고정 크기로 유지하기 위함.
  constructor(private id: CharacterId) {
    super();
    this.atlas = buildAtlas();
    this.emoteTextures = buildEmoteTextures();

    this.body = new Sprite(this.atlas.get(id, 'stand-S'));
    this.body.anchor.set(0.5, 1.0);
    this.body.scale.set(PIXEL_SCALE);
    this.addChild(this.body);

    this.emoteSprite = new Sprite();
    this.emoteSprite.anchor.set(0.5, 0.5);
    this.emoteSprite.scale.set(EMOTE_SCALE);
    this.emoteSprite.visible = false;
    this.emoteSprite.y = -SPRITE_H * PIXEL_SCALE - 10;
    this.addChild(this.emoteSprite);

  }

  setDirection(dir: Direction): void {
    if (this.direction === dir) return;
    this.direction = dir;
    if (!this.tweenTo) this.updateTexture();
  }

  setSeatPose(pose: SeatPose): void {
    if (this.seatPose === pose) return;
    this.seatPose = pose;
    if (this.tweenTo) return;
    // If status is idle-like, resting anim just changed. Re-derive.
    if (this.status === 'idle' || this.status === 'off') {
      const { anim } = deriveAnimStateAndEmote(this.status, this.seatPose);
      this.animState = this.effectiveAnim(anim);
      this.updateTexture();
    }
  }

  setStatus(next: CharacterStatus): void {
    if (this.status === next) return;
    this.status = next;

    // While a movement tween is active, walking overrides the visual state.
    // The final status is applied when the tween resolves (see tick()).
    // Consequence: a status change to 'error' mid-walk is not shown until the
    // character arrives — intentional so the walk cycle isn't interrupted.
    if (!this.tweenTo) {
      const { anim, emote, timedEmote } = deriveAnimStateAndEmote(next, this.seatPose);
      this.animState = this.effectiveAnim(anim);
      if (emote) this.setEmote(emote, timedEmote ? DONE_EMOTE_MS : null);
      else this.clearEmote();
    }

    this.alpha = next === 'off' ? 0.45 : 1;
    this.updateTexture();
  }

  private setEmote(id: EmoteId, ttlMs: number | null): void {
    this.currentEmote = id;
    this.emoteSprite.texture = this.emoteTextures[id];
    this.emoteSprite.visible = true;
    this.emoteSprite.alpha = 1;
    this.emoteElapsedMs = 0;
    this.emoteExpiresAt = ttlMs;
  }

  private clearEmote(): void {
    this.currentEmote = null;
    this.emoteSprite.visible = false;
    this.emoteExpiresAt = null;
  }

  private currentPose(): PoseKey {
    if (this.animState === 'walking') {
      return (this.frame === 0 ? `walk1-${this.direction}` : `walk2-${this.direction}`) as PoseKey;
    }
    if (this.animState === 'sitting') return 'sit';
    if (this.animState === 'typing') return this.frame === 0 ? 'type1' : 'type2';
    return `stand-${this.direction}` as PoseKey;
  }

  private updateTexture(): void {
    this.body.texture = this.atlas.get(this.id, this.currentPose());
  }

  moveTo(x: number, y: number, durationMs: number, direction?: Direction): Promise<void> {
    if (this.tweenTo) {
      const prev = this.tweenTo.resolve;
      this.tweenTo = undefined;
      prev();
    }
    if (durationMs <= 0) {
      this.x = x;
      this.y = y;
      return Promise.resolve();
    }

    if (direction) {
      this.direction = direction;
    } else {
      // Fallback: derive from screen delta. In an isometric parent, this is
      // wrong (screen dx/dy differs from world dx/dy) — callers there pass
      // the direction explicitly.
      const dx = x - this.x;
      const dy = y - this.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.direction = dx > 0 ? 'E' : 'W';
      } else {
        this.direction = dy > 0 ? 'S' : 'N';
      }
    }
    this.animState = 'walking';
    this.frame = 0;
    this.frameElapsedMs = 0;
    this.updateTexture();

    return new Promise<void>((resolve) => {
      this.tweenTo = {
        targetX: x,
        targetY: y,
        startX: this.x,
        startY: this.y,
        durationMs,
        elapsed: 0,
        resolve,
      };
    });
  }

  tick(deltaMs: number): void {
    // Movement tween
    if (this.tweenTo) {
      this.tweenTo.elapsed += deltaMs;
      const t = Math.min(1, this.tweenTo.elapsed / this.tweenTo.durationMs);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.x = this.tweenTo.startX + (this.tweenTo.targetX - this.tweenTo.startX) * ease;
      this.y = this.tweenTo.startY + (this.tweenTo.targetY - this.tweenTo.startY) * ease;
      if (t >= 1) {
        const done = this.tweenTo.resolve;
        this.tweenTo = undefined;
        done();
        // Return to derived state from current status
        const { anim, emote, timedEmote } = deriveAnimStateAndEmote(this.status, this.seatPose);
        this.animState = this.effectiveAnim(anim);
        this.frame = 0;
        this.frameElapsedMs = 0;
        if (emote) this.setEmote(emote, timedEmote ? DONE_EMOTE_MS : null);
        else this.clearEmote();
        this.updateTexture();
      }
    }

    // Frame advance
    this.frameElapsedMs += deltaMs;
    const period = this.animState === 'walking' ? WALK_FRAME_MS
      : this.animState === 'typing' ? TYPE_FRAME_MS
      : 0;
    if (period > 0 && this.frameElapsedMs >= period) {
      this.frameElapsedMs -= period;
      this.frame = this.frame === 0 ? 1 : 0;
      this.updateTexture();
    }

    // Idle bob (subtle vertical sine, applied to body only)
    this.idleElapsedMs += deltaMs;
    if (this.animState === 'idle' && !this.tweenTo) {
      this.body.y = bob(this.idleElapsedMs, 2, 1500);
    } else if (this.animState === 'walking') {
      // Slight walk bounce synced with frame period
      this.body.y = -Math.abs(bob(this.frameElapsedMs, 3, WALK_FRAME_MS * 2));
    } else {
      this.body.y = 0;
    }

    // Emote animation: hover + optional timed expire
    if (this.currentEmote) {
      this.emoteElapsedMs += deltaMs;
      if (this.emoteExpiresAt !== null && this.emoteElapsedMs > this.emoteExpiresAt) {
        this.clearEmote();
      } else {
        const hover = bob(this.emoteElapsedMs, 3, 900);
        this.emoteSprite.y = -SPRITE_H * PIXEL_SCALE - 10 + hover;
        // Pop-in scale during first 180ms
        const popIn = Math.min(1, this.emoteElapsedMs / 180);
        const eased = popIn < 0.7 ? popIn * 1.4 : 1 + (1 - popIn) * 0.2;
        this.emoteSprite.scale.set(EMOTE_SCALE * eased);
      }
    }
  }

  setLabel(_text?: string): void {
    // Reserved for future extraLabel; currently no-op.
  }
}
