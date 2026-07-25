import { Container, Graphics, Text } from 'pixi.js';
import type { CharacterId, CharacterStatus } from '../../shared/character.js';
import { bob, pulseAlpha } from './animations.js';

const TINT: Record<CharacterId, number> = {
  'kim-team-lead': 0x8b5cf6,
  'park-planner': 0x3b82f6,
  'lee-researcher': 0x14b8a6,
  'yu-dev': 0xf59e0b,
  'han-qa': 0xec4899,
  'seo-designer': 0xa855f7,
  'jo-senior': 0x64748b,
  'jung-newbie': 0x22c55e,
  'choi-office': 0xf97316,
};

const OUTLINE: Record<CharacterStatus, number | null> = {
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

export class CharacterSprite extends Container {
  private body = new Graphics();
  private statusDot = new Graphics();
  private nameLabel: Text;
  private extraLabel: Text;
  private elapsed = 0;
  private currentStatus: CharacterStatus = 'off';
  private tweenTo?: Tween;

  constructor(private id: CharacterId, name: string) {
    super();
    this.nameLabel = new Text({
      text: name,
      style: { fontSize: 10, fill: 0x111827, fontWeight: 'bold' },
    });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.y = 22;

    this.extraLabel = new Text({
      text: '',
      style: { fontSize: 9, fill: 0x374151 },
    });
    this.extraLabel.anchor.set(0.5, 0);
    this.extraLabel.y = 34;
    this.extraLabel.visible = false;

    this.addChild(this.body, this.statusDot, this.nameLabel, this.extraLabel);
    this.setStatus('off');
  }

  setStatus(status: CharacterStatus): void {
    this.currentStatus = status;
    this.body.clear();
    const tint = TINT[this.id];
    const alpha = status === 'off' ? 0.35 : 1;
    // 몸통 (사각형) + 머리 (원)
    this.body.rect(-10, -6, 20, 18).fill({ color: tint, alpha });
    this.body.circle(0, -12, 8).fill({ color: 0xfde68a, alpha });
    const outline = OUTLINE[status];
    if (outline !== null) {
      this.body.rect(-12, -22, 24, 42).stroke({ color: outline, width: 2 });
    }
    this.statusDot.clear();
    this.statusDot.circle(10, -22, 4).fill(outline ?? 0x9ca3af);
    // Reset transient body transforms when not animated
    if (status !== 'idle' && status !== 'working') {
      this.body.y = 0;
    }
    if (status !== 'thinking') {
      this.body.alpha = 1;
    }
  }

  moveTo(x: number, y: number, durationMs: number): Promise<void> {
    // If a previous tween is in flight, resolve it immediately so callers
    // awaiting it don't leak; new tween supersedes.
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
    this.elapsed += deltaMs;
    if (this.tweenTo) {
      this.tweenTo.elapsed += deltaMs;
      const t = Math.min(1, this.tweenTo.elapsed / this.tweenTo.durationMs);
      // easeInOutQuad
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.x = this.tweenTo.startX + (this.tweenTo.targetX - this.tweenTo.startX) * ease;
      this.y = this.tweenTo.startY + (this.tweenTo.targetY - this.tweenTo.startY) * ease;
      if (t >= 1) {
        const done = this.tweenTo.resolve;
        this.tweenTo = undefined;
        done();
      }
    }
    if (this.currentStatus === 'idle' || this.currentStatus === 'working') {
      this.body.y = bob(this.elapsed, this.currentStatus === 'working' ? 3 : 1.5);
    } else {
      this.body.y = 0;
    }
    if (this.currentStatus === 'thinking') {
      this.body.alpha = pulseAlpha(this.elapsed);
    } else if (this.currentStatus !== 'off') {
      this.body.alpha = 1;
    }
  }

  setLabel(text?: string): void {
    if (text && text.length > 0) {
      this.extraLabel.text = text;
      this.extraLabel.visible = true;
    } else {
      this.extraLabel.text = '';
      this.extraLabel.visible = false;
    }
  }
}
