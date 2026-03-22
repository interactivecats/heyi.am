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

export interface ChildSessionSummary {
  sessionId: string;
  role?: string;
  title?: string;
  durationMinutes?: number;
  linesOfCode?: number;
}

export interface QaPair {
  question: string;
  answer: string;
}

export interface Session {
  id: string;
  title: string;
  date: string;
  /** End time as ISO timestamp */
  endTime?: string;
  /** Active time in minutes (excludes idle gaps > 5 min) */
  durationMinutes: number;
  /** Wall-clock time in minutes (first to last timestamp, includes idle) */
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
  /** Working directory where the session was started */
  cwd?: string;
  /** True when enhanced via bulk mode with auto-accepted AI suggestions */
  quickEnhanced?: boolean;
}

export interface Project {
  name: string;
  /** The raw directory name, used as the stable ID for API calls */
  dirName: string;
  sessionCount: number;
  description: string;
  totalLoc: number;
  totalDuration: number;
  totalFiles: number;
  skills: string[];
  dateRange: string;
  lastSessionDate: string;
}
