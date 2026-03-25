export interface ParsedTurn {
    timestamp: string;
    type: 'prompt' | 'response' | 'tool' | 'error';
    content: string;
    toolName?: string;
    toolInput?: string;
    toolOutput?: string;
}
export interface ParsedFileChange {
    path: string;
    additions: number;
    deletions: number;
}
export interface SessionAnalysis {
    id: string;
    title: string;
    date: string;
    /** End time as ISO timestamp */
    endTime?: string;
    durationMinutes: number;
    /** Wall-clock minutes (first to last timestamp, includes idle) */
    wallClockMinutes?: number;
    projectName: string;
    /** Source tool: "claude", "cursor", "codex", "gemini", "antigravity" */
    source?: string;
    turns: ParsedTurn[];
    filesChanged: ParsedFileChange[];
    rawLog: string[];
    childAnalyses?: SessionAnalysis[];
    agentRole?: string;
    parentSessionId?: string | null;
    /** Working directory where the session was started */
    cwd?: string;
}
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
export interface TurnEvent {
    timestamp: string;
    type: 'prompt' | 'response' | 'tool' | 'error';
    content: string;
}
export interface FileChange {
    path: string;
    additions: number;
    deletions: number;
}
export interface AgentChild {
    sessionId: string;
    role: string;
    durationMinutes: number;
    linesOfCode: number;
    date?: string;
}
export interface Session {
    id: string;
    title: string;
    date: string;
    /** End time as ISO timestamp */
    endTime?: string;
    /** Active time in minutes (excludes idle gaps) */
    durationMinutes: number;
    /** Wall-clock time in minutes (first to last timestamp) */
    wallClockMinutes?: number;
    turns: number;
    linesOfCode: number;
    status: 'draft' | 'enhanced' | 'published' | 'archived';
    projectName: string;
    rawLog: string[];
    skills: string[];
    executionPath: ExecutionStep[];
    toolBreakdown: ToolUsage[];
    filesChanged: FileChange[];
    turnTimeline: TurnEvent[];
    toolCalls: number;
    /** AI-generated fields (populated from enhanced data) */
    context?: string;
    developerTake?: string;
    qaPairs?: Array<{
        question: string;
        answer: string;
    }>;
    children?: AgentChild[];
    parentSessionId?: string | null;
    agentRole?: string;
    isOrchestrated?: boolean;
    /** Working directory where the session was started */
    cwd?: string;
    /** True when enhanced via bulk mode with auto-accepted AI suggestions */
    quickEnhanced?: boolean;
    /** Source tool: "claude", "cursor", "codex", "gemini", "antigravity" */
    source?: string;
}
export declare function extractSkills(analysis: SessionAnalysis): string[];
export declare function computeToolBreakdown(turns: ParsedTurn[]): ToolUsage[];
export declare function generateExecutionPath(turns: ParsedTurn[]): ExecutionStep[];
export declare function buildTurnTimeline(turns: ParsedTurn[]): TurnEvent[];
export declare function detectContext(analysis: SessionAnalysis): string | undefined;
export declare function computeLinesOfCode(filesChanged: ParsedFileChange[]): number;
export declare function analyzeSession(analysis: SessionAnalysis): Session;
