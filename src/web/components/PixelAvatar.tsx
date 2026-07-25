import type { CharacterId } from '../../shared/character.js';

/**
 * PixelAvatar — inline SVG chibi sprites in the Kairosoft/Game Dev Story tradition.
 *
 * Each character is a 16x20 pixel matrix. Rows are top-to-bottom.
 * Every character in `.` is transparent; letters map to palette entries below.
 * The svg viewBox is 16x20; browser scales cleanly. `image-rendering: pixelated`
 * keeps the aliasing look on high-density displays.
 *
 * Legend (shared unless overridden per character):
 *   H = hair / hood       F = skin            E = eye (near-black)
 *   M = mouth (dark)      G = glasses frame   S = shirt / outfit main
 *   T = accent (tie / stripe / lanyard)
 *   A = accessory main    B = accessory dark
 *   K = outline           . = transparent
 */

const OUTLINE = '#1a1a1a';
const SKIN = '#ffe0b8';
const EYE = '#111';
const MOUTH = '#3a1810';

type Palette = Record<string, string>;

const BASE_PALETTE: Palette = {
  '.': 'transparent',
  K: OUTLINE,
  F: SKIN,
  E: EYE,
  M: MOUTH,
};

interface CharSpec {
  pixels: string[];
  palette: Palette;
}

/* --- Character designs (all 16 wide x 20 tall) --- */

const kim: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#7c3aed', S: '#f8fafc', T: '#dc2626', G: OUTLINE },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHFFFFFFHK....',
    '..KHFFFFFFFK....',
    '..KFGGFFGGFK....',  // glasses
    '..KFGEFFGEFK....',
    '..KFGGFFGGFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSTTSSSSSK.',
    '.KSSSSSTTSSSSSK.',
    '.KSSSSSTTSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const park: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#1e40af', S: '#2563eb', T: '#f59e0b' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHKKKKHHK....',   // spiky hair with peaks
    '..KHKHHHHKHK....',
    '..KHFFFFFFHK....',
    '..KHFFFFFFFK....',
    '..KFFEFFEFFK....',
    '..KFFFFFFFFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSTSSSSSTSSSK.',   // shoulder pads
    '.KSSTTSSSSTTSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const lee: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#0d9488', S: '#14b8a6', G: OUTLINE, A: '#94a3b8' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHKHHK.....',   // messy hair
    '..KHHKHHKHHK....',
    '..KHKHHHHKHK....',
    '..KHFFFFFFHK....',
    '..KHFFFFFFFK....',
    '..KFGGFFGGFK....',   // big round glasses
    '..KFGEFFGEFK....',
    '..KFGGFFGGFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSAAAASSSSK.',   // clipboard held
    '.KSSSABAABASSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const yu: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#f97316', S: '#7c2d12', A: '#111', B: '#f97316' },
  pixels: [
    '................',
    '..KKKKKKKKKK....',   // hoodie top
    '.KHHHHHHHHHHK...',
    '.KHHHHHHHHHHK...',
    '.KHHHHHHHHHHK...',
    '.KHHFFFFFFHHK...',   // hoodie framing face
    '.KHFFFFFFFFHK...',
    'AKFFEFFFFEFFKA..',   // headphones on sides
    'ABFFFFFFFFFFBA..',
    'ABFFFFFFFFFFBA..',
    '.KFFFFFMMFFFK...',
    '..KFFFFFFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKHHHHHHHHKK..',   // hoodie body
    '.KHHHHHHHHHHHHK.',
    '.KHHHHHHHHHHHHK.',
    '.KHHHHHHHHHHHHK.',
    '.KHHHHHHHHHHHHK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const han: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#be185d', S: '#831843', G: OUTLINE, A: '#f5f5dc', B: '#111' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',   // bob cut, thick sides
    '..KHFFFFFFHK....',
    '..KFGGFFGGFK....',
    '..KFGEFFGEFK....',
    '..KFGGFFGGFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSAAAAAASSSSK.',   // clipboard held up
    '.KSSABBBBBASSSSK',
    '.KSSABBBBBASSSSK',
    '.KSSAAAAAASSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const seo: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#c026d3', S: '#a21caf', A: '#f5deb3', B: '#e11d48' },
  pixels: [
    '................',
    '...KKKKKKKK.....',   // asymmetric hair
    '..KHHHHHHHHK....',
    '..KHHHHHHHHHK...',   // longer on right
    '..KHHHHHHHHHK...',
    '..KHHFFFFFHHK...',
    '..KHFFFFFFFHK...',
    '..KHFEFFFFEFK...',
    '..KHFFFFFFFFK...',
    '..KFFFFFFFFFK...',
    '..KFFFMMMFFFK...',   // wider smile
    '...KFFFFFFFK....',
    '....KFFFFFK.....',
    '.....KFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSAAABBBAASSK.',   // tablet w/ color chip
    '.KSSAAABBBAASSK.',
    '.KSSSSSSSSSSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const jo: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#94a3b8', S: '#1e293b', T: '#7f1d1d', A: '#7f4f14' },
  pixels: [
    '................',
    '.....KKKK.......',
    '....KHHHHK......',   // receding hair
    '...KHHHHHHK.....',
    '...KHFFFFHHK....',
    '...KFFFFFFFK....',
    '..KKFFFFFFFK....',
    '..KFFEFFFFEFK...',
    '..KFFFFFFFFFK...',
    '..KFFFFFFFFFK...',
    '..KFFFFMMFFFK...',
    '...KFFFFFFFK....',
    '....KFFFFFK.....',
    '.....KFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSTTTTTTSSSK.',   // lapels
    '.KSSSSSSSSSSSSK.',
    '.KSSSAAAAAAASSK.',   // book held
    '.KSSSABBBBBASSSK',
    '.KKKKKKKKKKKKKK.',
  ],
};

