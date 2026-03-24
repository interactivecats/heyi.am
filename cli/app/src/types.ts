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

export interface AgentChild {
  sessionId: string;
  role: string;
  durationMinutes: number;
  linesOfCode: number;
  date?: string;
}

/** @deprecated Use AgentChild instead */
export type ChildSessionSummary = AgentChild;

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
  status: 'draft' | 'enhanced' | 'uploaded' | 'archived' | 'sealed';
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
  /** Working directory where the session was started */
  cwd?: string;
  /** True when enhanced via bulk mode with auto-accepted AI suggestions */
  quickEnhanced?: boolean;
  /** Source tool: "claude", "cursor", "codex", "gemini", "antigravity" */
  source?: string;
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
  /** Whether this project has been uploaded to heyi.am */
  isUploaded?: boolean;
  /** Number of sessions currently uploaded */
  uploadedSessionCount?: number;
  /** Session IDs that are currently uploaded */
  uploadedSessions?: string[];
  /** When the project was last enhanced (null = never) */
  enhancedAt?: string | null;
  /** Total agent-hours across all orchestrated sessions (minutes) */
  totalAgentDuration?: number;
}
