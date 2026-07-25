export type CharacterId =
  | 'kim-team-lead'
  | 'park-planner'
  | 'lee-researcher'
  | 'yu-dev'
  | 'han-qa'
  | 'seo-designer'
  | 'jo-senior'
  | 'jung-newbie'
  | 'choi-office';

export const ALL_CHARACTER_IDS: readonly CharacterId[] = [
  'kim-team-lead', 'park-planner', 'lee-researcher', 'yu-dev', 'han-qa',
  'seo-designer', 'jo-senior', 'jung-newbie', 'choi-office',
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
  stats: { tasksCompleted: number; toolCallsTotal: number; errorsCount: number };
}
