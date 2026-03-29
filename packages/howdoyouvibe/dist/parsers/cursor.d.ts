import { type SessionParser, type SessionAnalysis } from "./types.js";
interface CursorBubble {
    _v?: number;
    type: number;
    bubbleId: string;
    text: string;
    createdAt?: string;
    isAgentic?: boolean;
    unifiedMode?: number;
    tokenCount?: {
        inputTokens: number;
        outputTokens: number;
    };
    toolFormerData?: CursorToolFormerData;
    codeBlocks?: CursorCodeBlock[];
    thinking?: {
        text: string;
    };
    context?: CursorContext;
    supportedTools?: number[];
}
interface CursorToolFormerData {
    tool?: number;
    toolCallId?: string;
    name?: string;
    rawArgs?: string;
    params?: string;
    result?: string;
    status?: string;
    modelCallId?: string;
    additionalData?: Record<string, unknown>;
}
interface CursorCodeBlock {
    uri?: {
        path?: string;
        _fsPath?: string;
    };
    content?: string;
    codeblockId?: string;
}
interface CursorContext {
    fileSelections?: Array<{
        uri?: {
            path?: string;
        };
    }>;
}
export interface CursorWorkspace {
    workspaceId: string;
    dbPath: string;
    projectDir: string;
}
export declare function discoverCursorWorkspaces(): Promise<CursorWorkspace[]>;
export interface CursorConversation {
    composerId: string;
    name?: string;
    createdAt: number;
    lastUpdatedAt?: number;
    mode?: string;
    totalLinesAdded?: number;
    totalLinesRemoved?: number;
    workspace: CursorWorkspace;
}
export declare function listConversations(workspace: CursorWorkspace): Promise<CursorConversation[]>;
export declare function readBubbles(conversationId: string, globalDbPath?: string): Promise<CursorBubble[]>;
export interface CursorParseHints {
    name?: string;
    createdAt?: number;
    lastUpdatedAt?: number;
    totalLinesAdded?: number;
    totalLinesRemoved?: number;
}
export declare function parseCursorConversation(conversationId: string, globalDbPath?: string, hints?: CursorParseHints): Promise<SessionAnalysis>;
export declare const cursorParser: SessionParser;
export {};
