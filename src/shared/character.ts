export type CharacterId =
  | 'team-lead'
  | 'planner-researcher'
  | 'tester'
  | 'debugger'
  | 'code-reviewer'
  | 'docs-manager';

export const ALL_CHARACTER_IDS: readonly CharacterId[] = [
  'team-lead',
  'planner-researcher',
  'tester',
  'debugger',
  'code-reviewer',
  'docs-manager',
];

export type CharacterStatus = 'off' | 'idle' | 'thinking' | 'working' | 'blocked' | 'error' | 'done';

export interface Ticket {
  ticketId: string;
  createdAt: number;
  label: string;
  status: 'queued' | 'active';
}

export interface CharacterActivity {
  toolName: string;
  label: string;
  startedAt: number;
}

export interface CharacterState {
  id: CharacterId;
  status: CharacterStatus;
  currentActivity?: CharacterActivity;
  queue: Ticket[];
  lastLine?: { text: string; ts: number; ttlMs: number };
  lastUpdatedAt?: number;
  currentModel?: string;
  stats: { tasksCompleted: number; toolCallsTotal: number; errorsCount: number };
}
