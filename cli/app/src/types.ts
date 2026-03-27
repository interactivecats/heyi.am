// ── Session primitives (from cli2) ────────────────────────────

export interface ExecutionStep {
  stepNumber: number
  title: string
  description: string
  type?: 'analysis' | 'implementation' | 'testing' | 'deployment' | 'decision'
}

export interface ToolUsage {
  tool: string
  count: number
}

export interface FileChange {
  path: string
  additions: number
  deletions: number
  editCount?: number
}

export interface TurnEvent {
  timestamp: string
  type: 'prompt' | 'response' | 'tool' | 'error' | 'thinking'
  content: string
  turnNumber?: number
  tools?: string[]
}

export interface AgentChild {
  sessionId: string
  role: string
  durationMinutes: number
  linesOfCode: number
  date?: string
}

export interface QaPair {
  question: string
  answer: string
}

// ── Session ───────────────────────────────────────────────────

export interface Session {
  id: string
  title: string
  date: string
  endTime?: string
  /** Active time in minutes (excludes idle gaps > 5 min) */
  durationMinutes: number
  /** Wall-clock time in minutes (first to last timestamp, includes idle) */
  wallClockMinutes?: number
  turns: number
  linesOfCode: number
  status: 'draft' | 'enhanced' | 'uploaded' | 'archived'
  projectName: string
  rawLog: string[]
  sessionRef?: string
  context?: string
  developerTake?: string
  skills?: string[]
  executionPath?: ExecutionStep[]
  toolBreakdown?: ToolUsage[]
  filesChanged?: FileChange[]
  turnTimeline?: TurnEvent[]
  toolCalls?: number
  qaPairs?: QaPair[]
  children?: AgentChild[]
  parentSessionId?: string | null
  agentRole?: string
  isOrchestrated?: boolean
  childCount?: number
  cwd?: string
  quickEnhanced?: boolean
  source?: string
}

// ── Project ───────────────────────────────────────────────────

export interface Project {
  name: string
  dirName: string
  sessionCount: number
  description: string
  totalLoc: number
  totalDuration: number
  totalFiles: number
  skills: string[]
  dateRange: string
  lastSessionDate: string
  isUploaded?: boolean
  uploadedSessionCount?: number
  uploadedSessions?: string[]
  enhancedAt?: string | null
  totalAgentDuration?: number
}

// ── Enhance / Cache ───────────────────────────────────────────

export interface ProjectEnhanceResult {
  narrative: string
  arc: Array<{ phase: number; title: string; description: string }>
  skills: string[]
  timeline: Array<{
    period: string
    label: string
    sessions: Array<{
      sessionId: string
      title: string
      featured: boolean
      tag?: string
    }>
  }>
  questions: Array<{
    id: string
    category: 'pattern' | 'architecture' | 'evolution'
    question: string
    context: string
  }>
}

export interface ProjectEnhanceCacheResponse {
  fingerprint: string
  enhancedAt: string
  selectedSessionIds: string[]
  repoUrl?: string
  projectUrl?: string
  screenshotBase64?: string
  result: ProjectEnhanceResult
  isFresh: boolean
}

// ── Source audit ──────────────────────────────────────────────

export interface SourceInfo {
  name: string
  path: string
  dateRange: string
  liveCount: number
  archivedCount: number
  retentionRisk?: string
  health: 'healthy' | 'warning' | 'error'
}

export interface SourceAuditResult {
  sources: SourceInfo[]
}

// ── Archive ──────────────────────────────────────────────────

export interface ArchiveStats {
  total: number
  oldest: string
  sourcesCount: number
  lastSync: string
  diskUsage?: string
}

// ── Boundaries ───────────────────────────────────────────────

export interface ProjectBoundaries {
  included: string[]
  excluded: Array<{ id: string; reason: string }>
  background: string[]
}

// ── Export ────────────────────────────────────────────────────

export interface ExportResult {
  files: string[]
  totalBytes: number
  outputPath: string
}

// ── Project detail ───────────────────────────────────────────

export interface ProjectDetail {
  project: Project
  sessions: Session[]
  enhanceCache?: ProjectEnhanceCacheResponse | null
}

// ── Triage ───────────────────────────────────────────────────

export interface TriageResult {
  selected: Array<{ sessionId: string; reason: string }>
  skipped: Array<{ sessionId: string; reason: string }>
  autoSelected?: boolean
  triageMethod?: string
}

export type TriageEvent =
  | { type: 'loading_stats'; sessionId: string; index: number; total: number }
  | { type: 'scanning'; total: number }
  | { type: 'hard_floor'; sessionId: string; title: string; passed: boolean; reason?: string }
  | { type: 'extracting_signals'; sessionId: string; title: string }
  | { type: 'signals_done'; sessionId: string }
  | { type: 'llm_ranking'; sessionCount: number }
  | { type: 'scoring_fallback'; sessionCount: number }
  | { type: 'done'; selected: number; skipped: number }
  | { type: 'error'; message: string }
  | { type: 'result'; selected: Array<{ sessionId: string; reason: string }>; skipped: Array<{ sessionId: string; reason: string }> }

