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
  type: 'prompt' | 'response' | 'tool' | 'error' | 'thinking';
  content: string;
  turnNumber?: number;
  tools?: string[];
}

export interface QaPair {
  question: string;
  answer: string;
}

export interface AgentChild {
  sessionId: string;
  role: string;
  durationMinutes: number;
  linesOfCode: number;
  date?: string;
}

/** @deprecated Use AgentChild instead */
export type ChildSessionSummary = AgentChild;

export interface Session {
  id: string;
  title: string;
  date: string;
  endTime?: string;
  durationMinutes: number;
  wallClockMinutes?: number;
  turns: number;
  linesOfCode: number;
  status: 'draft' | 'enhanced' | 'published' | 'archived';
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
  children?: AgentChild[];
  parentSessionId?: string | null;
  agentRole?: string;
  isOrchestrated?: boolean;
  childCount?: number;
  cwd?: string;
  quickEnhanced?: boolean;
  source?: string;
}
