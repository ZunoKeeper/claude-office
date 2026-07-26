import { Texture } from 'pixi.js';

/** 이모트 전용 도트 표기 — 캐릭터 스프라이트와 무관한 독립 자산. */
type PixelMatrix = readonly string[];
type Palette = Record<string, string | null>;

export const EMOTE_SIZE = 12;
export type EmoteId = 'question' | 'exclaim' | 'sweat' | 'idea' | 'heart';

const question: PixelMatrix = [
  '............',
  '....KKKK....',
  '..KKyyyyKK..',
  '..KyKKKKyK..',
  '..KKKKKyyK..',
  '......KyyK..',
  '.....KyyK...',
  '.....Ky.K...',
  '.....KKK....',
  '............',
  '.....KKK....',
  '.....KyK....',
];

const exclaim: PixelMatrix = [
  '............',
  '.....KKK....',
  '....KrrrK...',
  '....KrrrK...',
  '....KrrrK...',
  '....KrrrK...',
  '....KrrrK...',
  '.....KrK....',
  '.....KKK....',
  '............',
  '....KrrK....',
  '....KKKK....',
];

const sweat: PixelMatrix = [
  '............',
  '............',
  '......K.....',
  '.....KbK....',
  '....KbbbK...',
  '...KbwbbK...',
  '...Kbbbbb...',
  '...KbbbbbK..',
  '...KbbbbbK..',
  '....KbbbK...',
  '.....KKK....',
  '............',
];

const idea: PixelMatrix = [
  '............',
  '....KKKK....',
  '...KyyyyK...',
  '..KyywyyyK..',
  '..KyyyyyyK..',
  '..KyyyyyyK..',
  '...KyyyyK...',
  '....KyyK....',
  '....KaaK....',
  '....KaaK....',
  '....KKKK....',
  '.....KK.....',
];

const heart: PixelMatrix = [
  '............',
  '..KKK..KKK..',
  '.KppKKKppK..',
  '.KpppppppK..',
  '.KwppppppK..',
  '.KpppppppK..',
  '..KpppppK...',
  '...KpppK....',
  '....KpK.....',
  '.....K......',
  '............',
  '............',
];

export const EMOTE_MATRICES: Record<EmoteId, PixelMatrix> = {
  question, exclaim, sweat, idea, heart,
};

const EMOTE_PALETTE: Palette = {
  '.': null,
  K: '#1a1a1a',
  y: '#facc15',
  r: '#ef4444',
  b: '#3b82f6',
  w: '#ffffff',
  a: '#94a3b8',
  p: '#ec4899',
};

let cachedTextures: Record<EmoteId, Texture> | null = null;

export function buildEmoteTextures(): Record<EmoteId, Texture> {
  if (cachedTextures) return cachedTextures;
  const out = {} as Record<EmoteId, Texture>;
  for (const [id, matrix] of Object.entries(EMOTE_MATRICES) as [EmoteId, PixelMatrix][]) {
    const canvas = document.createElement('canvas');
    canvas.width = EMOTE_SIZE;
    canvas.height = EMOTE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('emote: 2D context unavailable');
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < EMOTE_SIZE; y++) {
      const row = matrix[y] ?? '';
      for (let x = 0; x < EMOTE_SIZE; x++) {
        const ch = row[x];
        if (!ch || ch === '.') continue;
        const color = EMOTE_PALETTE[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    out[id] = tex;
  }
  cachedTextures = out;
  return out;
}
