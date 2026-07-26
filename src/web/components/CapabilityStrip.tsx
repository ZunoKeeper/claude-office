import { useEffect, useState } from 'react';
import { useCharacterStore } from '../store/characterStore.js';
import { ALL_CHARACTER_IDS } from '../../shared/character.js';
import type { CharacterId } from '../../shared/character.js';
import type { CharacterConfig } from '../../shared/config.js';

interface AgentTypeInfo { type: string; characterId: CharacterId | null; builtin: boolean; source: string }
interface SkillInfo { name: string; source: string; description?: string }
interface PluginInfo { name: string; marketplace: string; version: string }
interface Capabilities { models: string[]; agentTypes: AgentTypeInfo[]; skills: SkillInfo[]; plugins: PluginInfo[] }

export function CapabilityStrip({ configs }: { configs: CharacterConfig[] }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const characters = useCharacterStore((s) => s.characters);
  const events = useCharacterStore((s) => s.events);
  // 이벤트 버퍼는 30개 롤링이라 관측된 agent type은 로컬 Set에 누적한다
  const [seenTypes, setSeenTypes] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    fetch('/env/capabilities').then((r) => r.json()).then(setCaps).catch(() => setCaps(null));
  }, []);

  useEffect(() => {
    setSeenTypes((prev) => {
      let next: Set<string> | null = null;
      for (const e of events) {
        if (e.type === 'agent.start' && !prev.has(e.agentType) && !next?.has(e.agentType)) {
          next = next ?? new Set(prev);
          next.add(e.agentType);
        }
      }
      return next ?? prev;
    });
  }, [events]);

  if (!caps) return null;

  const nameById = new Map(configs.map((c) => [c.id, c.name]));
  const observedModels = Object.values(characters)
    .map((c) => c?.currentModel)
    .filter((m): m is string => !!m);

  const agentGroups: { label: string; items: AgentTypeInfo[] }[] = [];
  for (const id of ALL_CHARACTER_IDS) {
    const items = caps.agentTypes.filter((a) => a.characterId === id);
    if (items.length) agentGroups.push({ label: nameById.get(id) ?? id, items });
  }
  const unmapped = caps.agentTypes.filter((a) => a.characterId === null);
  if (unmapped.length) agentGroups.push({ label: '기타', items: unmapped });

  const skillGroups = new Map<string, SkillInfo[]>();
  for (const s of caps.skills) {
    const arr = skillGroups.get(s.source) ?? [];
    arr.push(s);
    skillGroups.set(s.source, arr);
  }

  return (
    <div className="capability-strip">
      <div className="cap-row">
        <span className="cap-label">MODELS</span>
        <div className="cap-content">
        {caps.models.flatMap((family) => {
          const obs = [...new Set(observedModels.filter((m) => m.includes(family)))];
          if (!obs.length) {
            return [
              <span key={family} className="cap-chip off" title="이 세션에서 아직 관측되지 않음 — 관측되면 정확한 버전이 표시됩니다">
                ◈ {family}
              </span>,
            ];
          }
          // 관측된 모델은 정확한 버전으로 표기: claude-opus-4-8 → opus-4-8
          return obs.map((m) => (
            <span key={m} className="cap-chip on" title={`관측됨: ${m}`}>
              ◈ {m.replace(/^claude-/, '')}
            </span>
          ));
        })}
        </div>
      </div>
      <div className="cap-row">
        <span className="cap-label">SUB AGENTS</span>
        <div className="cap-content">
        {agentGroups.map((g) => (
          <span key={g.label} className="cap-group">
            <span className="cap-group-label">{g.label}</span>
            {g.items.map((a) => (
              <span
                key={a.type}
                className={`cap-chip ${seenTypes.has(a.type) ? 'on' : 'off'}`}
                title={`${a.builtin ? '내장 서브에이전트' : a.source === 'router' ? '라우팅 대상 서브에이전트' : `${a.source} 정의 서브에이전트`} · ${seenTypes.has(a.type) ? '이 세션에서 활동 관측됨' : '아직 활동 관측 없음'}`}
              >
                {a.type}
              </span>
            ))}
          </span>
        ))}
        </div>
      </div>
      <div className="cap-row">
        <span className="cap-label">SKILLS</span>
        <div className="cap-content">
        {[...skillGroups.entries()].map(([source, items]) => (
          <span key={source} className="cap-group">
            <span className="cap-group-label">{source}</span>
            {items.map((s) => (
              <span key={`${source}/${s.name}`} className="cap-chip" title={s.description ?? s.name}>
                {s.name}
              </span>
            ))}
          </span>
        ))}
        </div>
      </div>
      <div className="cap-row">
        <span className="cap-label">PLUGINS</span>
        <div className="cap-content">
        {caps.plugins.map((p) => (
          <span key={`${p.name}@${p.marketplace}`} className="cap-chip" title={`${p.name}@${p.marketplace}`}>
            {p.name}{p.version !== 'unknown' ? ` v${p.version}` : ''}
          </span>
        ))}
        </div>
      </div>
    </div>
  );
}
