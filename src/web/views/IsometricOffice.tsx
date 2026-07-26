import { useEffect, useRef, useState } from 'react';
import { OfficeScene } from '../pixi/OfficeScene.js';
import { PIXEL_SCALE } from '../pixi/CharacterSprite.js';
import { SPRITE_H } from '../pixi/sprites/types.js';
import { useCharacterStore } from '../store/characterStore.js';
import { ALL_CHARACTER_IDS, type CharacterId, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig, SeatDirection, SeatPose, ToolDestination, WaypointMap, WaypointPoint } from '../../shared/config.js';
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

function patchDestination(id: string, x: number, y: number): void {
  void fetch(`/config/destinations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  }).catch(() => { /* configUpdated WS reply re-syncs */ });
}

function putWaypoints(charId: CharacterId, destId: string, points: WaypointPoint[]): void {
  void fetch(`/config/waypoints/${charId}/${destId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  }).catch(() => { /* configUpdated WS reply re-syncs */ });
}

/** 화면(pointer) 좌표 → 스테이지 논리 좌표(920×510) 변환. */
function toLogicalPoint(
  e: { clientX: number; clientY: number },
  wrapEl: HTMLElement,
  fit: { scale: number; offsetX: number },
): WaypointPoint {
  const rect = wrapEl.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(920, (e.clientX - rect.left - fit.offsetX) / fit.scale)),
    y: Math.max(0, Math.min(510, (e.clientY - rect.top) / fit.scale)),
  };
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
  const configVersion = useCharacterStore((s) => s.configVersion);
  const spritesVersion = useCharacterStore((s) => s.spritesVersion);
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<CharacterId | null>(null);
  const [destinations, setDestinations] = useState<ToolDestination[]>([]);
  const [waypoints, setWaypoints] = useState<WaypointMap>({});
  /** 경유점 편집 대상 목적지 id (편집 모드 + 캐릭터 선택 시에만 유효) */
  const [pathDest, setPathDest] = useState<string | null>(null);
  const [fit, setFit] = useState({ scale: 1, offsetX: 0 });
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const nametagRefs = useRef(new Map<CharacterId, HTMLDivElement>());
  const bubbleRefs = useRef(new Map<CharacterId, HTMLDivElement>());

  // 폭·높이 중 더 빡빡한 쪽에 맞춰 스케일 — 스크롤 없이 항상 사무실 전체가 보인다.
  // 가용 높이 = app-main 높이 - 캐릭터 패널 높이 - 상하 패딩.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const appMain = el.closest('.app-main');
    const panel = document.querySelector('.character-panel');
    const compute = () => {
      const availW = el.clientWidth;
      // 16 = office-canvas-area 상단 패딩 8 + 하단 대칭 여백 8
      const availH = appMain
        ? appMain.clientHeight - (panel instanceof HTMLElement ? panel.offsetHeight : 0) - 16
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
    // 이름표는 캔버스 밖 HTML이라 스케일과 무관하게 글씨 크기가 고정된다.
    // 매 프레임 스프라이트 논리 좌표를 받아 DOM을 직접 이동(리렌더 없음).
    scene.onFramePositions((positions) => {
      const { scale, offsetX } = fitRef.current;
      for (const p of positions) {
        const left = `${p.x * scale + offsetX}px`;
        const headTop = (p.y - SPRITE_H * PIXEL_SCALE - 2) * scale;
        const tag = nametagRefs.current.get(p.id);
        if (tag) {
          tag.style.left = left;
          tag.style.top = `${headTop}px`;
          tag.style.visibility = 'visible';
        }
        const bubble = bubbleRefs.current.get(p.id);
        if (bubble) {
          bubble.style.left = left;
          // 이름표(~20px) 위에 말풍선. 위쪽 클리핑을 피해 최소 52px 확보.
          bubble.style.top = `${Math.max(52, headTop - 24)}px`;
          bubble.style.visibility = 'visible';
        }
      }
    });
    return () => { scene.destroy(); sceneRef.current = null; };
    // spritesVersion이 바뀌면 (스프라이트 편집 저장) 씬을 새로 만들어
    // 새 atlas 텍스처로 다시 그린다.
  }, [spritesVersion]);

  useEffect(() => {
    const states = ALL_CHARACTER_IDS.map((id) => characters[id] ?? empty(id));
    sceneRef.current?.setCharacters(states, configs);
  }, [characters, configs, spritesVersion]);

  // 동선(툴 목적지) — configUpdated 브로드캐스트마다 재취득해 씬에 주입
  useEffect(() => {
    fetch('/config/destinations').then((r) => r.json()).then(setDestinations).catch(() => setDestinations([]));
  }, [configVersion]);

  useEffect(() => {
    sceneRef.current?.setDestinations(destinations);
  }, [destinations, spritesVersion]);

  // 캐릭터×목적지별 걷기 경유점
  useEffect(() => {
    fetch('/config/waypoints').then((r) => r.json()).then(setWaypoints).catch(() => setWaypoints({}));
  }, [configVersion]);

  useEffect(() => {
    sceneRef.current?.setWaypoints(waypoints);
  }, [waypoints, spritesVersion]);

  useEffect(() => {
    sceneRef.current?.setEditMode(editMode);
    if (!editMode) setSelectedId(null);
  }, [editMode, spritesVersion]);

  // 선택 캐릭터가 바뀌면 경로 편집 대상도 초기화
  useEffect(() => { setPathDest(null); }, [selectedId, editMode]);

  const selected = selectedId ? configs.find((c) => c.id === selectedId) : null;
  const pathDestObj = pathDest ? destinations.find((d) => d.id === pathDest) ?? null : null;
  const selPts: WaypointPoint[] = selected && pathDest
    ? waypoints[selected.id]?.[pathDest] ?? []
    : [];

  function replaceSelPts(pts: WaypointPoint[], commit: boolean): void {
    if (!selected || !pathDest) return;
    const charId = selected.id;
    const destId = pathDest;
    setWaypoints((prev) => ({
      ...prev,
      [charId]: { ...(prev[charId] ?? {}), [destId]: pts },
    }));
    if (commit) {
      putWaypoints(charId, destId, pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));
    }
  }

  function addWaypoint(): void {
    if (!selected || !pathDestObj) return;
    // 마지막 지점(없으면 자리)과 목적지의 중간에 새 점을 추가
    const prev = selPts.length > 0 ? selPts[selPts.length - 1] : selected.officeSeat;
    const nx = Math.round((prev.x + pathDestObj.x) / 2);
    const ny = Math.round((prev.y + pathDestObj.y) / 2);
    replaceSelPts([...selPts, { x: nx, y: ny }], true);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: STAGE_H * fit.scale, overflow: 'hidden' }}>
      {/* 스테이지: 로직 좌표계 920×510 고정, 가용 공간에 맞춰 통째로 스케일.
          캔버스·좌석 오버레이·편집 패널이 전부 이 안에 있어 좌표가 함께 연동된다. */}
      <div style={{
        position: 'relative', width: STAGE_W, height: STAGE_H,
        transform: `translateX(${fit.offsetX}px) scale(${fit.scale})`, transformOrigin: 'top left',
      }}>
        <canvas key={spritesVersion} ref={canvasRef} style={{ display: 'block' }} />

        {editMode && selected && (
          <EditPanel
            config={selected}
            destinations={destinations}
            pathDest={pathDest}
            onPathDest={(id) => setPathDest((cur) => (cur === id ? null : id))}
            onAddPoint={addWaypoint}
            waypointCount={selPts.length}
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

      {/* 이름표 — 스케일 밖 HTML이라 항상 고정 크기로 선명하게 보인다 */}
      {configs.map((c) => (
        <div
          key={c.id}
          className="office-nametag"
          ref={(el) => {
            if (el) nametagRefs.current.set(c.id, el);
            else nametagRefs.current.delete(c.id);
          }}
        >
          {c.name}
        </div>
      ))}

      {/* 말풍선 — 이름표와 같은 방식의 고정 크기 HTML 오버레이 */}
      {configs.map((c) => {
        const line = characters[c.id]?.lastLine;
        return (
          <div
            key={`bubble-${c.id}`}
            className="office-bubble-anchor"
            ref={(el) => {
              if (el) bubbleRefs.current.set(c.id, el);
              else bubbleRefs.current.delete(c.id);
            }}
          >
            {line && <BubbleLine key={line.ts} line={line} />}
          </div>
        );
      })}

      {/* 동선 마커 — 편집 모드에서 드래그로 툴 목적지를 옮긴다. 좌표는 논리
          좌표계로 저장되므로 화면 스케일과 무관하게 유지된다. */}
      {editMode && destinations.map((d) => (
        <DestMarker key={d.id} dest={d} fit={fit} wrapRef={wrapRef} />
      ))}

      {/* 경유점 편집 — 자리→경유점들→목적지 경로선과 드래그 가능한 번호 마커 */}
      {editMode && selected && pathDestObj && (
        <>
          <svg className="path-overlay">
            <polyline
              points={[selected.officeSeat, ...selPts, { x: pathDestObj.x, y: pathDestObj.y }]
                .map((p) => `${p.x * fit.scale + fit.offsetX},${p.y * fit.scale}`)
                .join(' ')}
            />
          </svg>
          {selPts.map((p, i) => (
            <WaypointMarker
              key={i}
              index={i}
              point={p}
              fit={fit}
              wrapRef={wrapRef}
              onDrag={(np) => replaceSelPts(selPts.map((q, j) => (j === i ? np : q)), false)}
              onDrop={(np) => replaceSelPts(selPts.map((q, j) => (j === i ? np : q)), true)}
              onDelete={() => replaceSelPts(selPts.filter((_, j) => j !== i), true)}
            />
          ))}
        </>
      )}

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

/** 편집 모드에서 드래그 가능한 툴 목적지 마커. 화면 좌표를 스테이지 스케일로
 *  나눠 논리 좌표(920×510)로 저장하므로 리사이즈와 무관하게 동선이 유지된다. */
function DestMarker({ dest, fit, wrapRef }: {
  dest: ToolDestination;
  fit: { scale: number; offsetX: number };
  wrapRef: React.RefObject<HTMLDivElement>;
}) {
  const [pos, setPos] = useState({ x: dest.x, y: dest.y });
  const [dragging, setDragging] = useState(false);
  useEffect(() => { setPos({ x: dest.x, y: dest.y }); }, [dest.x, dest.y]);

  function toLogical(e: React.PointerEvent): { x: number; y: number } {
    const rect = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(STAGE_W, (e.clientX - rect.left - fit.offsetX) / fit.scale)),
      y: Math.max(0, Math.min(STAGE_H, (e.clientY - rect.top) / fit.scale)),
    };
  }

  return (
    <div
      className={`dest-marker ${dragging ? 'dragging' : ''}`}
      style={{ left: pos.x * fit.scale + fit.offsetX, top: pos.y * fit.scale }}
      title={`이동 동선: ${dest.tools.join(', ')} 실행 시 이 지점으로 걸어감 — 드래그해 이동`}
      onPointerDown={(e) => {
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 캡처 불가 시에도 드래그는 동작 */ }
        setDragging(true);
      }}
      onPointerMove={(e) => { if (dragging) setPos(toLogical(e)); }}
      onPointerUp={(e) => {
        if (!dragging) return;
        setDragging(false);
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ditto */ }
        const p = toLogical(e);
        setPos(p);
        patchDestination(dest.id, Math.round(p.x), Math.round(p.y));
      }}
    >
      <span className="dest-marker-flag">⚑</span> {dest.label}
      <span className="dest-marker-tools">{dest.tools.join(' · ')}</span>
    </div>
  );
}

