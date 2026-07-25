import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

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
    g.rect(0, 0, 1024, 640).fill('#f3efdc');
    // 방 구획선 (임시 사각형)
    const rooms = [
      { x: 40, y: 60,  w: 320, h: 200, label: '회의실' },
      { x: 400, y: 60,  w: 300, h: 200, label: '개발실' },
      { x: 740, y: 60,  w: 240, h: 200, label: '서버실' },
      { x: 40, y: 320, w: 320, h: 280, label: '서고' },
      { x: 400, y: 320, w: 300, h: 280, label: '자리' },
      { x: 740, y: 320, w: 240, h: 200, label: '검수/디자인' },
      { x: 740, y: 540, w: 240, h: 60,  label: '탕비실/로비' },
    ];
    for (const r of rooms) {
      g.rect(r.x, r.y, r.w, r.h).stroke({ color: '#9ca3af', width: 2 });
      const t = new Text({ text: r.label, style: { fontSize: 12, fill: '#6b7280' } });
      t.x = r.x + 8; t.y = r.y + 6;
      this.root.addChild(t);
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
