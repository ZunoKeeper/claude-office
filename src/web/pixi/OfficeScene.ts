import { Application, Container, Graphics } from 'pixi.js';
import type { CharacterId, CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { screenXY } from './IsometricGrid.js';
import { CharacterSprite } from './CharacterSprite.js';

export class OfficeScene {
  private app: Application;
  private root = new Container();
  private ready = false;
  private sprites = new Map<CharacterId, CharacterSprite>();

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
    const cfgMap = new Map(configs.map((c) => [c.id, c]));
    for (const s of states) {
      const cfg = cfgMap.get(s.id);
      if (!cfg) continue;
      let sprite = this.sprites.get(s.id);
      if (!sprite) {
        sprite = new CharacterSprite(s.id, cfg.name);
        sprite.x = cfg.officeSeat.x;
        sprite.y = cfg.officeSeat.y;
        this.root.addChild(sprite);
        this.sprites.set(s.id, sprite);
      }
      sprite.setStatus(s.status);
    }
  }

  destroy() { this.app.destroy(true); }
}