const jung: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#16a34a', S: '#facc15', A: '#111', B: '#facc15' },
  pixels: [
    '................',
    '....KKKKKK......',
    '...KHHHHHHK.....',
    '..KHHHHHHHHK....',
    '.KHHHHHHHHHHK...',   // wilder hair
    '..KHFFFFFFHHK...',
    '..KHFFFFFFFHK...',
    'AKFFEEFFEEFFKA..',   // headphones + big eyes
    'ABFFFFFFFFFFBA..',
    '.KFFFFFFFFFFK...',
    '.KFFFMMMMFFFK...',   // wide grin
    '..KFFFFFFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSSSSSSSSSSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const choi: CharSpec = {
  palette: { ...BASE_PALETTE, H: '#eab308', S: '#78716c', T: '#22c55e', A: '#f5f5dc' },
  pixels: [
    '................',
    '.....KKKKK......',
    '....KHHHHHK.....',   // tied hair (small bun)
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHHHHHHHHK....',
    '..KHFFFFFFHK....',
    '..KHFEFFFEFK....',
    '..KFFFFFFFFK....',
    '..KFFFFFFFFK....',
    '..KFFFMMFFFK....',
    '...KFFFFFFK.....',
    '....KFFFFK......',
    '..KKSSSSSSSSKK..',
    '.KSSSSSSSSSSSSK.',
    '.KSSAAAAAAASSSK.',   // folder held
    '.KSSATTTTTASSSK.',   // colored highlighter tabs
    '.KSSATTTTTASSSK.',
    '.KSSAAAAAAASSSK.',
    '.KKKKKKKKKKKKKK.',
  ],
};

const CHARACTERS: Record<CharacterId, CharSpec> = {
  'kim-team-lead': kim,
  'park-planner': park,
  'lee-researcher': lee,
  'yu-dev': yu,
  'han-qa': han,
  'seo-designer': seo,
  'jo-senior': jo,
  'jung-newbie': jung,
  'choi-office': choi,
};

interface Props {
  id: CharacterId;
  size?: number;
}

export function PixelAvatar({ id, size = 48 }: Props) {
  const spec = CHARACTERS[id];
  if (!spec) return null;
  const height = spec.pixels.length;
  const width = spec.pixels[0]?.length ?? 0;
  const rects: JSX.Element[] = [];
  for (let y = 0; y < height; y++) {
    const row = spec.pixels[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = spec.palette[ch];
      if (!color || color === 'transparent') continue;
      rects.push(<rect key={`${y}-${x}`} x={x} y={y} width={1} height={1} fill={color} />);
    }
  }
  const scaledHeight = Math.round((size * height) / width);
  return (
    <svg
      className="pixel-avatar"
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={scaledHeight}
      shapeRendering="crispEdges"
      style={{ imageRendering: 'pixelated', display: 'block' }}
    >
      {rects}
    </svg>
  );
}
