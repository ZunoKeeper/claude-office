import { useCharacterStore } from '../store/characterStore.js';
import { CharacterCard } from '../components/CharacterCard.js';
import { ALL_CHARACTER_IDS, type CharacterId, type CharacterState } from '../../shared/character.js';

const META: Record<CharacterId, { name: string; role: string }> = {
  'kim-team-lead':   { name: '김대리', role: '팀장' },
  'park-planner':    { name: '박PL',   role: '기획/아키텍트' },
  'lee-researcher':  { name: '이대리', role: '자료조사원' },
  'yu-dev':          { name: '유대리', role: '개발자' },
  'han-qa':          { name: '한주임', role: 'QA' },
  'seo-designer':    { name: '서주임', role: '디자이너' },
  'jo-senior':       { name: '조과장', role: '시니어/사수' },
  'jung-newbie':     { name: '정막내', role: '신입' },
  'choi-office':     { name: '최주임', role: '총무' },
};

function empty(id: CharacterId): CharacterState {
  return { id, status: 'idle', queue: [], stats: { tasksCompleted: 0, toolCallsTotal: 0, errorsCount: 0 } };
}

export function GridDashboard() {
  const characters = useCharacterStore((s) => s.characters);
  return (
    <div className="grid-office">
      {ALL_CHARACTER_IDS.map((id) => (
        <CharacterCard key={id} state={characters[id] ?? empty(id)} {...META[id]} />
      ))}
    </div>
  );
}
