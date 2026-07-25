import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!canvasRef.current) return;
    sceneRef.current = new OfficeScene(canvasRef.current);
    return () => { sceneRef.current?.destroy(); sceneRef.current = null; };
  }, []);

  useEffect(() => {
    const states = ALL_CHARACTER_IDS.map((id) => characters[id] ?? empty(id));
    sceneRef.current?.setCharacters(states, configs);
  }, [characters, configs]);

  return (
    <div style={{ position: 'relative', width: 920, margin: '0 auto' }}>
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
