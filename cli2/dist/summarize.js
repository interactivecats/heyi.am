import Anthropic from '@anthropic-ai/sdk';
// ── Banned words (anti-fluff enforcement) ────────────────────
const BANNED_WORDS = ['leverage', 'utilize', 'streamline', 'enhance', 'robust', 'seamless'];
const BANNED_PATTERN = new RegExp(`\\b(${BANNED_WORDS.join('|')})\\b`, 'gi');
export function containsBannedWords(text) {
    const matches = text.match(BANNED_PATTERN);
    return matches ? [...new Set(matches.map((m) => m.toLowerCase()))] : [];
}
export function stripBannedWords(text) {
    return text.replace(BANNED_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}
// ── Signal-weighted sampling ─────────────────────────────────
const SELF_CORRECTION_PATTERN = /\?|actually|wait|no,|wrong/i;
const PASS_THROUGH_THRESHOLD = 50;
// Slot allocation per third: [promptSlots, logSlots]
const THIRD_SLOTS = [
    [4, 10], // beginning
    [8, 16], // middle
    [8, 14], // end
];
export function scoreTurn(turn, allTurns, idx) {
    let score = 0;
    if (turn.type === 'prompt')
        score += 1;
    if (turn.type === 'error')
        score += 1;
    if (SELF_CORRECTION_PATTERN.test(turn.content))
        score += 1;
    if (turn.content.length > 200)
        score += 1;
    if (idx > 0 && allTurns[idx - 1].type === 'error')
        score += 1;
    return score;
}
function selectTopN(items, scores, n) {
    if (items.length <= n)
        return items;
    const indexed = items.map((item, i) => ({ item, score: scores[i], idx: i }));
    indexed.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const selected = indexed.slice(0, n);
    selected.sort((a, b) => a.idx - b.idx);
    return selected.map((s) => s.item);
}
export function sampleSession(session) {
    const timeline = session.turnTimeline;
    const rawLog = session.rawLog;
    const total = timeline.length;
    if (total <= PASS_THROUGH_THRESHOLD) {
        return {
            turns: timeline,
            log: rawLog,
            sampled: false,
            totalTurns: total,
            selectedTurns: total,
        };
    }
    const scores = timeline.map((turn, idx) => scoreTurn(turn, timeline, idx));
    const thirdSize = Math.floor(total / 3);
    const thirds = [
        [0, thirdSize],
        [thirdSize, 2 * thirdSize],
        [2 * thirdSize, total],
    ];
    const selectedTurns = [];
    for (let t = 0; t < 3; t++) {
        const [start, end] = thirds[t];
        const [promptSlots, _logSlots] = THIRD_SLOTS[t];
        const thirdTurns = timeline.slice(start, end);
        const thirdScores = scores.slice(start, end);
        const chosen = selectTopN(thirdTurns, thirdScores, promptSlots);
        const chosenWithIdx = chosen.map((turn) => {
            const origIdx = start + thirdTurns.indexOf(turn);
            return { ...turn, _originalIdx: origIdx };
        });
        selectedTurns.push(...chosenWithIdx);
    }
    // Re-sort by original position (chronological)
    selectedTurns.sort((a, b) => a._originalIdx - b._originalIdx);
    const annotatedTurns = selectedTurns.map((t) => ({
        timestamp: t.timestamp,
        type: t.type,
        content: `[T${t._originalIdx + 1}/${total}] ${t.content}`,
    }));
    // Sample raw log with same three-thirds approach using log slots
    const logTotal = rawLog.length;
    const logThirdSize = Math.floor(logTotal / 3);
    const logThirds = [
        [0, logThirdSize],
        [logThirdSize, 2 * logThirdSize],
        [2 * logThirdSize, logTotal],
    ];
    const selectedLogLines = [];
    for (let t = 0; t < 3; t++) {
        const [start, end] = logThirds[t];
        const [_promptSlots, logSlots] = THIRD_SLOTS[t];
        const chunk = rawLog.slice(start, end);
        // For raw log, score by line length as a rough signal proxy
        const chunkScores = chunk.map((line) => line.length);
        const chosen = selectTopN(chunk, chunkScores, logSlots);
        chosen.forEach((line) => {
            const origIdx = start + chunk.indexOf(line);
            selectedLogLines.push({ line, origIdx });
        });
    }
    selectedLogLines.sort((a, b) => a.origIdx - b.origIdx);
    const annotatedLog = selectedLogLines.map(({ line, origIdx }) => `[T${origIdx + 1}/${logTotal}] ${line}`);
    return {
        turns: annotatedTurns,
        log: annotatedLog,
        sampled: true,
        totalTurns: total,
        selectedTurns: annotatedTurns.length,
    };
}
// ── Prompt construction ──────────────────────────────────────
function buildSystemPrompt() {
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
function buildUserPrompt(session) {
    const parts = [];
    const sampling = sampleSession(session);
    parts.push(`Session: ${session.title}`);
    parts.push(`Project: ${session.projectName}`);
    parts.push(`Duration: ${session.durationMinutes} min, ${session.turns} turns, ${session.linesOfCode} LOC changed`);
    if (sampling.sampled) {
        parts.push(`[SAMPLED: ${sampling.selectedTurns} of ${sampling.totalTurns} turns shown, distributed beginning/middle/end, high-signal moments prioritized. T{n}/${sampling.totalTurns} = position in full session.]`);
    }
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
    if (sampling.turns.length > 0) {
        // Include developer prompts from sampled turns — these are the decisions and corrections
        const devPrompts = sampling.turns.filter((t) => t.type === 'prompt');
        if (devPrompts.length > 0) {
            parts.push('Developer prompts (decisions & corrections):');
            for (const p of devPrompts) {
                parts.push(`  [${p.timestamp}] ${p.content}`);
            }
        }
    }
    if (sampling.log.length > 0) {
        parts.push(`Raw log excerpt:\n${sampling.log.join('\n')}`);
    }
    return parts.join('\n');
}
export async function summarizeSession(session, options = {}) {
    const client = options.client ?? new Anthropic();
    const model = options.model ?? 'claude-sonnet-4-6';
    const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(session) }],
    });
    const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
    return parseEnhancementResult(text);
}
// ── Streaming enhancement ────────────────────────────────────
export async function* summarizeSessionStream(session, options = {}) {
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
    }
    catch (err) {
        yield { type: 'error', data: err.message };
    }
}
// ── SSE helper for Express ───────────────────────────────────
export function createSSEHandler(session, options = {}) {
    return async (_req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        let closed = false;
        _req.on('close', () => { closed = true; });
        for await (const event of summarizeSessionStream(session, options)) {
            if (closed)
                break;
            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
        }
        if (!closed) {
            res.end();
        }
    };
}
// ── JSON parsing with validation ─────────────────────────────
export function parseEnhancementResult(raw) {
    // Extract JSON from potential markdown code fences
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw];
    const jsonStr = jsonMatch[1].trim();
    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    }
    catch {
        throw new Error(`Failed to parse AI response as JSON: ${jsonStr.slice(0, 200)}`);
    }
    const title = enforceMaxLength(String(parsed.title ?? ''), 80);
    const context = enforceMaxLength(String(parsed.context ?? ''), 200);
    const developerTake = enforceMaxLength(String(parsed.developerTake ?? ''), 300);
    // Validate and enforce constraints
    const skills = Array.isArray(parsed.skills)
        ? parsed.skills.filter((s) => typeof s === 'string')
        : [];
    const questions = Array.isArray(parsed.questions)
        ? parsed.questions
            .filter((q) => q.text && q.suggestedAnswer)
            .slice(0, 3)
            .map((q) => ({
            text: stripBannedWords(String(q.text)),
            suggestedAnswer: stripBannedWords(String(q.suggestedAnswer)),
        }))
        : [];
    const executionSteps = Array.isArray(parsed.executionSteps)
        ? parsed.executionSteps
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
function enforceMaxLength(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
function enforceWordLimit(str, maxWords) {
    const words = str.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords)
        return str;
    return words.slice(0, maxWords).join(' ') + '…';
}
// ── Exports for testing ──────────────────────────────────────
export { buildSystemPrompt as _buildSystemPrompt, buildUserPrompt as _buildUserPrompt };
// scoreTurn and sampleSession are already exported above
//# sourceMappingURL=summarize.js.map