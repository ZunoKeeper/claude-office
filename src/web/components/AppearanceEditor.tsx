import { useEffect, useRef } from 'react';
import {
  HAIR_SHEETS, OUTFIT_SHEETS, SKIN_COUNT,
  type CharacterAppearance, type SpritePartRef,
} from '../../shared/sprites.js';
import { composeFrame } from '../pixi/sprites/compose.js';
import { FRAME_H, FRAME_W, frameRect } from '../pixi/sprites/frames.js';
import { getSheet } from '../pixi/sprites/sheets.js';
import type { PoseKey } from '../pixi/sprites/types.js';

/**
 * 스프라이트 조합 에디터 — 피부톤 × 헤어 × 의상을 골라 CharacterAppearance를
 * 만든다. 저장은 부모(SettingsScreen)가 문서 전체를 PUT 한다.
 */

interface Props {
  value: CharacterAppearance;
  onChange(next: CharacterAppearance): void;
}

/** 시트 한 행의 정면(stand-S) 프레임을 그리는 썸네일 캔버스. */
function PartCanvas({ sheet, row, size = 44 }: { sheet: string; row: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, FRAME_W, FRAME_H);
    try {
      const r = frameRect('S', 0, row);
      ctx.drawImage(getSheet(sheet), r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    } catch { /* 시트 미로드 */ }
  }, [sheet, row]);
  return (
    <canvas ref={ref} width={FRAME_W} height={FRAME_H}
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }} />
  );
}

function partKey(ref: SpritePartRef | null): string {
  return ref ? `${ref.sheet}:${ref.row}` : 'none';
}

/** 파트 선택 그리드 — "없음" 셀 + 카탈로그의 모든 시트×행. */
function PartGrid({ sheets, value, onPick }: {
  sheets: Readonly<Record<string, number>>;
  value: SpritePartRef | null;
  onPick(next: SpritePartRef | null): void;
}) {
  const cells: Array<SpritePartRef | null> = [null];
  for (const [sheet, rows] of Object.entries(sheets)) {
    for (let row = 0; row < rows; row++) cells.push({ sheet, row });
  }
  return (
    <div className="part-grid">
      {cells.map((cell) => (
        <button
          key={partKey(cell)}
          type="button"
          className={`part-thumb ${partKey(value) === partKey(cell) ? 'active' : ''}`}
          title={cell ? `${cell.sheet} #${cell.row + 1}` : '없음'}
          onClick={() => onPick(cell)}
        >
          {cell ? <PartCanvas sheet={cell.sheet} row={cell.row} /> : <span className="part-none">✕</span>}
        </button>
      ))}
    </div>
  );
}

/** 미리보기 — 4방향 서기 + 정면 걷기 애니메이션. */
function Preview({ appearance }: { appearance: CharacterAppearance }) {
  const stillPoses: PoseKey[] = ['stand-S', 'stand-E', 'stand-N', 'stand-W'];
  const walkRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = walkRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, FRAME_W, FRAME_H);
      try {
        ctx.drawImage(composeFrame(appearance, `walk${(frame % 6) + 1 as 1 | 2 | 3 | 4 | 5 | 6}-S`), 0, 0);
      } catch { /* 시트 미로드 */ }
      frame += 1;
    };
    draw();
    const timer = setInterval(draw, 160);
    return () => clearInterval(timer);
  }, [appearance]);

  return (
    <div className="appearance-preview">
      {stillPoses.map((pose) => <PoseCanvas key={pose} appearance={appearance} pose={pose} />)}
      <canvas ref={walkRef} width={FRAME_W} height={FRAME_H} title="걷기"
        style={{ width: 64, height: 64, imageRendering: 'pixelated' }} />
    </div>
  );
}

function PoseCanvas({ appearance, pose }: { appearance: CharacterAppearance; pose: PoseKey }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, FRAME_W, FRAME_H);
    try { ctx.drawImage(composeFrame(appearance, pose), 0, 0); } catch { /* 시트 미로드 */ }
  }, [appearance, pose]);
  return (
    <canvas ref={ref} width={FRAME_W} height={FRAME_H} title={pose}
      style={{ width: 64, height: 64, imageRendering: 'pixelated' }} />
  );
}

export function AppearanceEditor({ value, onChange }: Props) {
  return (
    <div className="appearance-editor">
      <Preview appearance={value} />
      <div className="appearance-sections">
        <div className="appearance-section">
          <span className="appearance-label">피부톤</span>
          <div className="part-grid">
            {Array.from({ length: SKIN_COUNT }, (_, skin) => (
              <button
                key={skin}
                type="button"
                className={`part-thumb ${value.skin === skin ? 'active' : ''}`}
                title={`피부톤 ${skin + 1}`}
                onClick={() => onChange({ ...value, skin })}
              >
                <PartCanvas sheet="body" row={skin} />
              </button>
            ))}
          </div>
        </div>
        <div className="appearance-section">
          <span className="appearance-label">헤어</span>
          <PartGrid sheets={HAIR_SHEETS} value={value.hair} onPick={(hair) => onChange({ ...value, hair })} />
        </div>
        <div className="appearance-section">
          <span className="appearance-label">의상</span>
          <PartGrid sheets={OUTFIT_SHEETS} value={value.outfit} onPick={(outfit) => onChange({ ...value, outfit })} />
        </div>
      </div>
    </div>
  );
}
