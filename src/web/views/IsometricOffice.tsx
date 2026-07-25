import { useEffect, useRef, useState } from 'react';
import { OfficeScene } from '../pixi/OfficeScene.js';
import { useCharacterStore } from '../store/characterStore.js';
import { ALL_CHARACTER_IDS, type CharacterState } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';
import { OfficeOverlay } from './OfficeOverlay.js';

function empty(id: CharacterConfig['id']): CharacterState {
  return { id, status: 'off', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

export function IsometricOffice({ configs }: { configs: CharacterConfig[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const characters = useCharacterStore((s) => s.characters);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    sceneRef.current = new OfficeScene(canvasRef.current);
    return () => { sceneRef.current?.destroy(); sceneRef.current = null; };
  }, []);

  useEffect(() => {
    const states = ALL_CHARACTER_IDS.map((id) => characters[id] ?? empty(id));
    sceneRef.current?.setCharacters(states, configs);
  }, [characters, configs]);

  useEffect(() => {
    sceneRef.current?.setEditMode(editMode);
  }, [editMode]);

  return (
    <div style={{ position: 'relative', width: 920, margin: '0 auto' }}>
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
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <OfficeOverlay configs={configs} />
    </div>
  );
}

// Vite HMR: OfficeScene is instantiated once inside a useEffect([]) block, so
// edits to the scene file don't re-run the effect and the stale scene keeps
// rendering. Force a full page reload whenever this module (or its deps like
// OfficeScene) is hot-updated so the new draw code takes effect.
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}
