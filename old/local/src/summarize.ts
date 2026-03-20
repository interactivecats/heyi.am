import Anthropic from "@anthropic-ai/sdk";
import type { SessionAnalysis, Turn } from "./analyzer.js";

/**
 * ═══════════════════════════════════════════════════════════════════
 * SUMMARIZATION PROMPT CONSTRAINTS (heyi.am Anti-Fluff System)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Output format: Signal-first case study, NOT a tutorial or blog post.
 * Voice: Personal build log. "I did X because Y."
 *
 * Execution path:
 *   - Max 5-7 steps
 *   - Each title: max 20 words
 *   - Each body: max 40 words, MUST contain a decision AND a reason
 *   - Each insight: cannot restate the step, must generalize slightly
 *
 * Banned words (all output): "leverage", "utilize", "streamline",
 *   "enhance", "robust", "seamless"
 *
 * Pattern extraction: constraintsSetUpfront, redirectionCount,
 *   verificationSteps, contextFilesLoaded, scopeChanges
 *
 * If it sounds like a tutorial -> rewrite as personal build log.
 * ═══════════════════════════════════════════════════════════════════
 */

function getClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
}

function tryParseJson(text: string): any | null {
  // Try raw parse first
  try { return JSON.parse(text); } catch {}
  // Try stripping markdown fences
  try { return JSON.parse(stripMarkdownFences(text)); } catch {}
  // Try extracting JSON from surrounding text
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

// Banned words that signal AI-generated fluff
const BANNED_WORDS = ["leverage", "utilize", "streamline", "enhance", "robust", "seamless"];

/**
 * Post-process summary to strip banned words from all string fields.
 * Replaces each banned word with a neutral alternative.
 */
function stripBannedWords(obj: any): any {
  if (typeof obj === "string") {
    let result = obj;
    for (const word of BANNED_WORDS) {
      const regex = new RegExp(`\\b${word}d?\\b`, "gi");
      result = result.replace(regex, (match) => {
        // Replace with neutral alternatives, preserving capitalization
        const lower = match.toLowerCase();
        let replacement: string;
        if (lower.startsWith("leverage")) replacement = "use";
        else if (lower.startsWith("utilize")) replacement = "use";
        else if (lower.startsWith("streamline")) replacement = "simplify";
        else if (lower.startsWith("enhance")) replacement = "improve";
        else if (lower === "robust") replacement = "solid";
        else if (lower === "seamless") replacement = "smooth";
        else return match;
        // Preserve leading capitalization
        if (match[0] === match[0].toUpperCase()) {
          replacement = replacement[0].toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
    }
    return result;
  }
  if (Array.isArray(obj)) return obj.map(stripBannedWords);
  if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = stripBannedWords(v);
    }
    return result;
  }
  return obj;
}

interface CompactTurn {
  i: number;
  prompt: string;
  tools: string[];
  errors: string[];
  response: string;
  model: string;
}

function compactTurns(analysis: SessionAnalysis): CompactTurn[] {
  return analysis.turns.map((t) => ({
    i: t.index,
    prompt: t.userPrompt.slice(0, 300),
    tools: t.toolCalls.map(
      (tc) =>
        `${tc.name}${tc.succeeded ? "" : " FAILED"}${tc.name === "Bash" ? `: ${((tc.input as any).command ?? "").toString().slice(0, 80)}` : tc.name === "Edit" || tc.name === "Write" ? `: ${((tc.input as any).file_path ?? "").toString().split("/").pop()}` : tc.name === "Agent" ? `: ${((tc.input as any).description ?? "").toString().slice(0, 50)}` : ""}`
    ),
    errors: t.toolCalls.filter((tc) => !tc.succeeded).map((tc) => tc.resultPreview.slice(0, 100)),
    response: t.assistantText.slice(0, 200),
    model: t.model.replace("claude-", "").replace(/-\d+$/, ""),
  }));
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── New output types (v2 schema) ──────────────────────────────

export interface ExecutionStep {
  title: string;
  body: string;
  insight: string;
}

export interface SummaryHighlight {
  type: "notable" | "insight" | "challenge";
  title: string;
  description: string;
}

export interface SessionPatterns {
  constraintsSetUpfront: boolean;
  redirectionCount: number;
  verificationSteps: number;
  contextFilesLoaded: number;
  scopeChanges: number;
}

export interface DeveloperQuote {
  text: string;
  turnIndex: number;
  type: "decision" | "correction" | "reaction" | "opinion";
}

// ── Session Questions types ────────────────────────────────

export interface SessionQuestion {
  id: string;
  category: "correction" | "decision" | "tradeoff" | "outcome" | "approach";
  question: string;
  suggestedAnswer: string;
  context?: string;
  turnIndex?: number;
}

export interface QuestionAnswer {
  questionId: string;
  answer: string;
}

// ── Legacy types (backward compatibility) ─────────────────────

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

// ── SessionSummary (v2 with backward-compatible fields) ───────

export interface SessionSummary {
  // v2 fields
  title: string;
  context: string;
  executionPath: ExecutionStep[];
  skills: string[];
  highlights: SummaryHighlight[];
  toolUsage: Record<string, { count: number }>;
  totalTurns: number;
  patterns: SessionPatterns;

  // Developer take helpers (Pass 3)
  developerQuotes?: DeveloperQuote[];
  suggestedTake?: string;

  // Session questions (Pass 4)
  questions?: SessionQuestion[];

  // Legacy fields (kept for backward compatibility)
  narrative: string;
  oneLineSummary: string;
  tutorialSteps: TutorialStep[];
  efficiencyInsights: string[];
  turningPoints?: TurningPoint[];
  beats?: Beat[];
  extractedSkills?: string[];
  tokensUsed: number;
}

// ── Prompt construction ───────────────────────────────────────

function buildSummarizationPrompt(
  analysis: SessionAnalysis,
  turnsJson: string,
  chunkInfo: string,
  developerAnswers?: string,
): string {
  const answersSection = developerAnswers
    ? `\n\nDEVELOPER'S OWN WORDS — weave these into the output:
${developerAnswers}

The developer answered questions about this session. Their exact words should appear in:
- executionPath step bodies (where relevant to that step)
- narrative (as natural quotes or paraphrases)
- context (if they described the problem better than the raw data)
Preserve their voice. Structure around their words, don't rewrite them.\n`
    : "";

  return `You are summarizing an AI coding session into a signal-first case study.${answersSection}

Write as a PERSONAL BUILD LOG, not a tutorial or blog post.
Voice: "I did X because Y." Not "This step involved..." or "The developer proceeded to..."

${chunkInfo}

Session info:
- Project: ${analysis.projectPath}
- Branch: ${analysis.gitBranch}
- Duration: ${analysis.duration.minutes} minutes
- Total tool calls: ${analysis.totalToolCalls}
- Files changed: ${analysis.filesChanged.map((f) => f.filePath.split("/").pop()).join(", ")}

Turns:
${turnsJson}

Respond with a JSON object (no markdown fences, raw JSON only):

{
  "title": "string, max 80 chars, what was built — be specific",
  "context": "string, max 200 chars, the problem that triggered this session",
  "executionPath": [
    {
      "title": "string, max 20 words, short action title",
      "body": "string, max 40 words, 1-2 sentences with a decision AND a reason",
      "insight": "string, non-obvious takeaway that generalizes slightly beyond this specific step"
    }
  ],
  "skills": ["array of 3-8 specific technology/pattern tags"],
  "highlights": [
    {
      "type": "notable|insight|challenge",
      "title": "string",
      "description": "string"
    }
  ],
  "patterns": {
    "constraintsSetUpfront": true,
    "redirectionCount": 3,
    "verificationSteps": 4,
    "contextFilesLoaded": 7,
    "scopeChanges": 1
  },
  "beats": [
    {
      "type": "correction|insight|win",
      "title": "string, max 60 chars, what happened",
      "description": "string, 1-2 sentences",
      "turnIndex": 0
    }
  ],
  "narrative": "2-3 paragraph story of the session, personal voice"
}

BEATS — notable moments in the session. NOT the same as executionPath steps.
- Each turn in the input has an "i" field (e.g. i:0, i:1, i:5, i:12, i:45). These are the REAL turn indices.
- turnIndex in each beat MUST be one of those real "i" values. For a 70-turn session, beats should reference turns scattered across i:0 to i:69 — NOT just i:0 through i:6.
- DO NOT just number beats sequentially. SEARCH the turns array to find WHERE each notable moment actually happened.
- Example: if the user said "actually, remove that" at turn i:31, the beat turnIndex should be 31.
- Only emit beats for NOTABLE moments. A 20-turn session should have 2-4 beats.
- "step" is NOT a valid beat type. Only use correction, insight, or win.
- Types:
  - "correction": The user explicitly redirected the AI. Look for: "no", "wrong", "not that", "instead", "revert", "that broke", "actually".
  - "insight": A non-obvious realization. The user or AI discovered something unexpected.
  - "win": Something shipped, tests passed, a problem was definitively solved.
- Keep beats sparse. Quality over quantity. Spread them across the FULL session, not clustered at the start.

HARD CONSTRAINTS — violating any of these makes the output unusable:

1. executionPath: exactly 5-7 steps. No more, no fewer (unless session is very short, then 3 minimum).
2. Each step title: max 20 words.
3. Each step body: max 40 words. MUST contain both a DECISION (what was chosen) and a REASON (why).
4. Each insight CANNOT restate the step. It must generalize — what would another developer learn from this?
5. BANNED WORDS in ALL output: "leverage", "utilize", "streamline", "enhance", "robust", "seamless". Using any of these words fails the task.
6. If any text sounds like a tutorial or blog post, rewrite it as a personal build log entry.
7. title must be max 80 characters. Be specific about what was built.
8. context must be max 200 characters. State the triggering problem, not the solution.

PATTERN EXTRACTION — analyze the session turns and extract:
- constraintsSetUpfront (boolean): Were boundaries, scope, or requirements defined in the first 3 turns?
- redirectionCount (integer): How many times did the user correct, reject, or redirect the AI? Count explicit corrections like "no", "wrong", "not that", "instead do X".
- verificationSteps (integer): How many test runs, manual checks, or verification actions occurred? Count Bash commands that run tests, curl, or check output.
- contextFilesLoaded (integer): How many files were explicitly Read before being edited? Count Read tool calls on files that were later modified.
- scopeChanges (integer): How many mid-session pivots in direction or scope? Count moments where the user abandoned one approach for another.

BAD example (tutorial voice):
  title: "Implementing a comprehensive authentication system"
  body: "This step involved setting up the authentication middleware to handle user sessions."

GOOD example (build log voice):
  title: "Switched from JWT to session tokens"
  body: "JWTs can't be revoked without a blocklist. Switched to opaque session tokens stored server-side — simpler and actually secure."
  insight: "Stateless auth sounds elegant until you need to revoke access. Then you're building state management anyway."`;
}

function buildMergePrompt(chunkSummaries: string[]): string {
  return `Merge these ${chunkSummaries.length} partial session summaries into one cohesive case study.

IMPORTANT: Write as a personal build log. No tutorial voice. No fluff.
BANNED WORDS: "leverage", "utilize", "streamline", "enhance", "robust", "seamless"

Partial summaries:
${chunkSummaries.map((s, i) => `--- Part ${i + 1} ---\n${s}`).join("\n\n")}

Respond with a single merged JSON object (no markdown fences):
{
  "title": "string, max 80 chars, what was built",
  "context": "string, max 200 chars, the triggering problem",
  "executionPath": [
    {
      "title": "max 20 words",
      "body": "max 40 words, decision + reason",
      "insight": "non-obvious generalized takeaway"
    }
  ],
  "skills": ["3-8 technology/pattern tags"],
  "highlights": [
    {"type": "notable|insight|challenge", "title": "", "description": ""}
  ],
  "patterns": {
    "constraintsSetUpfront": true,
    "redirectionCount": 0,
    "verificationSteps": 0,
    "contextFilesLoaded": 0,
    "scopeChanges": 0
  },
  "narrative": "2-3 paragraph merged story, personal voice"
}

Merge rules:
- Combine executionPath steps chronologically. Keep 5-7 total.
- Merge patterns by summing counts and OR-ing booleans.
- Deduplicate skills.
- Keep only the most significant highlights (max 5).`;
}

// ── Streaming summarization ───────────────────────────────────

/**
 * Stream summarization results as they arrive from the AI.
 * Calls `onPartial` with incrementally parsed JSON fields.
 * Returns the final complete summary.
 */
export async function summarizeSessionStreaming(
  analysis: SessionAnalysis,
  apiKey: string,
  onPartial: (partial: Partial<SessionSummary>) => void,
  answers?: QuestionAnswer[],
  questions?: SessionQuestion[],
): Promise<SessionSummary> {
  const client = getClient(apiKey);
  const compact = compactTurns(analysis);
  const compactJson = JSON.stringify(compact);
  const estimatedTokens = estimateTokens(compactJson);

  // Build developer answers string for the prompt
  let developerAnswers: string | undefined;
  if (answers && answers.length > 0 && questions && questions.length > 0) {
    developerAnswers = questions
      .map((q) => {
        const a = answers.find((ans) => ans.questionId === q.id);
        if (!a || !a.answer.trim()) return null;
        return `Q: ${q.question}\nA: ${a.answer}`;
      })
      .filter(Boolean)
      .join("\n\n");
    if (!developerAnswers) developerAnswers = undefined;
  }

  const prompt = buildSummarizationPrompt(analysis, compactJson, "", developerAnswers);

  let fullText = "";

  const stream = await client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;

      // Try to parse incrementally — extract completed fields
      const partial = tryParsePartialJson(fullText);
      if (partial) {
        onPartial(partial as Partial<SessionSummary>);
      }
    }
  }

  // Final parse and normalize
  let rawResult = tryParseJson(stripMarkdownFences(fullText));
  if (rawResult) {
    rawResult = stripBannedWords(rawResult);
  }

  // Pass 2: Fix beat turn indices with a focused second call
  if (rawResult?.beats && Array.isArray(rawResult.beats) && rawResult.beats.length > 0) {
    onPartial({ ...rawResult, _status: "Mapping beats to exact turns..." } as any);
    try {
      rawResult.beats = await mapBeatsToTurns(client, rawResult.beats, compact);
      onPartial(rawResult as Partial<SessionSummary>);
    } catch (err) {
      console.error("Beat mapping pass 2 failed, keeping original indices:", err);
    }
  }

  // Pass 3: Extract developer quotes and generate suggested take
  let developerQuotes: DeveloperQuote[] = [];
  let suggestedTake = "";

  onPartial({ _status: "Extracting your quotes..." } as any);
  try {
    developerQuotes = await extractDeveloperQuotes(client, compact);
    onPartial({ developerQuotes } as Partial<SessionSummary>);
  } catch (err) {
    console.error("Quote extraction failed:", err);
  }

  if (developerQuotes.length > 0) {
    onPartial({ _status: "Composing your take..." } as any);
    try {
      const writingStyle = analyzeWritingStyle(compact);
      const beatsForTake = rawResult?.beats || [];
      const titleForTake = rawResult?.title || "";
      suggestedTake = await generateSuggestedTake(
        client,
        developerQuotes,
        writingStyle,
        beatsForTake,
        titleForTake,
      );
      onPartial({ suggestedTake } as Partial<SessionSummary>);
    } catch (err) {
      console.error("Suggested take generation failed:", err);
    }
  }

  const result = normalizeToSessionSummary(rawResult, analysis, estimatedTokens);
  // Attach pass 3 results
  result.developerQuotes = developerQuotes;
  result.suggestedTake = suggestedTake || undefined;

  onPartial(result);
  return result;
}

/**
 * Try to extract completed fields from a partial JSON string.
 * Returns whatever fields have been fully written so far.
 */
function tryParsePartialJson(text: string): Record<string, any> | null {
  // Try to find completed top-level string fields
  const stripped = stripMarkdownFences(text).trim();
  const result: Record<string, any> = {};
  let found = false;

  // Extract "title": "..."
  const titleMatch = stripped.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (titleMatch) { result.title = titleMatch[1]; found = true; }

  // Extract "context": "..."
  const contextMatch = stripped.match(/"context"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (contextMatch) { result.context = contextMatch[1]; found = true; }

  // Extract "narrative": "..."
  const narrativeMatch = stripped.match(/"narrative"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (narrativeMatch) { result.narrative = narrativeMatch[1]; found = true; }

  // Extract completed executionPath entries
  const pathMatch = stripped.match(/"executionPath"\s*:\s*\[([\s\S]*)/);
  if (pathMatch) {
    const arrayContent = pathMatch[1];
    const steps: any[] = [];
    const objRegex = /\{[^{}]*"title"\s*:\s*"(?:[^"\\]|\\.)*"[^{}]*"body"\s*:\s*"(?:[^"\\]|\\.)*"[^{}]*\}/g;
    let m;
    while ((m = objRegex.exec(arrayContent)) !== null) {
      try {
        steps.push(JSON.parse(m[0]));
      } catch { /* incomplete */ }
    }
    if (steps.length > 0) { result.executionPath = steps; found = true; }
  }

  // Extract skills array
  const skillsMatch = stripped.match(/"skills"\s*:\s*(\[[^\]]*\])/);
  if (skillsMatch) {
    try {
      result.skills = JSON.parse(skillsMatch[1]);
      found = true;
    } catch { /* incomplete */ }
  }

  // Extract completed beats
  const beatsMatch = stripped.match(/"beats"\s*:\s*\[([\s\S]*)/);
  if (beatsMatch) {
    const beatsContent = beatsMatch[1];
    const beatObjects: any[] = [];
    const beatRegex = /\{[^{}]*"type"\s*:\s*"(?:[^"\\]|\\.)*"[^{}]*"turnIndex"\s*:\s*\d+[^{}]*\}/g;
    let bm;
    while ((bm = beatRegex.exec(beatsContent)) !== null) {
      try {
        beatObjects.push(JSON.parse(bm[0]));
      } catch { /* incomplete */ }
    }
    if (beatObjects.length > 0) { result.beats = beatObjects; found = true; }
  }

  return found ? result : null;
}

// ── Pass 2: Map beats to exact turn indices ──────────────────

async function mapBeatsToTurns(
  client: Anthropic,
  beats: Array<{ type: string; title: string; description?: string; turnIndex?: number }>,
  turns: CompactTurn[],
): Promise<Array<{ type: string; title: string; description: string; turnIndex: number }>> {
  // Build a compact representation of turns for the mapping call
  const turnSummaries = turns.map(t =>
    `[i:${t.i}] "${t.prompt.slice(0, 150)}${t.prompt.length > 150 ? "..." : ""}"`
  ).join("\n");

  const beatsDesc = beats.map((b, i) =>
    `Beat ${i}: [${b.type}] "${b.title}"`
  ).join("\n");

  const prompt = `Match each beat to the EXACT turn where it happened.

Turns (each has an index i:N):
${turnSummaries}

Beats to match:
${beatsDesc}

For each beat, find the turn where the user's prompt most closely matches the described moment.
Look at the actual text of each turn prompt to find the right match.

Respond with ONLY a JSON array of turn indices, one per beat, in order.
Example for 3 beats: [12, 31, 58]

Rules:
- Each number must be a real turn index (i:N value) from the turns list above.
- Different beats should map to different turns when possible.
- Spread across the full session, not clustered at the start.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const indices = tryParseJson(text);

  if (Array.isArray(indices) && indices.length === beats.length) {
    return beats.map((beat, i) => ({
      type: beat.type,
      title: beat.title,
      description: beat.description || "",
      turnIndex: typeof indices[i] === "number" ? indices[i] : 0,
    }));
  }

  // Fallback: return beats as-is
  return beats.map(b => ({
    type: b.type,
    title: b.title,
    description: b.description || "",
    turnIndex: b.turnIndex || 0,
  }));
}

// ── Pass 3: Extract developer quotes + suggested take ─────────

/**
 * Analyze the developer's writing style from their prompts.
 * Returns descriptive signals the take-generation prompt can use.
 */
function analyzeWritingStyle(turns: CompactTurn[]): string {
  const prompts = turns.map(t => t.prompt);
  const totalChars = prompts.reduce((sum, p) => sum + p.length, 0);
  const avgLen = prompts.length > 0 ? totalChars / prompts.length : 0;

  const signals: string[] = [];

  // Length signal
  if (avgLen < 60) signals.push("short and blunt");
  else if (avgLen < 150) signals.push("moderate length");
  else signals.push("detailed and verbose");

  // Contraction usage
  const allText = prompts.join(" ");
  const contractionCount = (allText.match(/\b(I'm|don't|can't|won't|isn't|aren't|didn't|doesn't|shouldn't|couldn't|wouldn't|it's|that's|let's|there's|we're|they're|I've|I'd|I'll|we'll|you're|you'll)\b/gi) || []).length;
  if (contractionCount > 3) signals.push("uses contractions frequently");
  else signals.push("few contractions");

  // Formality
  const casualMarkers = (allText.match(/\b(yeah|yep|nope|gonna|gotta|kinda|sorta|lol|haha|shit|damn|ok|okay|cool|nice|sweet|dude|literally|honestly|basically|stuff|thing)\b/gi) || []).length;
  if (casualMarkers > 5) signals.push("casual/informal tone");
  else if (casualMarkers > 1) signals.push("slightly casual");
  else signals.push("professional tone");

  // Technical jargon density
  const techMarkers = (allText.match(/\b(API|endpoint|middleware|schema|migration|refactor|deploy|CI|CD|pipeline|container|cluster|auth|OAuth|JWT|CORS|SSR|SSG|hook|component|reducer|mutex|async|await|promise|callback|interface|generic|type|enum|struct|module|package|crate|import|dependency)\b/gi) || []).length;
  if (techMarkers > 10) signals.push("heavy technical jargon");
  else if (techMarkers > 3) signals.push("moderate technical vocabulary");
  else signals.push("plain language");

  return signals.join(", ");
}

/**
 * Extract 3-5 opinionated developer quotes from the session prompts.
 * Looks for decisions, corrections, reactions, and opinions.
 */
async function extractDeveloperQuotes(
  client: Anthropic,
  turns: CompactTurn[],
): Promise<DeveloperQuote[]> {
  // Only send prompts (not responses) for quote extraction
  const promptSummaries = turns.map(t =>
    `[i:${t.i}] "${t.prompt}"`
  ).join("\n");

  const prompt = `Extract 3-5 opinionated statements from this developer's prompts during an AI coding session.

Developer prompts:
${promptSummaries}

Look for:
- DECISIONS: "I think...", "let's go with...", "we should...", "I want to..."
- CORRECTIONS: "no", "wrong", "actually", "instead", "not that", "revert"
- REACTIONS: "that's great", "this is broken", "not good enough", "perfect"
- OPINIONS: "I want...", "the problem is...", "it should...", "I prefer..."

Pick the most TELLING quotes -- ones that reveal how this developer thinks and makes decisions.
Keep the original wording. Truncate to max 120 characters if needed, preserving meaning.

Respond with ONLY a JSON array (no markdown fences):
[
  { "text": "exact quote from the prompt", "turnIndex": 5, "type": "decision" }
]

Rules:
- turnIndex must be a real i:N value from the prompts above.
- 3-5 quotes total, spread across the session.
- type must be one of: "decision", "correction", "reaction", "opinion".
- Prefer quotes that sound like a real person, not generic instructions.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = tryParseJson(text);

  if (!Array.isArray(parsed)) return [];

  const validTypes = new Set(["decision", "correction", "reaction", "opinion"]);
  return parsed
    .filter((q: any) =>
      q && typeof q.text === "string" &&
      typeof q.turnIndex === "number" &&
      validTypes.has(q.type)
    )
    .slice(0, 5)
    .map((q: any) => ({
      text: q.text.slice(0, 120),
      turnIndex: q.turnIndex,
      type: q.type as DeveloperQuote["type"],
    }));
}

/**
 * Generate a suggested developer take in the developer's voice.
 * Uses their quotes, writing style, and session summary.
 */
async function generateSuggestedTake(
  client: Anthropic,
  quotes: DeveloperQuote[],
  writingStyle: string,
  beats: Array<{ type: string; title: string; description?: string }>,
  title: string,
): Promise<string> {
  if (quotes.length === 0) return "";

  const quotesText = quotes
    .map(q => `- [${q.type}] "${q.text}"`)
    .join("\n");

  const beatsText = beats.length > 0
    ? beats.map(b => `- ${b.title}`).join("\n")
    : "No beats extracted yet.";

  const prompt = `Here are things the developer said during this session:
${quotesText}

Their writing style: ${writingStyle}

What the session was about: ${title}

Key moments:
${beatsText}

Write a 2-3 sentence "developer take" that sounds like this person explaining what they did to a colleague. Use their vocabulary and sentence structure. Do NOT sound like AI.

Rules:
- Max 280 characters total.
- First person ("I" not "the developer").
- Match their level of formality and technical vocabulary.
- Reference a specific decision or realization from the session.
- BANNED WORDS: "leverage", "utilize", "streamline", "enhance", "robust", "seamless".
- No marketing speak. No filler. Sound like a human in Slack, not a blog post.

Respond with ONLY the take text, no quotes, no JSON, no explanation.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  // Strip any surrounding quotes the model might add
  const cleaned = text.trim().replace(/^["']|["']$/g, "");
  return stripBannedWords(cleaned) as string;
}

// ── Pass 4: Generate session questions ────────────────────────

/**
 * Strip system tags, XML-like markers, and other non-human content
 * from a user prompt so only the developer's actual words remain.
 */
function cleanPrompt(raw: string): string {
  return raw
    // Remove XML-like system tags and their content
    .replace(/<[a-z-]+>[\s\S]*?<\/[a-z-]+>/gi, "")
    // Remove self-closing or unclosed system tags
    .replace(/<\/?[a-z-]+[^>]*>/gi, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a prompt is a real user message (not a system/command message).
 */
function isHumanPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  // Skip system/command messages
  if (trimmed.startsWith("<")) return false;
  // Skip bracketed system messages like "[Request interrupted by user]"
  if (trimmed.startsWith("[")) return false;
  // Skip very short prompts that are likely just "yes" or "ok"
  if (trimmed.length < 5) return false;
  // Skip pasted plans/specs — if it starts with "Implement the following" or similar,
  // the dev's intent is just "do this plan", not the plan content itself
  if (/^(Implement|Execute|Follow|Apply|Run) (the |this |my )?follow/i.test(trimmed)) return false;
  return true;
}

/**
 * Build a prompt context string from raw analysis data for question generation.
 * Works BEFORE AI summarization — scans turns for corrections, idle gaps, etc.
 * All prompts are cleaned of system tags before inclusion.
 */
function buildQuestionContext(
  analysis: SessionAnalysis,
): string {
  const parts: string[] = [];
  const compact = compactTurns(analysis);

  // Clean all prompts and filter to real human messages
  const humanTurns = compact
    .map(t => ({ ...t, prompt: cleanPrompt(t.prompt) }))
    .filter(t => isHumanPrompt(t.prompt));

  // Scan turns for correction-like prompts
  const correctionPatterns = /\b(no|wrong|not that|instead|revert|that broke|actually|undo|go back|scratch that|never mind)\b/i;
  const corrections = humanTurns.filter(t => correctionPatterns.test(t.prompt));
  if (corrections.length > 0) {
    parts.push("Correction moments (dev redirected the AI):");
    for (const c of corrections.slice(0, 4)) {
      parts.push(`  - Turn ${c.i}: "${c.prompt.slice(0, 120)}"`);
    }
  }

  // Idle gaps — only include significant ones (>5 min) and describe them without raw timestamps
  if (analysis.idleGaps && analysis.idleGaps.length > 0) {
    const significantGaps = analysis.idleGaps.filter(g => g.minutes >= 5);
    if (significantGaps.length > 0) {
      parts.push("Pauses during session:");
      for (const gap of significantGaps.slice(0, 3)) {
        // Clean the "after" field too
        const afterClean = cleanPrompt(gap.after);
        if (afterClean && isHumanPrompt(afterClean)) {
          parts.push(`  - ${gap.minutes} min pause after: "${afterClean.slice(0, 80)}"`);
        } else {
          parts.push(`  - ${gap.minutes} min pause mid-session`);
        }
      }
    }
  }

  // Failed tool calls (things that went wrong)
  const failedTurns = compact.filter(t => t.errors.length > 0);
  if (failedTurns.length > 0) {
    parts.push("Errors/failures:");
    for (const t of failedTurns.slice(0, 3)) {
      parts.push(`  - Turn ${t.i}: ${t.errors[0]}`);
    }
  }

  // First prompt (what kicked it off)
  if (humanTurns.length > 0) {
    parts.push(`First prompt: "${humanTurns[0].prompt.slice(0, 200)}"`);
  }

  // Files changed
  if (analysis.filesChanged.length > 0) {
    const fileNames = analysis.filesChanged.map(f => f.filePath.split("/").pop()).join(", ");
    parts.push(`Files changed: ${fileNames}`);
  }

  // Key decisions (prompts with "let's", "I want", "we should", etc.)
  const decisionPatterns = /\b(let's|I want|we should|I think|go with|prefer|switch to|try)\b/i;
  const decisions = humanTurns.filter(t => decisionPatterns.test(t.prompt) && !correctionPatterns.test(t.prompt));
  if (decisions.length > 0) {
    parts.push("Decision moments:");
    for (const d of decisions.slice(0, 3)) {
      parts.push(`  - Turn ${d.i}: "${d.prompt.slice(0, 120)}"`);
    }
  }

  return parts.join("\n");
}

/**
 * Generate 3-4 targeted session questions from raw analysis data.
 * Called BEFORE AI summarization so the dev's answers can be woven in.
 */
export async function generateSessionQuestions(
  analysis: SessionAnalysis,
  apiKey: string,
): Promise<SessionQuestion[]> {
  const client = getClient(apiKey);
  const contextStr = buildQuestionContext(analysis);

  const prompt = `You are generating 3-4 questions for a developer about an AI coding session they ran. Their answers get woven into a case study.

The developer remembers WHAT THEY ASKED FOR — their prompts, their requests, their corrections. They may NOT remember exactly what the AI did in response. Base every question on something the developer SAID or ASKED FOR, not on implementation details.

Session — the developer's prompts:
${contextStr}

Good questions (based on what they asked):
- "You asked for X — what problem were you solving?" — why they wanted it
- "You told the AI to change direction here — what wasn't right?" — their judgment
- "You asked for this specific approach — what made you pick it?" — their reasoning
- "What would you tell someone else working on this?" — distilled insight

Bad questions (NEVER ask):
- Anything about implementation details the AI chose (the dev may not know)
- "Why did you pause/stop?" — they won't remember
- Session mechanics (turn count, duration, tool usage)
- Anything requiring knowledge of the code the AI wrote

The "context" field shows the dev WHICH of their prompts you're asking about. Always quote their actual words.

Question categories:
- "decision": They asked for something specific. Why that approach?
- "correction": They told the AI to change direction. What was wrong?
- "approach": The overall problem they were solving. Why tackle it this way?
- "outcome": What they'd tell a colleague about this work.

ALWAYS include exactly one "outcome" question as the last question.

Respond with ONLY a JSON array (no markdown fences):
[
  {
    "id": "q_decision_1",
    "category": "decision",
    "question": "What made you go with session tokens?",
    "suggestedAnswer": "JWTs seemed like overkill — I just needed something I could revoke.",
    "context": "You asked: \\"switch to session tokens\\"",
    "turnIndex": 12
  }
]

Rules:
- 3-4 questions total.
- Each suggestedAnswer: max 120 characters, first person, casual — like explaining to a colleague.
- Each question: max 100 characters. Reference what THEY asked for, not what the AI did.
- context: max 150 characters. MUST quote the developer's own words from their prompts.
- id format: "q_{category}_{number}"
- BANNED WORDS in suggestedAnswer: "leverage", "utilize", "streamline", "enhance", "robust", "seamless"
- NEVER include raw timestamps, XML tags, or system internals in any field.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = tryParseJson(text);

  if (!Array.isArray(parsed)) return [];

  const validCategories = new Set(["correction", "decision", "tradeoff", "outcome", "approach"]);

  return parsed
    .filter((q: any) =>
      q &&
      typeof q.id === "string" &&
      typeof q.question === "string" &&
      typeof q.suggestedAnswer === "string" &&
      validCategories.has(q.category)
    )
    .slice(0, 4)
    .map((q: any) => ({
      id: q.id,
      category: q.category as SessionQuestion["category"],
      question: q.question.slice(0, 200),
      suggestedAnswer: stripBannedWords(q.suggestedAnswer.slice(0, 120)) as string,
      context: q.context ? q.context.slice(0, 150) : undefined,
      turnIndex: typeof q.turnIndex === "number" ? q.turnIndex : undefined,
    }));
}

// ── Regeneration with developer answers ──────────────────────

/**
 * Regenerate summary fields by weaving in the developer's answers.
 * Preserves the dev's exact words where possible — the AI structures around them.
 * Returns updated executionPath, narrative, suggestedTake, and context.
 */
export async function regenerateWithAnswers(
  summary: SessionSummary,
  questions: SessionQuestion[],
  answers: QuestionAnswer[],
  apiKey: string,
): Promise<Partial<SessionSummary>> {
  const client = getClient(apiKey);

  // Build Q&A pairs for the prompt
  const qaPairs = questions
    .map((q) => {
      const answer = answers.find((a) => a.questionId === q.id);
      if (!answer || !answer.answer.trim()) return null;
      return `Q: ${q.question}\nA: ${answer.answer}`;
    })
    .filter(Boolean)
    .join("\n\n");

  if (!qaPairs) {
    // No answers — return unchanged
    return {};
  }

  const existingPath = (summary.executionPath || [])
    .map((s, i) => `${i + 1}. ${s.title}: ${s.body}`)
    .join("\n");

  const prompt = `You are enriching an AI coding session case study with the developer's own words.

Original case study:
Title: ${summary.title}
Context: ${summary.context || ""}
Execution path:
${existingPath}
Narrative: ${summary.narrative || ""}

The developer answered these questions about the session:
${qaPairs}

Your job: weave the developer's answers INTO the case study so their voice is load-bearing, not decorative.

Rules:
1. PRESERVE the developer's exact words where possible. Quote them or embed them naturally.
2. Update execution path step bodies to reference what the developer said.
3. Generate a new suggestedTake (max 280 chars) synthesized from their answers.
4. Update context if the developer explained the problem better than the AI did.
5. Update narrative to include the developer's reasoning.
6. Do NOT change execution path titles or add/remove steps.
7. BANNED WORDS: "leverage", "utilize", "streamline", "enhance", "robust", "seamless"
8. Voice: personal build log. "I did X because Y."

Respond with ONLY a JSON object (no markdown fences):
{
  "executionPath": [
    { "title": "same title", "body": "enriched body with dev's words", "insight": "same or updated insight" }
  ],
  "narrative": "2-3 paragraph enriched narrative",
  "suggestedTake": "max 280 chars, synthesized from dev's answers",
  "context": "max 200 chars, updated if dev gave better problem description"
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let parsed = tryParseJson(text);

  if (!parsed) return {};

  parsed = stripBannedWords(parsed);

  const result: Partial<SessionSummary> = {};

  if (Array.isArray(parsed.executionPath)) {
    result.executionPath = parsed.executionPath.map((step: any) => ({
      title: truncate(step.title || "", 200),
      body: truncate(step.body || "", 400),
      insight: step.insight || "",
    }));
  }

  if (parsed.narrative && typeof parsed.narrative === "string") {
    result.narrative = parsed.narrative;
  }

  if (parsed.suggestedTake && typeof parsed.suggestedTake === "string") {
    result.suggestedTake = truncate(parsed.suggestedTake, 280);
  }

  if (parsed.context && typeof parsed.context === "string") {
    result.context = truncate(parsed.context, 200);
  }

  return result;
}

// ── Main summarization function ───────────────────────────────

export async function summarizeSession(
  analysis: SessionAnalysis,
  apiKey: string
): Promise<SessionSummary> {
  const client = getClient(apiKey);
  const compact = compactTurns(analysis);
  const compactJson = JSON.stringify(compact);

  // Check if this is small enough for a single call
  const estimatedTokens = estimateTokens(compactJson);
  console.log(`   Compact session: ~${estimatedTokens} tokens`);

  // If too large, chunk it
  const chunks: CompactTurn[][] = [];
  if (estimatedTokens > 30000) {
    const chunkSize = Math.ceil(compact.length / Math.ceil(estimatedTokens / 20000));
    for (let i = 0; i < compact.length; i += chunkSize) {
      chunks.push(compact.slice(i, i + chunkSize));
    }
  } else {
    chunks.push(compact);
  }

  // Summarize each chunk, then merge
  const chunkSummaries: string[] = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    if (chunks.length > 1) {
      console.log(`   Processing chunk ${ci + 1}/${chunks.length}...`);
    }

    const chunkInfo = chunks.length > 1
      ? `This is part ${ci + 1} of ${chunks.length} of the session.`
      : "";

    const prompt = buildSummarizationPrompt(
      analysis,
      JSON.stringify(chunks[ci]),
      chunkInfo,
    );

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    chunkSummaries.push(stripMarkdownFences(text));
  }

  // Parse and normalize the result
  let rawResult: any;
  if (chunkSummaries.length === 1) {
    rawResult = tryParseJson(chunkSummaries[0]);
  } else {
    // Merge multiple chunk summaries
    const mergeResponse = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2500,
      messages: [{ role: "user", content: buildMergePrompt(chunkSummaries) }],
    });

    const mergedText = mergeResponse.content[0].type === "text" ? mergeResponse.content[0].text : "";
    rawResult = tryParseJson(mergedText);
  }

  // Apply banned-word filter as post-processing safety net
  if (rawResult) {
    rawResult = stripBannedWords(rawResult);
  }

  // Pass 2: Fix beat turn indices with a focused second call
  if (rawResult?.beats && Array.isArray(rawResult.beats) && rawResult.beats.length > 0) {
    try {
      console.log("   Pass 2: Mapping beats to exact turns...");
      rawResult.beats = await mapBeatsToTurns(client, rawResult.beats, compact);
    } catch (err) {
      console.error("Beat mapping pass 2 failed, keeping original indices:", err);
    }
  }

  // Pass 3: Extract developer quotes and generate suggested take
  let developerQuotes: DeveloperQuote[] = [];
  let suggestedTake = "";

  try {
    console.log("   Pass 3: Extracting developer quotes...");
    developerQuotes = await extractDeveloperQuotes(client, compact);
  } catch (err) {
    console.error("Quote extraction failed:", err);
  }

  if (developerQuotes.length > 0) {
    try {
      console.log("   Pass 3: Generating suggested take...");
      const writingStyle = analyzeWritingStyle(compact);
      const beatsForTake = rawResult?.beats || [];
      const titleForTake = rawResult?.title || "";
      suggestedTake = await generateSuggestedTake(
        client,
        developerQuotes,
        writingStyle,
        beatsForTake,
        titleForTake,
      );
    } catch (err) {
      console.error("Suggested take generation failed:", err);
    }
  }

  // Build the SessionSummary with both v2 and legacy fields
  const result = normalizeToSessionSummary(rawResult, analysis, estimatedTokens);
  // Attach pass 3 results
  result.developerQuotes = developerQuotes;
  result.suggestedTake = suggestedTake || undefined;

  return result;
}

// ── Normalization ─────────────────────────────────────────────

/**
 * Normalize raw LLM output into a SessionSummary that has both v2 fields
 * (executionPath, patterns, context) and legacy fields (tutorialSteps,
 * beats, oneLineSummary) for backward compatibility.
 */
function normalizeToSessionSummary(
  parsed: any | null,
  analysis: SessionAnalysis,
  estimatedTokens: number,
): SessionSummary {
  if (!parsed) {
    return buildFallbackSummary(analysis, estimatedTokens);
  }

  // Extract v2 fields with validation
  const title = truncate(parsed.title || parsed.oneLineSummary || "Session analysis", 80);
  const context = truncate(parsed.context || "", 200);

  const executionPath: ExecutionStep[] = Array.isArray(parsed.executionPath)
    ? parsed.executionPath.map((step: any) => ({
        title: truncate(step.title || "", 200),
        body: truncate(step.body || step.description || "", 400),
        insight: step.insight || "",
      }))
    : [];

  const skills: string[] = Array.isArray(parsed.skills)
    ? parsed.skills
    : Array.isArray(parsed.extractedSkills)
      ? parsed.extractedSkills
      : [];

  const v2Highlights: SummaryHighlight[] = Array.isArray(parsed.highlights)
    ? parsed.highlights.map((h: any) => ({
        type: normalizeHighlightType(h.type),
        title: h.title || "",
        description: h.description || "",
      }))
    : [];

  const toolUsage: Record<string, { count: number }> = parsed.toolUsage
    || Object.fromEntries(
      Object.entries(analysis.toolUsage).map(([name, usage]) => [name, { count: (usage as any).count }])
    );

  const patterns: SessionPatterns = normalizePatterns(parsed.patterns);

  // Build legacy fields from v2 data for backward compatibility
  const tutorialSteps: TutorialStep[] = executionPath.map((step, i) => ({
    title: step.title,
    description: step.body,
    turnRange: `Step ${i + 1}`,
    keyTakeaway: step.insight,
  }));

  // Build beats from AI output (with real turnIndex), fall back to executionPath
  let beats: Beat[];

  const aiBeats = Array.isArray(parsed.beats) ? parsed.beats : [];
  const hasRealBeats = aiBeats.length > 0 && aiBeats.some(
    (b: any) => typeof b.turnIndex === "number" && b.turnIndex > 0
  );

  if (hasRealBeats) {
    // AI provided beats with real turn indices — use them directly
    const validTypes = new Set(["step", "correction", "insight", "win"]);
    beats = aiBeats
      .filter((b: any) => b.title && validTypes.has(b.type))
      .map((b: any) => ({
        type: b.type as Beat["type"],
        title: truncate(b.title || "", 80),
        description: truncate(b.description || "", 200),
        turnIndex: Math.max(0, Math.min(b.turnIndex, analysis.turns.length - 1)),
        time: "",
        direction: null,
        directionNote: null,
      }));
  } else {
    // Fallback: convert executionPath steps to beats (no real turn indices)
    beats = executionPath.map((step, i) => ({
      type: "step" as const,
      title: step.title,
      description: step.body,
      turnIndex: i,
      time: "",
      directionNote: step.insight || null,
    }));
  }

  const legacyHighlights: Highlight[] = v2Highlights.map((h, i) => ({
    type: h.type === "notable" ? "impressive" as const
      : h.type === "challenge" ? "frustrating" as const
      : "clever" as const,
    title: h.title,
    description: h.description,
    turnIndex: i,
  }));

  return {
    // v2 fields
    title,
    context,
    executionPath,
    skills,
    highlights: v2Highlights,
    toolUsage,
    totalTurns: analysis.turns.length,
    patterns,

    // Legacy fields
    narrative: parsed.narrative || "",
    oneLineSummary: title,
    tutorialSteps,
    efficiencyInsights: Array.isArray(parsed.efficiencyInsights) ? parsed.efficiencyInsights : [],
    turningPoints: Array.isArray(parsed.turningPoints) ? parsed.turningPoints : [],
    beats,
    extractedSkills: skills,
    tokensUsed: estimatedTokens,
  };
}

function normalizeHighlightType(type: string): "notable" | "insight" | "challenge" {
  if (type === "notable" || type === "impressive") return "notable";
  if (type === "challenge" || type === "frustrating") return "challenge";
  if (type === "insight" || type === "clever") return "insight";
  return "notable";
}

function normalizePatterns(raw: any): SessionPatterns {
  if (!raw || typeof raw !== "object") {
    return {
      constraintsSetUpfront: false,
      redirectionCount: 0,
      verificationSteps: 0,
      contextFilesLoaded: 0,
      scopeChanges: 0,
    };
  }
  return {
    constraintsSetUpfront: Boolean(raw.constraintsSetUpfront),
    redirectionCount: typeof raw.redirectionCount === "number" ? raw.redirectionCount : 0,
    verificationSteps: typeof raw.verificationSteps === "number" ? raw.verificationSteps : 0,
    contextFilesLoaded: typeof raw.contextFilesLoaded === "number" ? raw.contextFilesLoaded : 0,
    scopeChanges: typeof raw.scopeChanges === "number" ? raw.scopeChanges : 0,
  };
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

function buildFallbackSummary(analysis: SessionAnalysis, estimatedTokens: number): SessionSummary {
  const title = analysis.turns[0]?.userPrompt.slice(0, 80) || "Session analysis";
  return {
    title,
    context: "",
    executionPath: [],
    skills: [],
    highlights: [],
    toolUsage: Object.fromEntries(
      Object.entries(analysis.toolUsage).map(([name, usage]) => [name, { count: usage.count }])
    ),
    totalTurns: analysis.turns.length,
    patterns: {
      constraintsSetUpfront: false,
      redirectionCount: 0,
      verificationSteps: 0,
      contextFilesLoaded: 0,
      scopeChanges: 0,
    },
    narrative: "",
    oneLineSummary: title,
    tutorialSteps: [],
    efficiencyInsights: [],
    turningPoints: [],
    beats: [],
    extractedSkills: [],
    tokensUsed: estimatedTokens,
  };
}

// Re-export for testing
export { stripBannedWords, normalizeToSessionSummary, normalizePatterns, truncate, tryParseJson, compactTurns, analyzeWritingStyle, buildQuestionContext, cleanPrompt, isHumanPrompt, BANNED_WORDS };
