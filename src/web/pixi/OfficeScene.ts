import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { screenXY } from './IsometricGrid.js';

export class OfficeScene {
  private app: Application;
  private root = new Container();
  private ready = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
    void this.init();
  }

  private async init() {
    await this.app.init({ canvas: this.canvas, width: 1024, height: 640, background: '#e5e7d5' });
    this.app.stage.addChild(this.root);
    this.drawBackground();
    this.ready = true;
  }

  private drawBackground() {
    const g = new Graphics();
    g.rect(0, 0, 1024, 640).fill('#efe6c8');
    const cols = 14, rows = 10;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const { x: sx, y: sy } = screenXY(x, y);
        g.poly([sx, sy, sx + 32, sy + 16, sx, sy + 32, sx - 32, sy + 16])
         .fill((x + y) % 2 === 0 ? '#e5d9a8' : '#dcc98c')
         .stroke({ color: '#c1a55d', width: 1 });
      }
    }
    this.root.addChild(g);
  }

  setCharacters(states: CharacterState[], configs: CharacterConfig[]): void {
    if (!this.ready) return;
    // v19 최소 구현: 좌표에 원 + 이름 텍스트만 배치 (스프라이트는 Task 21)
    this.root.removeChildren();
    this.drawBackground();
    const cfgMap = new Map(configs.map((c) => [c.id, c]));
    for (const s of states) {
      const cfg = cfgMap.get(s.id);
      if (!cfg) continue;
      const marker = new Graphics();
      const color = s.status === 'off' ? '#9ca3af' :
                    s.status === 'working' ? '#10b981' :
                    s.status === 'error' ? '#ef4444' : '#3b82f6';
      marker.circle(cfg.officeSeat.x, cfg.officeSeat.y, 12).fill(color);
      this.root.addChild(marker);
      const label = new Text({ text: cfg.name, style: { fontSize: 11, fill: '#111827' } });
      label.x = cfg.officeSeat.x - 15; label.y = cfg.officeSeat.y + 16;
      this.root.addChild(label);
    }
  }

  destroy() { this.app.destroy(true); }
}