/** 경유점 마커 — 드래그로 이동, 더블클릭으로 삭제. */
function WaypointMarker({ index, point, fit, wrapRef, onDrag, onDrop, onDelete }: {
  index: number;
  point: WaypointPoint;
  fit: { scale: number; offsetX: number };
  wrapRef: React.RefObject<HTMLDivElement>;
  onDrag(p: WaypointPoint): void;
  onDrop(p: WaypointPoint): void;
  onDelete(): void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`wp-marker ${dragging ? 'dragging' : ''}`}
      style={{ left: point.x * fit.scale + fit.offsetX, top: point.y * fit.scale }}
      title="경유점 — 드래그: 이동 · 더블클릭: 삭제"
      onPointerDown={(e) => {
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 대비 */ }
        setDragging(true);
      }}
      onPointerMove={(e) => { if (dragging) onDrag(toLogicalPoint(e, wrapRef.current!, fit)); }}
      onPointerUp={(e) => {
        if (!dragging) return;
        setDragging(false);
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ditto */ }
        onDrop(toLogicalPoint(e, wrapRef.current!, fit));
      }}
      onDoubleClick={onDelete}
    >
      {index + 1}
    </div>
  );
}

/** TTL이 지나면 페이드아웃 후 언마운트되는 말풍선 한 줄. key={line.ts}로
 *  새 대사마다 리마운트되어 pop-in 애니메이션이 다시 재생된다. */
