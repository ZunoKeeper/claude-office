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
  private homePositions = new Map<CharacterId, { x: number; y: number }>();
  private lastActivity = new Map<CharacterId, string | undefined>();

  private toolDestination(toolName: string): { x: number; y: number } | null {
    switch (toolName) {
      case 'Bash':
        return { x: 860, y: 160 }; // 서버실
      case 'WebFetch':
      case 'WebSearch':
        return { x: 200, y: 160 }; // 회의실
      default:
        return null;
    }
  }

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
    void this.init();
  }

  private async init() {
    await this.app.init({ canvas: this.canvas, width: 1024, height: 640, background: '#e5e7d5' });
    this.app.stage.addChild(this.root);
    this.drawBackground();
    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS;
      for (const s of this.sprites.values()) s.tick(dt);
    });
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
        this.homePositions.set(s.id, { x: cfg.officeSeat.x, y: cfg.officeSeat.y });
      }
      sprite.setStatus(s.status);

      const currTool = s.currentActivity?.toolName;
      const prevTool = this.lastActivity.get(s.id);
      if (currTool !== prevTool) {
        this.lastActivity.set(s.id, currTool);
        const dest = currTool ? this.toolDestination(currTool) : null;
        const home = this.homePositions.get(s.id);
        if (dest) {
          void sprite.moveTo(dest.x, dest.y, 700);
        } else if (home) {
          void sprite.moveTo(home.x, home.y, 500);
        }
      }
    }
  }

  destroy() { this.app.destroy(true); }
}
