import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { CharacterId, CharacterStatus } from '../../shared/character.js';
import { bob } from './animations.js';
import { buildAtlas, type CharacterAtlas } from './sprites/atlas.js';
import { buildEmoteTextures, type EmoteId } from './sprites/emotes.js';
import type { Direction, PoseKey } from './sprites/types.js';
import { SPRITE_H, SPRITE_W } from './sprites/types.js';

const PIXEL_SCALE = 3;

const OUTLINE_BY_STATUS: Record<CharacterStatus, number | null> = {
  off: null,
  idle: null,
  thinking: 0x3b82f6,
  working: 0x10b981,
  blocked: 0xf59e0b,
  error: 0xef4444,
  done: 0x22c55e,
};

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

function deriveAnimStateAndEmote(status: CharacterStatus): { anim: AnimState; emote: EmoteId | null; timedEmote: boolean } {
  switch (status) {
    case 'off':
    case 'idle':
      return { anim: 'idle', emote: null, timedEmote: false };
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
  private statusRing = new Graphics();
  private nameLabel: Text;

  // Speech bubble — rounded rect + tail + text. Positioned above the emote.
  private bubbleContainer = new Container();
  private bubbleGfx = new Graphics();
  private bubbleText: Text;
  private bubbleExpiresAtMs: number | null = null;
  private bubbleElapsedMs = 0;
  private bubbleVisible = false;

  private status: CharacterStatus = 'idle';
  private animState: AnimState = 'idle';
  private direction: Direction = 'S';

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

  constructor(private id: CharacterId, name: string) {
    super();
    this.atlas = buildAtlas();
    this.emoteTextures = buildEmoteTextures();

    this.body = new Sprite(this.atlas.get(id, 'stand-S'));
    this.body.anchor.set(0.5, 1.0);
    this.body.scale.set(PIXEL_SCALE);
    this.addChild(this.statusRing);
    this.addChild(this.body);

    this.emoteSprite = new Sprite();
    this.emoteSprite.anchor.set(0.5, 0.5);
    this.emoteSprite.scale.set(PIXEL_SCALE);
    this.emoteSprite.visible = false;
    this.emoteSprite.y = -SPRITE_H * PIXEL_SCALE - 10;
    this.addChild(this.emoteSprite);

    this.nameLabel = new Text({
      text: name,
      style: {
        fontFamily: 'DotGothic16, monospace',
        fontSize: 10,
        fill: 0x1a1a1a,
        stroke: { color: 0xfff2c4, width: 2 },
      },
    });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.y = 8;
    this.addChild(this.nameLabel);

    this.bubbleText = new Text({
      text: '',
      style: {
        fontFamily: 'DotGothic16, monospace',
        fontSize: 11,
        fill: 0x1f1305,
        wordWrap: true,
        wordWrapWidth: 160,
        align: 'center',
      },
    });
    this.bubbleText.anchor.set(0.5, 0);
    this.bubbleContainer.addChild(this.bubbleGfx);
    this.bubbleContainer.addChild(this.bubbleText);
    this.bubbleContainer.visible = false;
    this.addChild(this.bubbleContainer);

    this.updateStatusRing();
  }

  showLine(text: string, ttlMs: number): void {
    const trimmed = text.length > 120 ? text.slice(0, 118) + '…' : text;
    this.bubbleText.style.wordWrapWidth = 200;
    this.bubbleText.text = trimmed;
    // Text metrics resolve after assignment; box wraps text so intrinsic width
    // is bounded by wordWrapWidth.
    const padX = 10;
    const padY = 6;
    const w = Math.max(70, this.bubbleText.width + padX * 2);
    const h = this.bubbleText.height + padY * 2;
    const halfW = w / 2;
    this.bubbleGfx.clear();
    this.bubbleGfx.roundRect(-halfW, 0, w, h, 8)
      .fill(0xfffdf3)
      .stroke({ color: 0x2a1a0a, width: 1.5 });
    // Tail pointing down at the head
    this.bubbleGfx.moveTo(-5, h).lineTo(0, h + 8).lineTo(5, h).closePath()
      .fill(0xfffdf3).stroke({ color: 0x2a1a0a, width: 1.5 });
    this.bubbleText.x = 0;
    this.bubbleText.y = padY;

    // Sit above the head+emote area. Emote is at y=-SPRITE_H*3-10, ~18px tall.
    // Reserve 44px above sprite top so tail floats clear of emote.
    const bubbleY = -SPRITE_H * PIXEL_SCALE - 44 - h;
    this.bubbleContainer.y = bubbleY;
    this.bubbleContainer.x = 0;
    this.bubbleContainer.visible = true;
    this.bubbleContainer.alpha = 1;
    this.bubbleVisible = true;
    this.bubbleElapsedMs = 0;
    this.bubbleExpiresAtMs = Math.max(500, ttlMs);
  }

  private hideLine(): void {
    this.bubbleContainer.visible = false;
    this.bubbleVisible = false;
    this.bubbleExpiresAtMs = null;
  }

  setStatus(next: CharacterStatus): void {
    if (this.status === next) return;
    this.status = next;

    // While a movement tween is active, walking overrides the visual state.
    // The final status is applied when the tween resolves (see tick()).
    // Consequence: a status change to 'error' mid-walk is not shown until the
    // character arrives — intentional so the walk cycle isn't interrupted.
    if (!this.tweenTo) {
      const { anim, emote, timedEmote } = deriveAnimStateAndEmote(next);
      this.animState = anim;
      if (emote) this.setEmote(emote, timedEmote ? DONE_EMOTE_MS : null);
      else this.clearEmote();
    }

    this.alpha = next === 'off' ? 0.45 : 1;
    this.updateStatusRing();
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

  private updateStatusRing(): void {
    const ring = OUTLINE_BY_STATUS[this.status];
    this.statusRing.clear();
    if (ring === null) return;
    const w = SPRITE_W * PIXEL_SCALE;
    const h = SPRITE_H * PIXEL_SCALE;
    this.statusRing.rect(-w / 2 - 2, -h, w + 4, h + 4)
      .stroke({ color: ring, width: 2, alpha: 0.85 });
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
        const { anim, emote, timedEmote } = deriveAnimStateAndEmote(this.status);
        this.animState = anim;
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

    // Speech bubble: pop-in scale + timed fade-out
    if (this.bubbleVisible) {
      this.bubbleElapsedMs += deltaMs;
      const popIn = Math.min(1, this.bubbleElapsedMs / 160);
      // Ease-out overshoot
      const popScale = popIn < 0.7 ? popIn * 1.3 : 1 + (1 - popIn) * 0.15;
      this.bubbleContainer.scale.set(popScale);
      if (this.bubbleExpiresAtMs !== null && this.bubbleElapsedMs >= this.bubbleExpiresAtMs) {
        // Fade out over 300ms after TTL
        const fade = Math.min(1, (this.bubbleElapsedMs - this.bubbleExpiresAtMs) / 300);
        this.bubbleContainer.alpha = 1 - fade;
        if (fade >= 1) this.hideLine();
      }
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
        this.emoteSprite.scale.set(PIXEL_SCALE * eased);
      }
    }
  }

  setLabel(_text?: string): void {
    // Reserved for future extraLabel; currently no-op.
  }
}
