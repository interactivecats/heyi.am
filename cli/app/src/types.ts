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
}

export interface TurnEvent {
  timestamp: string;
  type: 'prompt' | 'response' | 'tool' | 'error';
  content: string;
}

export interface Session {
  id: string;
  title: string;
  date: string;
  durationMinutes: number;
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
}

export interface Project {
  name: string;
  sessionCount: number;
  description: string;
}
