export interface Settings {
    anthropicApiKey?: string;
}
export declare function getSettings(configDir?: string): Settings;
export declare function saveAnthropicApiKey(apiKey: string, configDir?: string): void;
export declare function clearAnthropicApiKey(configDir?: string): void;
/**
 * Returns the Anthropic API key from settings file or env var.
 * Env var takes precedence.
 */
export declare function getAnthropicApiKey(configDir?: string): string | undefined;
export interface EnhancedData {
    title: string;
    developerTake: string;
    context: string;
    skills: string[];
    questions: Array<{
        text: string;
        suggestedAnswer: string;
    }>;
    executionSteps: Array<{
        stepNumber: number;
        title: string;
        body: string;
    }>;
    qaPairs?: Array<{
        question: string;
        answer: string;
    }>;
    enhancedAt: string;
    /** True when enhanced via bulk mode with auto-accepted AI suggestions. */
    quickEnhanced?: boolean;
    /** True when uploaded to heyi.am via publish or bulk upload. */
    uploaded?: boolean;
}
export declare function saveEnhancedData(sessionId: string, data: Omit<EnhancedData, 'enhancedAt' | 'quickEnhanced'> & {
    quickEnhanced?: boolean;
}, configDir?: string): void;
export declare function loadEnhancedData(sessionId: string, configDir?: string): EnhancedData | null;
export declare function markAsUploaded(sessionId: string, configDir?: string): void;
export declare function deleteEnhancedData(sessionId: string, configDir?: string): void;
export interface ProjectEnhanceCache {
    fingerprint: string;
    enhancedAt: string;
    selectedSessionIds: string[];
    result: {
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
        questions: Array<{
            id: string;
            category: 'pattern' | 'architecture' | 'evolution';
            question: string;
            context: string;
        }>;
    };
}
/**
 * Build a fingerprint from the selected session IDs and their enhanced timestamps.
 * Changes to session selection or re-enhancement of any session invalidates the cache.
 */
export declare function buildProjectFingerprint(selectedSessionIds: string[], configDir?: string): string;
export declare function saveProjectEnhanceResult(projectDirName: string, selectedSessionIds: string[], result: ProjectEnhanceCache['result'], configDir?: string): void;
export declare function loadProjectEnhanceResult(projectDirName: string, configDir?: string): ProjectEnhanceCache | null;
/**
 * Check if cached project enhance result is still fresh.
 * Returns the cached result if fingerprint matches, null if stale or missing.
 */
export declare function loadFreshProjectEnhanceResult(projectDirName: string, selectedSessionIds: string[], configDir?: string): ProjectEnhanceCache | null;
export declare function deleteProjectEnhanceResult(projectDirName: string, configDir?: string): void;
export interface PublishedState {
    slug: string;
    projectId: number;
    publishedAt: string;
    publishedSessions: string[];
}
export declare function savePublishedState(projectDirName: string, data: Omit<PublishedState, 'publishedAt'>, configDir?: string): void;
export declare function getPublishedState(projectDirName: string, configDir?: string): PublishedState | null;
