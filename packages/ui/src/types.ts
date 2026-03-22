export interface ExecutionStep {
  stepNumber: number;
  title: string;
  description: string;
  type?: 'analysis' | 'implementation' | 'testing' | 'deployment' | 'decision';
}

export interface ToolUsage {
  tool: string;
  count: number;
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  editCount?: number;
}

export interface TurnEvent {
  timestamp: string;
  type: 'prompt' | 'response' | 'tool' | 'error';
  content: string;
  turnNumber?: number;
  tools?: string[];
}

export interface QaPair {
  question: string;
  answer: string;
}

export interface ChildSessionSummary {
  sessionId: string;
  role?: string;
  title?: string;
  durationMinutes?: number;
  linesOfCode?: number;
  date?: string;
}

export interface Session {
  id: string;
  title: string;
  date: string;
  endTime?: string;
  durationMinutes: number;
  wallClockMinutes?: number;
  turns: number;
  linesOfCode: number;
  status: 'draft' | 'enhanced' | 'published' | 'archived' | 'sealed';
  projectName: string;
  rawLog: string[];
  sessionRef?: string;
  context?: string;
  developerTake?: string;
  skills?: string[];
  executionPath?: ExecutionStep[];
  toolBreakdown?: ToolUsage[];
  filesChanged?: FileChange[];
  turnTimeline?: TurnEvent[];
  toolCalls?: number;
  qaPairs?: QaPair[];
  childSessions?: Session[];
  parentSessionId?: string | null;
  agentRole?: string;
  isOrchestrated?: boolean;
  childCount?: number;
  children?: ChildSessionSummary[];
  cwd?: string;
  quickEnhanced?: boolean;
  source?: string;
}
