import bodyUrl from '../../assets/metrocity/body.png';
import shadowUrl from '../../assets/metrocity/shadow.png';
import hairsUrl from '../../assets/metrocity/hairs.png';
import hairGoldUrl from '../../assets/metrocity/hair-gold.png';
import suitUrl from '../../assets/metrocity/suit.png';
import suit1Url from '../../assets/metrocity/suit1.png';
import outfit1Url from '../../assets/metrocity/outfit1.png';
import outfit2Url from '../../assets/metrocity/outfit2.png';
import outfit3Url from '../../assets/metrocity/outfit3.png';
import outfit4Url from '../../assets/metrocity/outfit4.png';
import outfit5Url from '../../assets/metrocity/outfit5.png';
import outfit6Url from '../../assets/metrocity/outfit6.png';

/** 시트 이름(공유 카탈로그의 sheet 키와 동일) → 번들 URL. */
const SHEET_URLS: Record<string, string> = {
  body: bodyUrl, shadow: shadowUrl, hairs: hairsUrl, 'hair-gold': hairGoldUrl,
  suit: suitUrl, suit1: suit1Url,
  outfit1: outfit1Url, outfit2: outfit2Url, outfit3: outfit3Url,
  outfit4: outfit4Url, outfit5: outfit5Url, outfit6: outfit6Url,
};

const loaded = new Map<string, HTMLImageElement>();

/** 앱 시작 시 1회 — 모든 시트를 로드한 뒤에야 합성이 가능하다. */
export async function loadSheets(): Promise<void> {
  await Promise.all(Object.entries(SHEET_URLS).map(([name, url]) =>
    new Promise<void>((resolve, reject) => {
      if (loaded.has(name)) return resolve();
      const img = new Image();
      img.onload = () => { loaded.set(name, img); resolve(); };
      img.onerror = () => reject(new Error(`스프라이트 시트 로드 실패: ${name}`));
      img.src = url;
    })));
}

export function getSheet(name: string): HTMLImageElement {
  const img = loaded.get(name);
  if (!img) throw new Error(`시트가 로드되지 않음: ${name}`);
  return img;
}
