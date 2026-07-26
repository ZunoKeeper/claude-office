import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_TYPE_MAP, BUILTIN_AGENT_TYPES } from '../characterRouter.js';
import type { CharacterId } from '../../shared/character.js';

export interface PluginInfo { name: string; marketplace: string; version: string; scope: string; installPath: string }
export interface SkillInfo { name: string; source: string; description?: string }
export interface AgentTypeInfo { type: string; characterId: CharacterId | null; builtin: boolean; source: 'router' | 'user' | 'project' }
export interface Capabilities { models: string[]; agentTypes: AgentTypeInfo[]; skills: SkillInfo[]; plugins: PluginInfo[] }

export function mergePlugins(installedRaw: unknown, enabledRaw: unknown): PluginInfo[] {
  const plugins = (installedRaw as { plugins?: unknown } | null)?.plugins;
  if (!plugins || typeof plugins !== 'object') return [];
  const enabled = (enabledRaw && typeof enabledRaw === 'object') ? enabledRaw as Record<string, unknown> : {};
  const out: PluginInfo[] = [];
  for (const [key, entries] of Object.entries(plugins as Record<string, unknown>)) {
    if (enabled[key] !== true) continue;
    const first = Array.isArray(entries) ? entries[0] : entries;
    if (!first || typeof first !== 'object') continue;
    const e = first as { version?: string; scope?: string; installPath?: string };
    const at = key.lastIndexOf('@');
    out.push({
      name: at > 0 ? key.slice(0, at) : key,
      marketplace: at > 0 ? key.slice(at + 1) : '',
      version: e.version ?? 'unknown',
      scope: e.scope ?? 'user',
      installPath: e.installPath ?? '',
    });
  }
  return out;
}

export function parseFrontmatter(content: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    if (line.startsWith(' ') || line.startsWith('\t')) continue; // nested yaml은 무시
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

export function parseSkillMd(content: string, fallbackName: string, source: string): SkillInfo {
  const fm = parseFrontmatter(content);
  const info: SkillInfo = { name: fm.name || fallbackName, source };
  if (fm.description) info.description = fm.description;
  return info;
}

async function scanSkillsDir(dir: string, source: string): Promise<SkillInfo[]> {
  const out: SkillInfo[] = [];
  let entries: string[] = [];
  try { entries = await readdir(dir); } catch { return out; }
  for (const name of entries) {
    try {
      const content = await readFile(path.join(dir, name, 'SKILL.md'), 'utf8');
      out.push(parseSkillMd(content, name, source));
    } catch { /* SKILL.md 없는 항목은 스킬 아님 */ }
  }
  return out;
}

async function scanAgentsDir(dir: string, source: 'user' | 'project'): Promise<AgentTypeInfo[]> {
  const out: AgentTypeInfo[] = [];
  let entries: string[] = [];
  try { entries = await readdir(dir); } catch { return out; }
  for (const f of entries) {
    if (!f.endsWith('.md')) continue;
    let type = f.replace(/\.md$/, '');
    try {
      const fm = parseFrontmatter(await readFile(path.join(dir, f), 'utf8'));
      if (fm.name) type = fm.name;
    } catch { /* 파일명 유지 */ }
    out.push({ type, characterId: AGENT_TYPE_MAP[type] ?? null, builtin: false, source });
  }
  return out;
}

export function routerAgentTypes(): AgentTypeInfo[] {
  return Object.entries(AGENT_TYPE_MAP).map(([type, characterId]) => ({
    type, characterId, builtin: BUILTIN_AGENT_TYPES.has(type), source: 'router' as const,
  }));
}

export async function collectCapabilities(
  opts: { homeDir: string; projectDir: string; models: string[] },
): Promise<Capabilities> {
  const { homeDir, projectDir, models } = opts;
  let plugins: PluginInfo[] = [];
  try {
    const installed: unknown = JSON.parse(
      await readFile(path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'),
    );
    let enabled: unknown = {};
    try {
      const settings = JSON.parse(await readFile(path.join(homeDir, '.claude', 'settings.json'), 'utf8')) as { enabledPlugins?: unknown };
      enabled = settings.enabledPlugins ?? {};
    } catch { /* settings 없으면 전부 비활성 취급 */ }
    plugins = mergePlugins(installed, enabled);
  } catch { /* plugins 메타데이터 없음 */ }

  const skills: SkillInfo[] = [];
  for (const p of plugins) {
    if (p.installPath) skills.push(...await scanSkillsDir(path.join(p.installPath, 'skills'), p.name));
  }
  skills.push(...await scanSkillsDir(path.join(homeDir, '.claude', 'skills'), 'user'));
  skills.push(...await scanSkillsDir(path.join(projectDir, '.claude', 'skills'), 'project'));

  const agentTypes = routerAgentTypes();
  const seen = new Set(agentTypes.map((a) => a.type));
  const scanned = [
    ...await scanAgentsDir(path.join(homeDir, '.claude', 'agents'), 'user'),
    ...await scanAgentsDir(path.join(projectDir, '.claude', 'agents'), 'project'),
  ];
  for (const a of scanned) {
    if (seen.has(a.type)) continue;
    seen.add(a.type);
    agentTypes.push(a);
  }
  return { models, agentTypes, skills, plugins };
}
