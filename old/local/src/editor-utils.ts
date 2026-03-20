/**
 * Pure utility functions for the SessionEditor.
 * Extracted for testability without a browser environment.
 */

import type { SessionSummary, DeveloperQuote } from "./summarize.js";

// ── Field limits (from PRODUCT.md) ────────────────────────

export const FIELD_LIMITS = {
  title: 80,
  context: 200,
  developerTake: 300,
  stepTitle: 80,
  stepBody: 160,
  stepInsight: 160,
  skillTag: 40,
} as const;

// ── Types ─────────────────────────────────────────────────

export interface ExecutionStep {
  title: string;
  body: string;
  insight: string;
}

export interface EditorData {
  title: string;
  context: string;
  developer_take: string;
  execution_path: ExecutionStep[];
  skills: string[];
  // Developer take helpers (read-only, from AI)
  developerQuotes?: DeveloperQuote[];
  suggestedTake?: string;
}

export interface ValidationErrors {
  title?: string;
  developer_take?: string;
  execution_path?: string;
}

// ── Validation ────────────────────────────────────────────

export function validateEditorData(data: EditorData): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!data.title.trim()) {
    errors.title = "Title is required";
  } else if (data.title.length > FIELD_LIMITS.title) {
    errors.title = `Title exceeds ${FIELD_LIMITS.title} characters`;
  }

  if (!data.developer_take.trim()) {
    errors.developer_take = "Required -- add your take before publishing";
  } else if (data.developer_take.trim().length < 10) {
    errors.developer_take = "Too short -- say a bit more (min 10 characters)";
  } else if (data.developer_take.length > FIELD_LIMITS.developerTake) {
    errors.developer_take = `Developer take exceeds ${FIELD_LIMITS.developerTake} characters`;
  }

  if (data.execution_path.length === 0) {
    errors.execution_path = "At least one execution step is needed";
  }

  // Validate individual step field lengths
  for (const step of data.execution_path) {
    if (step.title.length > FIELD_LIMITS.stepTitle) {
      errors.execution_path = errors.execution_path || `Step title exceeds ${FIELD_LIMITS.stepTitle} characters`;
    }
    if (step.body.length > FIELD_LIMITS.stepBody) {
      errors.execution_path = errors.execution_path || `Step body exceeds ${FIELD_LIMITS.stepBody} characters`;
    }
    if (step.insight.length > FIELD_LIMITS.stepInsight) {
      errors.execution_path = errors.execution_path || `Step insight exceeds ${FIELD_LIMITS.stepInsight} characters`;
    }
  }

  return errors;
}

export function hasValidationErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

// ── Build editor data from summary ────────────────────────

interface MinimalAnalysis {
  turns: Array<{ userPrompt: string }>;
}

export function buildEditorDataFromSummary(
  summary: SessionSummary | null,
  analysis: MinimalAnalysis
): EditorData {
  if (!summary) {
    return {
      title: analysis.turns[0]?.userPrompt.slice(0, FIELD_LIMITS.title) || "",
      context: "",
      developer_take: "",
      execution_path: [],
      skills: [],
    };
  }

  const executionPath: ExecutionStep[] =
    summary.executionPath && summary.executionPath.length > 0
      ? summary.executionPath.map((step) => ({
          title: step.title.slice(0, FIELD_LIMITS.stepTitle),
          body: step.body.slice(0, FIELD_LIMITS.stepBody),
          insight: step.insight.slice(0, FIELD_LIMITS.stepInsight),
        }))
      : (summary.tutorialSteps || []).map((step) => ({
          title: step.title.slice(0, FIELD_LIMITS.stepTitle),
          body: step.description.slice(0, FIELD_LIMITS.stepBody),
          insight: (step.keyTakeaway || "").slice(0, FIELD_LIMITS.stepInsight),
        }));

  return {
    title: (summary.title || summary.oneLineSummary || "").slice(0, FIELD_LIMITS.title),
    context: (summary.context || "").slice(0, FIELD_LIMITS.context),
    developer_take: "",
    execution_path: executionPath,
    skills: summary.skills || summary.extractedSkills || [],
    developerQuotes: summary.developerQuotes,
    suggestedTake: summary.suggestedTake,
  };
}

// ── AI-filled detection ──────────────────────────────────
// Determines which editor fields were pre-filled by AI at mount time.
// "developer_take" is never marked as AI-filled (always human).

export type AiFilledField = "title" | "context" | "execution_path" | "skills";

export function detectAiFilled(data: EditorData): Set<AiFilledField> {
  const filled = new Set<AiFilledField>();
  if (data.title.trim()) filled.add("title");
  if (data.context.trim()) filled.add("context");
  if (data.execution_path.length > 0) filled.add("execution_path");
  if (data.skills.length > 0) filled.add("skills");
  return filled;
}

// ── Reference panel helpers ─────────────────────────────

export interface ToolGroup {
  name: string;
  count: number;
}

export function groupToolCalls(
  toolCalls: Array<{ name: string }>
): ToolGroup[] {
  const map = new Map<string, number>();
  for (const tc of toolCalls) {
    map.set(tc.name, (map.get(tc.name) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function formatTimeOffset(startIso: string, currentIso: string): string {
  if (!startIso || !currentIso) return "";
  const diffMs = new Date(currentIso).getTime() - new Date(startIso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "0m";
  return `${mins}m`;
}

// ── Character counter status ──────────────────────────────

export type CounterStatus = "ok" | "warning" | "danger";

export function getCounterStatus(current: number, max: number): CounterStatus {
  const ratio = current / max;
  if (ratio >= 0.9) return "danger";
  if (ratio >= 0.7) return "warning";
  return "ok";
}
