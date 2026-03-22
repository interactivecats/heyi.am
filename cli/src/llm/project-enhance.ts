import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '../settings.js';

// ── Types ────────────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  title: string;
  developerTake?: string;
  skills: string[];
  executionSteps: Array<{ title: string; body: string }>;
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

// ── Prompts ──────────────────────────────────────────────────────

const PROJECT_ENHANCE_SYSTEM = `You are building a project narrative from multiple coding sessions for a developer portfolio on heyi.am.

Your job:
1. Synthesize a 2-3 sentence project description that captures what was built and why it matters. Write in third person about the project, not the developer. No fluff — every word earns its place.
2. Identify 4-7 project phases (the "arc") that show how the project evolved. Each phase should have a short title and one-sentence description.
3. Deduplicate and rank skills across all sessions.
4. Group sessions into timeline periods (e.g., "Week 1", "Days 1-3") with labels describing what happened in each period. Mark featured sessions (the most interesting ones) vs background sessions.
5. Generate 2-3 context-aware questions based on patterns you detect in the sessions (see instructions below).

For questions, look for these signals and generate questions that reference specific data:
- High correction counts → ask about override strategy, referencing the count
- Longest sessions → ask why that area was worth the time investment, referencing duration
- Zero file overlap between sessions → ask about isolation decisions
- Technology switches or unusual tool usage → ask about the choice
- Architectural keywords → ask about design trade-offs

Each question must have:
- A category: "pattern" (behavioral signals), "architecture" (design decisions), or "evolution" (how the project changed)
- A specific, non-generic question that references actual data from the sessions
- Context explaining why you're asking (what signal triggered it)

Return valid JSON matching this exact structure:
{
  "narrative": "2-3 sentence project description",
  "arc": [{ "phase": 1, "title": "...", "description": "..." }],
  "skills": ["skill1", "skill2"],
  "timeline": [{
    "period": "Week 1",
    "label": "Foundation and setup",
    "sessions": [{
      "sessionId": "uuid",
      "title": "Session title",
      "featured": true,
      "tag": "key decision"
    }]
  }],
  "questions": [{
    "id": "q1",
    "category": "pattern",
    "question": "You overrode the AI 4 times across sessions. Was that a conscious strategy?",
    "context": "High correction count detected across auth and sealing sessions"
  }]
}`;

const REFINE_NARRATIVE_SYSTEM = `You are refining a project narrative by incorporating the developer's own perspective. You have the draft narrative and timeline, plus the developer's answers to context-aware questions.

Weave their answers naturally into the existing narrative — don't quote them verbatim, make it sound like the developer wrote it. The narrative should feel like a developer thinking out loud, not an AI explaining.

Rules:
- Keep the narrative to 2-4 sentences. Quality over quantity.
- If an answer reveals motivation, fold it into the narrative.
- If an answer explains a decision, strengthen the relevant arc phase or timeline label.
- Don't add fluff words (leverage, utilize, robust, comprehensive, cutting-edge).
- Return the same JSON structure with updated narrative and timeline.

Return valid JSON:
{
  "narrative": "refined 2-4 sentence description",
  "timeline": [same structure as input, with updated labels where answers add context]
}`;

// ── Core functions ───────────────────────────────────────────────

function createClient(): Anthropic {
  const apiKey = getAnthropicApiKey();
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic();
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in LLM response');
  return JSON.parse(match[0]) as T;
}

/**
 * Generate a project narrative, arc, timeline, and context-aware questions
 * from enhanced session summaries.
 */
export async function enhanceProject(
  sessions: SessionSummary[],
  skippedSessions: SkippedSessionMeta[],
): Promise<ProjectEnhanceResult> {
  const client = createClient();

  const input = {
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId,
      title: s.title,
      developerTake: s.developerTake,
      skills: s.skills,
      executionSteps: s.executionSteps.map((e) => e.title),
      duration: s.duration,
      loc: s.loc,
      turns: s.turns,
      files: s.files,
      date: s.date,
      correctionCount: s.correctionCount,
    })),
    skippedSessions,
    totalSessions: sessions.length + skippedSessions.length,
  };

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: PROJECT_ENHANCE_SYSTEM,
    messages: [{
      role: 'user',
      content: JSON.stringify(input),
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const result = extractJson<ProjectEnhanceResult>(text);

  // Validate required fields
  if (!result.narrative || !Array.isArray(result.arc) || !Array.isArray(result.skills)) {
    throw new Error('LLM returned incomplete project enhance result');
  }

  // Ensure questions have IDs
  if (result.questions) {
    result.questions = result.questions.map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
    }));
  } else {
    result.questions = [];
  }

  return result;
}

/**
 * Refine a project narrative by weaving in the developer's answers
 * to context-aware questions.
 */
export async function refineNarrative(
  draftNarrative: string,
  draftTimeline: ProjectEnhanceResult['timeline'],
  answers: Array<{ questionId: string; question: string; answer: string }>,
): Promise<RefinedNarrative> {
  const client = createClient();

  const input = {
    draftNarrative,
    draftTimeline,
    answers: answers.filter((a) => a.answer.trim().length > 0),
  };

  // If no answers provided, return draft as-is
  if (input.answers.length === 0) {
    return { narrative: draftNarrative, timeline: draftTimeline };
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: REFINE_NARRATIVE_SYSTEM,
    messages: [{
      role: 'user',
      content: JSON.stringify(input),
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const result = extractJson<RefinedNarrative>(text);

  if (!result.narrative) {
    throw new Error('LLM returned incomplete refined narrative');
  }

  // Fall back to draft timeline if LLM didn't return one
  if (!Array.isArray(result.timeline)) {
    result.timeline = draftTimeline;
  }

  return result;
}