// ── Enhance events ───────────────────────────────────────────

export type EnhanceEvent =
  | { type: 'session_progress'; sessionId: string; title: string; status: 'enhancing' | 'done' | 'skipped' | 'failed'; detail?: string; skills?: string[] }
  | { type: 'project_enhance'; status: 'generating' }
  | { type: 'narrative_chunk'; text: string }
  | { type: 'cached'; enhancedAt: string }
  | { type: 'stale_cache'; previousEnhancedAt: string }
  | { type: 'done'; result: ProjectEnhanceResult }
  | { type: 'error'; message: string }

// ── Upload ───────────────────────────────────────────────────

export interface UploadPayload {
  title: string
  slug: string
  narrative: string
  repoUrl: string
  projectUrl: string
  timeline: ProjectEnhanceResult['timeline']
  skills: string[]
  totalSessions: number
  totalLoc: number
  totalDurationMinutes: number
  totalAgentDurationMinutes?: number
  totalFilesChanged: number
  skippedSessions: Array<{ title: string; duration: number; loc: number; reason: string }>
  selectedSessionIds: string[]
  screenshotBase64?: string
}

export type UploadEvent =
  | { type: 'project'; status: 'creating' | 'created' | 'failed'; error?: string; fatal?: boolean; projectId?: number; slug?: string }
  | { type: 'screenshot'; status: 'capturing' | 'uploaded' | 'skipped'; reason?: string }
  | { type: 'session'; sessionId: string; status: 'uploading' | 'uploaded' | 'failed'; error?: string }
  | { type: 'done'; projectUrl: string; uploaded: number; failed: number; failedSessions: Array<{ sessionId: string; error: string }> }
  | { type: 'error'; message: string }

// ── Refine ───────────────────────────────────────────────────

export interface RefineAnswer {
  questionId: string
  question: string
  answer: string
}

export interface RefineResult {
  narrative: string
  timeline: ProjectEnhanceResult['timeline']
}

// ── Settings ─────────────────────────────────────────────────

export interface EnhanceStatus {
  mode: 'local' | 'proxy' | 'none' | 'unknown'
  remaining: number | null
  message?: string
}

export interface ApiKeyStatus {
  hasKey: boolean
  keyPrefix?: string
}

export interface AuthStatus {
  authenticated: boolean
  username?: string
}

// ── Boundary config (API shape, kept for backward compat) ────

export interface BoundaryConfig {
  selectedSessionIds: string[]
  skippedSessions: Array<{ sessionId: string; reason: string }>
}

// ── Search ──────────────────────────────────────────────────

export interface SearchResult {
  sessionId: string
  title: string
  projectDir: string
  projectName: string
  source: string
  date: string
  durationMinutes: number
  turns: number
  linesOfCode: number
  skills: string[]
  snippet: string
  score: number
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
}

// ── Context export ──────────────────────────────────────────

export interface ContextExportResponse {
  content: string
  tokens: number
  format: string
}

// ── Dashboard ────────────────────────────────────────────────

export interface DashboardProject {
  projectDir: string
  projectName: string
  sessionCount: number
  totalLoc: number
  totalDuration: number
  skills: string[]
  latestDate: string
  enhancedAt: string | null
}

export interface DashboardResponse {
  stats: {
    sessionCount: number
    projectCount: number
    sourceCount: number
    enhancedCount: number
  }
  projects: DashboardProject[]
  sync: {
    status: 'idle' | 'syncing' | 'done'
    phase: 'discovering' | 'indexing' | 'done'
    current: number
    total: number
    currentProject?: string
  }
  isEmpty: boolean
  onboardingComplete: boolean
}

export interface SyncProgressEvent {
  status: 'idle' | 'syncing' | 'done'
  phase: 'discovering' | 'indexing' | 'done'
  current: number
  total: number
  currentProject?: string
}

// ── Transcript ─────────────────────────────────────────────

export interface TranscriptTextBlock {
  type: 'text'
  text: string
}

export interface TranscriptThinkingBlock {
  type: 'thinking'
  text: string
}

export interface TranscriptToolCallBlock {
  type: 'tool_call'
  toolCallId: string
  toolName: string
  input: string
  inputData?: Record<string, unknown>
  output?: string
  outputTruncated?: boolean
  isError?: boolean
}

export type TranscriptBlock =
  | TranscriptTextBlock
  | TranscriptThinkingBlock
  | TranscriptToolCallBlock

export interface TranscriptMessage {
  id: string
  timestamp: string
  role: 'user' | 'assistant'
  blocks: TranscriptBlock[]
  model?: string
}

export interface TranscriptResponse {
  messages: TranscriptMessage[]
  meta: {
    totalMessages: number
    totalTokens: { input: number; output: number }
    models: string[]
    duration: { activeMinutes: number; wallClockMinutes: number }
  }
}
