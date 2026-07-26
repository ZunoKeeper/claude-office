import { useEffect, useRef, useState } from 'react';
import { OfficeScene } from '../pixi/OfficeScene.js';
import { useCharacterStore } from '../store/characterStore.js';
import { ALL_CHARACTER_IDS, type CharacterId, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig, SeatDirection, SeatPose } from '../../shared/config.js';
import { OfficeOverlay } from './OfficeOverlay.js';

function empty(id: CharacterConfig['id']): CharacterState {
  return { id, status: 'off', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

const DIRECTIONS: Array<{ key: SeatDirection; label: string; title: string }> = [
  { key: 'N', label: '↑', title: '북쪽 (뒤)' },
  { key: 'E', label: '→', title: '동쪽 (오른쪽)' },
  { key: 'S', label: '↓', title: '남쪽 (앞)' },
  { key: 'W', label: '←', title: '서쪽 (왼쪽)' },
];

const POSES: Array<{ key: SeatPose; label: string; title: string }> = [
  { key: 'stand', label: '서기', title: '서 있는 자세' },
  { key: 'sit', label: '앉기', title: '의자에 앉음' },
  { key: 'type', label: '타이핑', title: '키보드 타이핑' },
];

function patchCharacter(id: CharacterId, body: Record<string, unknown>): void {
  void fetch(`/config/characters/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => { /* configUpdated WS reply re-syncs */ });
}

// 씬 내부 로직 좌표계 (OfficeScene CANVAS_W/H와 동일). 브라우저 크기에 따라
// 이 스테이지 전체를 CSS transform으로 확대해 배경·좌석·오버레이를 함께 스케일한다.
const STAGE_W = 920;
const STAGE_H = 510;

export function IsometricOffice({ configs }: { configs: CharacterConfig[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const characters = useCharacterStore((s) => s.characters);
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<CharacterId | null>(null);
  const [fit, setFit] = useState({ scale: 1, offsetX: 0 });

  // 폭·높이 중 더 빡빡한 쪽에 맞춰 스케일 — 스크롤 없이 항상 사무실 전체가 보인다.
  // 가용 높이 = app-main 높이 - 캐릭터 패널 높이 - 상하 패딩.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const appMain = el.closest('.app-main');
    const panel = document.querySelector('.character-panel');
    const compute = () => {
      const availW = el.clientWidth;
      const availH = appMain
        ? appMain.clientHeight - (panel instanceof HTMLElement ? panel.offsetHeight : 0) - 48
        : STAGE_H;
      const scale = Math.max(0.3, Math.min(availW / STAGE_W, availH / STAGE_H));
      setFit({ scale, offsetX: Math.max(0, (availW - STAGE_W * scale) / 2) });
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    if (appMain) ro.observe(appMain);
    if (panel) ro.observe(panel);
    compute();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new OfficeScene(canvasRef.current);
    sceneRef.current = scene;
    scene.onSelectionChange(setSelectedId);
    return () => { scene.destroy(); sceneRef.current = null; };
  }, []);

  useEffect(() => {
    const states = ALL_CHARACTER_IDS.map((id) => characters[id] ?? empty(id));
    sceneRef.current?.setCharacters(states, configs);
  }, [characters, configs]);

  useEffect(() => {
    sceneRef.current?.setEditMode(editMode);
    if (!editMode) setSelectedId(null);
  }, [editMode]);

  const selected = selectedId ? configs.find((c) => c.id === selectedId) : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: STAGE_H * fit.scale, overflow: 'hidden' }}>
      {/* 스테이지: 로직 좌표계 920×510 고정, 가용 공간에 맞춰 통째로 스케일.
          캔버스·좌석 오버레이·편집 패널이 전부 이 안에 있어 좌표가 함께 연동된다. */}
      <div style={{
        position: 'relative', width: STAGE_W, height: STAGE_H,
        transform: `translateX(${fit.offsetX}px) scale(${fit.scale})`, transformOrigin: 'top left',
      }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />

        {editMode && selected && (
          <EditPanel
            config={selected}
            onDirection={(dir) => {
              // Update the sprite locally before the PATCH round-trip so the
              // button click feels instant. The eventual configUpdated broadcast
              // re-applies the same value harmlessly.
              sceneRef.current?.applyDirection(selected.id, dir);
              patchCharacter(selected.id, { seatDirection: dir });
            }}
            onPose={(pose) => {
              sceneRef.current?.applySeatPose(selected.id, pose);
              patchCharacter(selected.id, { seatPose: pose });
            }}
            onClose={() => setSelectedId(null)}
          />
        )}

        <OfficeOverlay configs={configs} />
      </div>

      {/* 편집 버튼은 스케일 밖 — 확대해도 UI 크기가 일정하다 */}
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 6,
      }}>
        <button
          onClick={() => setEditMode((v) => !v)}
          style={{
            padding: '4px 10px',
            fontFamily: 'DotGothic16, monospace',
            fontSize: 12,
            border: '1.5px solid #2a1a0a',
            borderRadius: 4,
            background: editMode ? '#fbbf24' : '#fff2c4',
            cursor: 'pointer',
          }}
        >
          {editMode ? '✎ 편집 중 · 클릭해 저장' : '✎ 위치 편집'}
        </button>
      </div>
    </div>
  );
}

interface EditPanelProps {
  config: CharacterConfig;
  onDirection(d: SeatDirection): void;
  onPose(p: SeatPose): void;
  onClose(): void;
}

function EditPanel({ config, onDirection, onPose, onClose }: EditPanelProps) {
  const currentDir = config.seatDirection ?? 'S';
  const currentPose = config.seatPose ?? 'stand';
  // Position the panel just below the seat coord; clamp so it stays inside
  // the 920×510 canvas frame.
  const panelW = 200;
  const panelH = 100;
  const left = Math.max(4, Math.min(920 - panelW - 4, config.officeSeat.x - panelW / 2));
  const top = Math.max(4, Math.min(510 - panelH - 4, config.officeSeat.y + 18));

  return (
    <div
      style={{
        position: 'absolute', left, top, width: panelW,
        background: '#fffdf3',
        border: '1.5px solid #2a1a0a',
        borderRadius: 6,
        padding: '6px 8px',
        fontFamily: 'DotGothic16, monospace',
        fontSize: 11,
        boxShadow: '2px 3px 0 rgba(0,0,0,0.15)',
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ color: '#3b2a1a' }}>{config.name}</strong>
        <button
          onClick={onClose}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 14, color: '#3b2a1a', padding: 0, lineHeight: 1,
          }}
          title="닫기"
        >×</button>
      </div>
      <div style={{ marginTop: 4, color: '#5b3820' }}>방향</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {DIRECTIONS.map((d) => (
          <button
            key={d.key}
            title={d.title}
            onClick={() => onDirection(d.key)}
            style={{
              flex: 1, padding: '3px 0',
              border: '1px solid #2a1a0a',
              borderRadius: 3,
              background: currentDir === d.key ? '#fbbf24' : '#fff2c4',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12,
            }}
          >{d.label}</button>
        ))}
      </div>
      <div style={{ marginTop: 4, color: '#5b3820' }}>자세</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {POSES.map((p) => (
          <button
            key={p.key}
            title={p.title}
            onClick={() => onPose(p.key)}
            style={{
              flex: 1, padding: '3px 0',
              border: '1px solid #2a1a0a',
              borderRadius: 3,
              background: currentPose === p.key ? '#fbbf24' : '#fff2c4',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 10,
            }}
          >{p.label}</button>
        ))}
      </div>
    </div>
  );
}
