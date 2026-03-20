// API response types

export interface ProjectSession {
  id: string;
  firstPrompt: string;
  date: string;
  fileSize: number;
  duration: number;
  shared?: boolean;
  shareUrl?: string | null;
  shareTitle?: string | null;
}

export interface ProjectSettings {
  displayName?: string;
  description?: string;
  visible?: boolean;
  featuredSessions?: string[];
  featuredQuote?: string;
  updatedAt?: string;
}

export interface ProjectDetail {
  name: string;
  path: string;
  displayName: string;
  sessions: ProjectSession[];
  stats: {
    totalSessions: number;
    publishedSessions: number;
    totalDuration: number;
  };
  settings: ProjectSettings;
}

export interface Project {
  name: string;
  path: string;
  displayName: string;
  sessions: ProjectSession[];
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  toolUseId: string;
  timestamp: string;
  succeeded: boolean;
  resultPreview: string;
}

export interface Turn {
  index: number;
  userPrompt: string;
  userTimestamp: string;
  assistantText: string;
  assistantTimestamp: string;
  toolCalls: ToolCall[];
}

export interface FileChange {
  filePath: string;
  tool: string;
  count: number;
}

export interface SessionAnalysis {
  sessionId: string;
  project: string;
  projectPath: string;
  duration: { start: string; end: string; minutes: number };
  turns: Turn[];
  totalToolCalls: number;
  toolUsage: Record<string, { count: number; errors: number }>;
  filesChanged: FileChange[];
  rejectedToolCalls: number;
  retries: number;
  idleGaps: { after: string; minutes: number }[];
}

export interface TutorialStep {
  title: string;
  description: string;
  turnRange: string;
  keyTakeaway: string;
}

export interface Highlight {
  type: "funny" | "impressive" | "frustrating" | "clever";
  title: string;
  description: string;
  turnIndex: number;
}

export interface Beat {
  type: "step" | "correction" | "insight" | "win";
  title: string;
  description: string;
  turnIndex: number;
  time: string;
  direction?: string | null;
  directionNote?: string | null;
}

export interface TurningPoint {
  type: "correction" | "insight" | "win";
  title: string;
  description: string;
  turnIndex: number;
  context: string;
}

export interface SessionSummary {
  narrative: string;
  tutorialSteps: TutorialStep[];
  efficiencyInsights: string[];
  highlights: Highlight[];
  turningPoints?: TurningPoint[];
  beats?: Beat[];
  oneLineSummary: string;
  extractedSkills?: string[];
  // v2 fields
  title?: string;
  context?: string;
  executionPath?: ExecutionStep[];
  skills?: string[];
  patterns?: SessionPatterns;
  // Developer take helpers (Pass 3)
  developerQuotes?: DeveloperQuote[];
  suggestedTake?: string;
  // Session questions (Pass 4)
  questions?: SessionQuestion[];
}

// ── v2 Case Study types ──────────────────────────────

export interface DeveloperQuote {
  text: string;
  turnIndex: number;
  type: "decision" | "correction" | "reaction" | "opinion";
}

export interface ExecutionStep {
  title: string;
  body: string;
  insight: string;
}

export interface SessionPatterns {
  constraintsSetUpfront: boolean;
  redirectionCount: number;
  verificationSteps: number;
  contextFilesLoaded: number;
  scopeChanges: number;
}

// ── Session Questions types ──────────────────────────────

export interface SessionQuestion {
  id: string;                    // "q_correction_1"
  category: "correction" | "decision" | "tradeoff" | "outcome" | "approach";
  question: string;              // Specific to this session
  suggestedAnswer: string;       // AI starting point, editable
  context?: string;              // Session excerpt that prompted this question
  turnIndex?: number;
}

export interface QuestionAnswer {
  questionId: string;
  answer: string;               // What the dev wrote (max 200 chars)
}

export interface CaseStudy {
  title: string;
  context: string;
  developer_take: string;
  execution_path: ExecutionStep[];
  skills: string[];
  patterns: SessionPatterns;
  // metadata
  source_tool: string;
  project_name: string;
  duration_minutes: number;
  turn_count: number;
  step_count: number;
  session_month: string;
  hero_image_url?: string;
  result_url?: string;
}