function BubbleLine({ line }: { line: { text: string; ts: number; ttlMs: number } }) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const remain = line.ts + line.ttlMs + 300 - Date.now();
    if (remain <= 0) { setExpired(true); return; }
    const t = setTimeout(() => setExpired(true), remain);
    return () => clearTimeout(t);
  }, [line]);
  if (expired) return null;
  const fadeDelayMs = Math.max(0, line.ts + line.ttlMs - Date.now() - 300);
  return (
    <div
      className="office-bubble"
      style={{ animation: `bubble-pop 160ms ease-out, bubble-fade 300ms linear ${fadeDelayMs}ms forwards` }}
    >
      {line.text}
    </div>
  );
}

interface EditPanelProps {
  config: CharacterConfig;
  destinations: ToolDestination[];
  pathDest: string | null;
  waypointCount: number;
  onPathDest(id: string): void;
  onAddPoint(): void;
  onDirection(d: SeatDirection): void;
  onPose(p: SeatPose): void;
  onClose(): void;
}

function EditPanel({
  config, destinations, pathDest, waypointCount,
  onPathDest, onAddPoint, onDirection, onPose, onClose,
}: EditPanelProps) {
  const currentDir = config.seatDirection ?? 'S';
  const currentPose = config.seatPose ?? 'stand';
  // Position the panel just below the seat coord; clamp so it stays inside
  // the 920×510 canvas frame.
  const panelW = 200;
  const panelH = 168;
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
      <div style={{ marginTop: 4, color: '#5b3820' }}>이동 동선 (경유점)</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {destinations.map((d) => (
          <button
            key={d.id}
            title={`${d.label}까지의 걷기 경로 편집`}
            onClick={() => onPathDest(d.id)}
            style={{
              flex: 1, padding: '3px 0',
              border: '1px solid #2a1a0a',
              borderRadius: 3,
              background: pathDest === d.id ? '#fbbf24' : '#fff2c4',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 10,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >{d.label}</button>
        ))}
      </div>
      {pathDest && (
        <button
          onClick={onAddPoint}
          style={{
            marginTop: 4, width: '100%', padding: '3px 0',
            border: '1px solid #2a1a0a', borderRadius: 3,
            background: '#fff2c4', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 10,
          }}
        >＋ 경유점 추가 ({waypointCount}개) · 더블클릭으로 삭제</button>
      )}
    </div>
  );
}
