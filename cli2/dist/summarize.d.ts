import Anthropic from '@anthropic-ai/sdk';
import type { Session, TurnEvent } from './analyzer.js';
export declare function containsBannedWords(text: string): string[];
export declare function stripBannedWords(text: string): string;
export interface EnhancementResult {
    title: string;
    developerTake: string;
    context: string;
    skills: string[];
    questions: EnhancementQuestion[];
    executionSteps: EnhancementStep[];
}
export interface EnhancementQuestion {
    text: string;
    suggestedAnswer: string;
}
export interface EnhancementStep {
    stepNumber: number;
    title: string;
    body: string;
}
export type StreamEvent = {
    type: 'title';
    data: string;
} | {
    type: 'context';
    data: string;
} | {
    type: 'developer_take';
    data: string;
} | {
    type: 'skills';
    data: string[];
} | {
    type: 'question';
    data: EnhancementQuestion;
} | {
    type: 'step';
    data: EnhancementStep;
} | {
    type: 'done';
    data: EnhancementResult;
} | {
    type: 'error';
    data: string;
};
export interface SampleResult {
    turns: TurnEvent[];
    log: string[];
    sampled: boolean;
    totalTurns: number;
    selectedTurns: number;
}
export declare function scoreTurn(turn: TurnEvent, allTurns: TurnEvent[], idx: number): number;
export declare function sampleSession(session: Session): SampleResult;
declare function buildSystemPrompt(): string;
declare function buildUserPrompt(session: Session): string;
export interface SummarizeOptions {
    client?: Anthropic;
    model?: string;
}
export declare function summarizeSession(session: Session, options?: SummarizeOptions): Promise<EnhancementResult>;
export declare function summarizeSessionStream(session: Session, options?: SummarizeOptions): AsyncGenerator<StreamEvent>;
export declare function createSSEHandler(session: Session, options?: SummarizeOptions): (_req: {
    on: (event: string, handler: () => void) => void;
}, res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    write: (data: string) => void;
    end: () => void;
}) => Promise<void>;
export declare function parseEnhancementResult(raw: string): EnhancementResult;
export { buildSystemPrompt as _buildSystemPrompt, buildUserPrompt as _buildUserPrompt };
