import type { PixelMatrix } from './types.js';

/**
 * Six shared body silhouettes (24×32). Direction is conveyed by the head/face
 * overlays layered on top, so a single frontal body is reused across N/S/E/W.
 * That trades some anatomical accuracy for a large art savings — the Kairosoft
 * roster of tiny chibi characters uses the same trick.
 *
 * Symbols (see types.ts): K=outline, F=skin, S=shirt, P=pants, Z=shoes.
 * Face reveal (F block, rows 4-13) is where hair/face overlays will paint.
 */

/** Standing, both feet on ground. */
export const bodyStand: PixelMatrix = [
  /* 00 */ '........................',
  /* 01 */ '........................',
  /* 02 */ '........KKKKKKKK........',
  /* 03 */ '......KKFFFFFFFFKK......',
  /* 04 */ '.....KFFFFFFFFFFFFK.....',
  /* 05 */ '.....KFFFFFFFFFFFFK.....',
  /* 06 */ '.....KFFFFFFFFFFFFK.....',
  /* 07 */ '.....KFFFFFFFFFFFFK.....',
  /* 08 */ '.....KFFFFFFFFFFFFK.....',
  /* 09 */ '.....KFFFFFFFFFFFFK.....',
  /* 10 */ '.....KFFFFFFFFFFFFK.....',
  /* 11 */ '.....KFFFFFFFFFFFFK.....',
  /* 12 */ '......KFFFFFFFFFFK......',
  /* 13 */ '.......KFFFFFFFFK.......',
  /* 14 */ '........KKFFFFKK........',
  /* 15 */ '.........KFFFFK.........',
  /* 16 */ '......KKSSSSSSSSKK......',
  /* 17 */ '.....KSSSSSSSSSSSSK.....',
  /* 18 */ '....KSSSSSSSSSSSSSSK....',
  /* 19 */ '....KSSSSSSSSSSSSSSK....',
  /* 20 */ '....KSSSSSSSSSSSSSSK....',
  /* 21 */ '....KSSSSSSSSSSSSSSK....',
  /* 22 */ '....KSSSSSSSSSSSSSSK....',
  /* 23 */ '....KKSSSSSSSSSSSSKK....',
  /* 24 */ '......KKKKKKKKKKKK......',
  /* 25 */ '......KPPPPPPPPPPK......',
  /* 26 */ '......KPPPK..KPPPK......',
  /* 27 */ '......KPPPK..KPPPK......',
  /* 28 */ '......KPPPK..KPPPK......',
  /* 29 */ '......KPPPK..KPPPK......',
  /* 30 */ '......KZZZK..KZZZK......',
  /* 31 */ '......KKKKK..KKKKK......',
];

/** Walk cycle frame 1 — right foot lifted 2px. */
export const bodyWalk1: PixelMatrix = [
  ...bodyStand.slice(0, 26),
  /* 26 */ '......KPPPK..KPPPK......',
  /* 27 */ '......KPPPK..KPPPK......',
  /* 28 */ '......KPPPK..KZZZK......',
  /* 29 */ '......KPPPK..KKKKK......',
  /* 30 */ '......KZZZK.............',
  /* 31 */ '......KKKKK.............',
];

/** Walk cycle frame 2 — left foot lifted 2px. */
export const bodyWalk2: PixelMatrix = [
  ...bodyStand.slice(0, 26),
  /* 26 */ '......KPPPK..KPPPK......',
  /* 27 */ '......KPPPK..KPPPK......',
  /* 28 */ '......KZZZK..KPPPK......',
  /* 29 */ '......KKKKK..KPPPK......',
  /* 30 */ '.............KZZZK......',
  /* 31 */ '.............KKKKK......',
];

/**
 * Sitting at desk. Legs hidden by desk drawn in OfficeScene.
 * Body rows 0-23 identical to stand.
 */
export const bodySit: PixelMatrix = [
  ...bodyStand.slice(0, 24),
  /* 24 */ '......KKKKKKKKKKKK......',
  /* 25 */ '......KPPPPPPPPPPK......',
  /* 26 */ '......KPPPPPPPPPPK......',
  /* 27 */ '......KKKKKKKKKKKK......',
  /* 28 */ '........................',
  /* 29 */ '........................',
  /* 30 */ '........................',
  /* 31 */ '........................',
];

/** Typing frame 1 — hands lifted (arm skin pixels at inside torso edge). */
export const bodyType1: PixelMatrix = [
  /* 00 */ '........................',
  /* 01 */ '........................',
  /* 02 */ '........KKKKKKKK........',
  /* 03 */ '......KKFFFFFFFFKK......',
  /* 04 */ '.....KFFFFFFFFFFFFK.....',
  /* 05 */ '.....KFFFFFFFFFFFFK.....',
  /* 06 */ '.....KFFFFFFFFFFFFK.....',
  /* 07 */ '.....KFFFFFFFFFFFFK.....',
  /* 08 */ '.....KFFFFFFFFFFFFK.....',
  /* 09 */ '.....KFFFFFFFFFFFFK.....',
  /* 10 */ '.....KFFFFFFFFFFFFK.....',
  /* 11 */ '.....KFFFFFFFFFFFFK.....',
  /* 12 */ '......KFFFFFFFFFFK......',
  /* 13 */ '.......KFFFFFFFFK.......',
  /* 14 */ '........KKFFFFKK........',
  /* 15 */ '.........KFFFFK.........',
  /* 16 */ '......KKSSSSSSSSKK......',
  /* 17 */ '.....KSSSSSSSSSSSSK.....',
  /* 18 */ '....KSSSSSSSSSSSSSSK....',
  /* 19 */ '....KSSSSSSSSSSSSSSK....',
  /* 20 */ '....KSSSAAAASSAAAASSK...',
  /* 21 */ '....KSSAKKAASSAAKKASK...',
  /* 22 */ '....KSSSSSSSSSSSSSSK....',
  /* 23 */ '....KKSSSSSSSSSSSSKK....',
  /* 24 */ '......KKKKKKKKKKKK......',
  /* 25 */ '......KPPPPPPPPPPK......',
  /* 26 */ '......KPPPPPPPPPPK......',
  /* 27 */ '......KKKKKKKKKKKK......',
  /* 28 */ '........................',
  /* 29 */ '........................',
  /* 30 */ '........................',
  /* 31 */ '........................',
];

/** Typing frame 2 — hands down (offset). */
export const bodyType2: PixelMatrix = [
  ...bodyType1.slice(0, 20),
  /* 20 */ '....KSSSSSSSSSSSSSSK....',
  /* 21 */ '....KSSAAKKASSAAKKASSK..',
  /* 22 */ '....KSSSAAAASSAAAAASSK..',
  /* 23 */ '....KKSSSSSSSSSSSSKK....',
  ...bodyType1.slice(24),
];
