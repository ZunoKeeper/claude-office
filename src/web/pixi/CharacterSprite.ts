import { Container, Graphics, Text } from 'pixi.js';
import type { CharacterId, CharacterStatus } from '../../shared/character.js';
import { CHARACTERS } from '../components/pixelData.js';
import { bob, pulseAlpha } from './animations.js';

const OUTLINE_BY_STATUS: Record<CharacterStatus, number | null> = {
  off: null,
  idle: null,
  thinking: 0x3b82f6,
  working: 0x10b981,
  blocked: 0xf59e0b,
  error: 0xef4444,
  done: 0x22c55e,
};

interface Tween {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  durationMs: number;
  elapsed: number;
  resolve: () => void;
}

/**
 * 3px pixel scale × 16 wide = 48px sprite width. Sprite is centered at (0,0)
 * with feet slightly below origin so the character stands on the tile.
 */
const PIXEL_SIZE = 3;

function hexFromCss(css: string): number | null {
  if (!css || css === 'transparent') return null;
  if (css.startsWith('#')) {
    const hex = css.slice(1);
    if (hex.length === 3) {
      return parseInt(hex.split('').map((c) => c + c).join(''), 16);
    }
    if (hex.length === 6) return parseInt(hex, 16);
  }
  return null;
}

export class CharacterSprite extends Container {
  private body = new Container();
  private bodyGraphics = new Graphics();
  private statusRing = new Graphics();
  private nameLabel: Text;
  private elapsed = 0;
  private currentStatus: CharacterStatus = 'idle';
  private tweenTo?: Tween;
  private facing: 1 | -1 = 1;

  constructor(private id: CharacterId, name: string) {
    super();
    this.drawSprite();
    this.body.addChild(this.bodyGraphics);
    this.body.addChild(this.statusRing);
    this.addChild(this.body);

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
    this.nameLabel.y = 24;
    this.addChild(this.nameLabel);

    this.setStatus('idle');
  }

  /** Render the 16x20 pixel matrix, centered horizontally, feet at y=0. */
  private drawSprite(): void {
    const spec = CHARACTERS[this.id];
    if (!spec) return;
    const g = this.bodyGraphics;
    g.clear();
    const w = spec.pixels[0]?.length ?? 0;
    const h = spec.pixels.length;
    const originX = -Math.floor((w * PIXEL_SIZE) / 2);
    const originY = -h * PIXEL_SIZE + 4; // feet slightly below origin
    for (let y = 0; y < h; y++) {
      const row = spec.pixels[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const col = spec.palette[ch];
        const hex = hexFromCss(col);
        if (hex === null) continue;
        g.rect(originX + x * PIXEL_SIZE, originY + y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE)
         .fill(hex);
      }
    }
  }

  setStatus(status: CharacterStatus): void {
    this.currentStatus = status;
    const ring = OUTLINE_BY_STATUS[status];
    this.statusRing.clear();
    if (ring !== null) {
      const spec = CHARACTERS[this.id];
      const w = (spec.pixels[0]?.length ?? 0) * PIXEL_SIZE;
      const h = spec.pixels.length * PIXEL_SIZE;
      this.statusRing.rect(-w / 2 - 2, -h + 2, w + 4, h + 2)
        .stroke({ color: ring, width: 2, alpha: 0.85 });
    }
    // Reset transient body transforms when animation doesn't apply
    if (status !== 'idle' && status !== 'working' && !this.tweenTo) {
      this.body.y = 0;
    }
    if (status !== 'thinking') {
      this.body.alpha = 1;
    }
    // Faded when off (unused in current logic; kept for parity)
    if (status === 'off') this.alpha = 0.4;
    else this.alpha = 1;
  }

  moveTo(x: number, y: number, durationMs: number): Promise<void> {
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
    // Face the direction of travel
    if (x < this.x - 2) this.setFacing(-1);
    else if (x > this.x + 2) this.setFacing(1);
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

  private setFacing(dir: 1 | -1): void {
    if (this.facing === dir) return;
    this.facing = dir;
    this.body.scale.x = dir;
  }

  tick(deltaMs: number): void {
    this.elapsed += deltaMs;
    const isWalking = !!this.tweenTo;
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
      }
    }

    // Walking gait: bigger bounce; idle: soft bob; working: quick bob
    if (isWalking) {
      this.body.y = bob(this.elapsed, 4, 300);
    } else if (this.currentStatus === 'idle') {
      this.body.y = bob(this.elapsed, 1.5, 1400);
    } else if (this.currentStatus === 'working') {
      this.body.y = bob(this.elapsed, 3, 700);
    } else {
      this.body.y = 0;
    }

    if (this.currentStatus === 'thinking' && !isWalking) {
      this.body.alpha = pulseAlpha(this.elapsed);
    } else {
      this.body.alpha = 1;
    }
  }

  setLabel(_text?: string): void {
    // Reserved for future extraLabel; currently no-op on new sprite.
  }
}
