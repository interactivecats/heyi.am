export interface SessionSummary {
    sessionId: string;
    title: string;
    developerTake?: string;
    skills: string[];
    executionSteps: Array<{
        title: string;
        body: string;
    }>;
    keyDecisions?: string[];
    duration: number;
    loc: number;
    turns: number;
    files: number;
    date: string;
    correctionCount?: number;
}
export interface SkippedSessionMeta {
    title: string;
    duration: number;
    loc: number;
}
export interface ProjectQuestion {
    id: string;
    category: 'pattern' | 'architecture' | 'evolution';
    question: string;
    context: string;
}
export interface ProjectEnhanceResult {
    narrative: string;
    arc: Array<{
        phase: number;
        title: string;
        description: string;
    }>;
    skills: string[];
    timeline: Array<{
        period: string;
        label: string;
        sessions: Array<{
            sessionId: string;
            title: string;
            featured: boolean;
            tag?: string;
        }>;
    }>;
    questions: ProjectQuestion[];
}
export interface RefinedNarrative {
    narrative: string;
    timeline: ProjectEnhanceResult['timeline'];
}
export type EnhanceProjectProgress = {
    type: 'narrative_chunk';
    text: string;
};
/**
 * Generate a project narrative, arc, timeline, and context-aware questions
 * from enhanced session summaries. Streams narrative chunks via onProgress
 * as the LLM generates the response.
 */
export declare function enhanceProject(sessions: SessionSummary[], skippedSessions: SkippedSessionMeta[], onProgress?: (event: EnhanceProjectProgress) => void): Promise<ProjectEnhanceResult>;
/**
 * Refine a project narrative by weaving in the developer's answers
 * to context-aware questions.
 */
export declare function refineNarrative(draftNarrative: string, draftTimeline: ProjectEnhanceResult['timeline'], answers: Array<{
    questionId: string;
    question: string;
    answer: string;
}>): Promise<RefinedNarrative>;
