import Anthropic from '@anthropic-ai/sdk';
import type { Session } from './analyzer.js';

// ── Banned words (anti-fluff enforcement) ────────────────────

const BANNED_WORDS = ['leverage', 'utilize', 'streamline', 'enhance', 'robust', 'seamless'];
const BANNED_PATTERN = new RegExp(`\\b(${BANNED_WORDS.join('|')})\\b`, 'gi');

export function containsBannedWords(text: string): string[] {
  const matches = text.match(BANNED_PATTERN);
  return matches ? [...new Set(matches.map((m) => m.toLowerCase()))] : [];
}

export function stripBannedWords(text: string): string {
  return text.replace(BANNED_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

// ── Types ────────────────────────────────────────────────────

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

export type StreamEvent =
  | { type: 'title'; data: string }
  | { type: 'context'; data: string }
  | { type: 'developer_take'; data: string }
  | { type: 'skills'; data: string[] }
  | { type: 'question'; data: EnhancementQuestion }
  | { type: 'step'; data: EnhancementStep }
  | { type: 'done'; data: EnhancementResult }
  | { type: 'error'; data: string };

// ── Prompt construction ──────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a technical writing assistant for heyi.am, a platform where developers document AI coding sessions as case studies.

Your job: turn raw session data into a sharp, honest summary that sounds like a dev explaining what happened to another dev in a standup. Not a blog post. Not a tutorial.

HARD RULES:
- NEVER use these words: ${BANNED_WORDS.join(', ')}. If you catch yourself writing one, rewrite the sentence.
- Title: max 80 characters. Be specific about what was done. No clickbait.
- Context: max 200 characters. What was the state before this session? What was broken or missing?
- Developer take: max 300 characters. What was hard, surprising, or worth remembering? Write in first person.
- Steps: 5-7 steps. Each title max 20 words. Each body max 40 words. Be concrete — mention file names, tools, and specific decisions.
- Skills: extract from the actual tools, files, and patterns used. No padding. If they only touched 3 technologies, list 3.
- Questions: generate exactly 3 targeted questions based on the developer's actual corrections, decisions, and redirections during the session. These should be specific enough that a generic answer would be obviously wrong.

TONE: Slightly rough. Concrete. Compress. A dev thinking out loud, not an AI explaining.

Respond in JSON matching this exact schema:
{
  "title": "string (max 80 chars)",
  "context": "string (max 200 chars)",
  "developerTake": "string (max 300 chars)",
  "skills": ["string"],
  "questions": [{"text": "string", "suggestedAnswer": "string"}],
  "executionSteps": [{"stepNumber": number, "title": "string (max 20 words)", "body": "string (max 40 words)"}]
}`;
}

function buildUserPrompt(session: Session): string {
  const parts: string[] = [];

  parts.push(`Session: ${session.title}`);
  parts.push(`Project: ${session.projectName}`);
  parts.push(`Duration: ${session.durationMinutes} min, ${session.turns} turns, ${session.linesOfCode} LOC changed`);

  if (session.skills.length > 0) {
    parts.push(`Detected skills: ${session.skills.join(', ')}`);
  }

  if (session.toolBreakdown.length > 0) {
    parts.push(`Tool usage: ${session.toolBreakdown.map((t) => `${t.tool}(${t.count})`).join(', ')}`);
  }

  if (session.filesChanged.length > 0) {
    const topFiles = session.filesChanged
      .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
      .slice(0, 10);
    parts.push(`Key files: ${topFiles.map((f) => `${f.path} (+${f.additions}/-${f.deletions})`).join(', ')}`);
  }

  if (session.executionPath.length > 0) {
    parts.push('Execution path:');
    for (const step of session.executionPath) {
      parts.push(`  ${step.stepNumber}. [${step.type ?? 'implementation'}] ${step.title}: ${step.description}`);
    }
  }

  if (session.turnTimeline.length > 0) {
    // Include developer prompts — these are the decisions and corrections
    const devPrompts = session.turnTimeline
      .filter((t) => t.type === 'prompt')
      .slice(0, 15);
    if (devPrompts.length > 0) {
      parts.push('Developer prompts (decisions & corrections):');
      for (const p of devPrompts) {
        parts.push(`  [${p.timestamp}] ${p.content}`);
      }
    }
  }

  if (session.rawLog.length > 0) {
    const excerpt = session.rawLog.slice(0, 30).join('\n');
    parts.push(`Raw log excerpt:\n${excerpt}`);
  }

  return parts.join('\n');
}

// ── Enhancement (non-streaming) ──────────────────────────────

export interface SummarizeOptions {
  client?: Anthropic;
  model?: string;
}

export async function summarizeSession(
  session: Session,
  options: SummarizeOptions = {},
): Promise<EnhancementResult> {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? 'claude-sonnet-4-6';

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserPrompt(session) }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return parseEnhancementResult(text);
}

// ── Streaming enhancement ────────────────────────────────────

export async function* summarizeSessionStream(
  session: Session,
  options: SummarizeOptions = {},
): AsyncGenerator<StreamEvent> {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? 'claude-sonnet-4-6';

  let fullText = '';

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 2048,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(session) }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
      }
    }

    const result = parseEnhancementResult(fullText);

    // Emit structured events for progressive UI rendering
    yield { type: 'title', data: result.title };
    yield { type: 'context', data: result.context };
    yield { type: 'skills', data: result.skills };

    for (const step of result.executionSteps) {
      yield { type: 'step', data: step };
    }

    yield { type: 'developer_take', data: result.developerTake };

    for (const question of result.questions) {
      yield { type: 'question', data: question };
    }

    yield { type: 'done', data: result };
  } catch (err) {
    yield { type: 'error', data: (err as Error).message };
  }
}

// ── SSE helper for Express ───────────────────────────────────

export function createSSEHandler(session: Session, options: SummarizeOptions = {}) {
  return async (
    _req: { on: (event: string, handler: () => void) => void },
    res: {
      writeHead: (status: number, headers: Record<string, string>) => void;
      write: (data: string) => void;
      end: () => void;
    },
  ) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    let closed = false;
    _req.on('close', () => { closed = true; });

    for await (const event of summarizeSessionStream(session, options)) {
      if (closed) break;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    }

    if (!closed) {
      res.end();
    }
  };
}

// ── JSON parsing with validation ─────────────────────────────

export function parseEnhancementResult(raw: string): EnhancementResult {
  // Extract JSON from potential markdown code fences
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw];
  const jsonStr = jsonMatch[1]!.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${jsonStr.slice(0, 200)}`);
  }

  const title = enforceMaxLength(String(parsed.title ?? ''), 80);
  const context = enforceMaxLength(String(parsed.context ?? ''), 200);
  const developerTake = enforceMaxLength(String(parsed.developerTake ?? ''), 300);

  // Validate and enforce constraints
  const skills = Array.isArray(parsed.skills)
    ? (parsed.skills as string[]).filter((s) => typeof s === 'string')
    : [];

  const questions = Array.isArray(parsed.questions)
    ? (parsed.questions as Array<Record<string, string>>)
        .filter((q) => q.text && q.suggestedAnswer)
        .slice(0, 3)
        .map((q) => ({
          text: stripBannedWords(String(q.text)),
          suggestedAnswer: stripBannedWords(String(q.suggestedAnswer)),
        }))
    : [];

  const executionSteps = Array.isArray(parsed.executionSteps)
    ? (parsed.executionSteps as Array<Record<string, unknown>>)
        .slice(0, 7)
        .map((step, idx) => ({
          stepNumber: typeof step.stepNumber === 'number' ? step.stepNumber : idx + 1,
          title: enforceWordLimit(stripBannedWords(String(step.title ?? '')), 20),
          body: enforceWordLimit(stripBannedWords(String(step.body ?? '')), 40),
        }))
    : [];

  return {
    title: stripBannedWords(title),
    context: stripBannedWords(context),
    developerTake: stripBannedWords(developerTake),
    skills,
    questions,
    executionSteps,
  };
}

function enforceMaxLength(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function enforceWordLimit(str: string, maxWords: number): string {
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(' ') + '…';
}

// ── Exports for testing ──────────────────────────────────────

export { buildSystemPrompt as _buildSystemPrompt, buildUserPrompt as _buildUserPrompt };
