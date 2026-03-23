import { cleanAssistantText } from "./bridge.js";
// ─── Regex Patterns ──────────────────────────────────────────────────────
/**
 * Expletives: word-boundary-guarded to avoid false positives like
 * "class", "assembly", "shell", "bassist", "grass".
 */
const EXPLETIVE_RE = /\b(?:shit(?:ty)?|bullshit|fuck(?:ing|ed|s)?|damn(?:it)?|dammit|wtf|wth|ffs|crap(?:py)?|asshole|(?<!cl|gr|b|h|br)ass(?!ign|ert|et|oc|ume|ist|embl)|hell(?!o))\b/gi;
/**
 * Corrections: only match at the START of a user turn (after an AI turn).
 * Multi-word patterns to reduce false positives.
 */
const CORRECTION_START_RE = /^(?:no[,.\s!]|no$|stop[,.\s!]|stop$|actually[,.\s!]|wait[,.\s!])/i;
const CORRECTION_PHRASE_RE = /\b(?:that'?s (?:wrong|not (?:right|what|correct))|not what I (?:asked|meant|wanted)|undo (?:that|this|it)|revert (?:that|this|it)|go back|I said\b|I meant\b|don'?t do that|wrong (?:file|approach|direction))\b/i;
/**
 * Please/thanks: whole words only, user turns only.
 */
const POLITE_RE = /\b(?:please|thank (?:you|u)|thanks|thx)\b/i;
/**
 * Reasoning: prefer multi-word patterns. "because" only at sentence start.
 */
const REASONING_RE = /(?:^|\.\s+)because\b|\b(?:because I|the trade-?off|instead of|my approach|I think|the reason|I'?d rather|the downside|pros and cons|weigh(?:ing)? the)\b/i;
/**
 * Test run detection: Bash tool calls containing test commands.
 */
const TEST_CMD_RE = /\b(?:npm\s+test|npx\s+(?:vitest|jest)|pytest|mix\s+test|cargo\s+test|go\s+test|make\s+test|bun\s+test|yarn\s+test)\b|^test$/i;
/**
 * Scope creep: multi-word patterns only to avoid false positives
 * from "also" appearing naturally in technical discussion.
 */
const SCOPE_CREEP_RE = /\b(?:while (?:we'?re|you'?re|I'?m) at it|one more thing|before I forget|actually (?:can you also|also)|wait,? also|oh (?:and|also))\b|^also[,.:!\s]/i;
/**
 * Apologies: AI turns containing apology phrases.
 */
const APOLOGY_RE = /\b(?:sorry|apologi[zs]e|apologies|my (?:mistake|bad|apologies))\b/i;
/**
 * Secret leaks: API keys, tokens, connection strings pasted into prompts.
 * Each pattern is specific to avoid false positives on code discussion.
 */
const SECRET_LEAK_RE = /(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{40,}|AKIA[0-9A-Z]{16}|AIzaSy[a-zA-Z0-9_-]{33}|xox[bpoas]-[a-zA-Z0-9-]+|Bearer\s+[a-zA-Z0-9._\-]{20,}|(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s]{10,}|-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)/;
/**
 * Interruptions: user cancelled the AI mid-response.
 */
const INTERRUPT_RE = /\[Request interrupted by user(?:\s+for tool use)?\]/;
/**
 * AI self-correction signals: the AI realizes it made a mistake.
 */
const AI_ADMISSION_RE = /\b(?:let me fix|let me correct|that'?s (?:wrong|not right|incorrect|not correct)|I (?:made a|my) mistake|I should have|oops|that was wrong|actually,? (?:that|this) (?:is|was) wrong|sorry,? (?:that|let me))\b/i;
/**
 * Question detection: trim trailing whitespace then check for `?`
 */
function endsWithQuestion(text) {
    return text.trimEnd().endsWith("?");
}
/**
 * Word count: split on whitespace, filter empties.
 */
function wordCount(text) {
    return text.split(/\s+/).filter(Boolean).length;
}
// ─── Helper: extract user text from a RawEntry ───────────────────────────
function getUserText(entry) {
    if (entry.type !== "user")
        return null;
    const content = entry.message?.content;
    if (typeof content === "string") {
        const cleaned = cleanAssistantText(content);
        return cleaned || null;
    }
    if (Array.isArray(content)) {
        const texts = content
            .filter((b) => b.type === "text" && typeof b.text === "string")
            .map((b) => cleanAssistantText(b.text))
            .filter(Boolean);
        // Skip entries that are only tool_result blocks (not real user messages)
        if (texts.length === 0)
            return null;
        return texts.join("\n");
    }
    return null;
}
function getAssistantText(entry) {
    if (entry.type !== "assistant")
        return null;
    const content = entry.message?.content;
    if (typeof content === "string") {
        return cleanAssistantText(content) || null;
    }
    if (Array.isArray(content)) {
        const texts = content
            .filter((b) => b.type === "text")
            .map((b) => cleanAssistantText(b.text))
            .filter(Boolean);
        return texts.length > 0 ? texts.join("\n") : null;
    }
    return null;
}
function isToolUseBlock(block) {
    return block.type === "tool_use";
}
function getToolUseBlocks(entry) {
    if (entry.type !== "assistant")
        return [];
    const content = entry.message?.content;
    if (!content || typeof content === "string")
        return [];
    return content.filter(isToolUseBlock);
}
function hasToolUse(entry) {
    return getToolUseBlocks(entry).length > 0;
}
/** Extract ALL text from an entry — text blocks, tool_result content, tool_use input.
 *  Used for secret detection where we need to scan everything, not just user text. */
function getAllText(entry) {
    const content = entry.message?.content;
    if (typeof content === "string")
        return content;
    if (!Array.isArray(content))
        return "";
    const parts = [];
    for (const block of content) {
        if (block.type === "text" && typeof block.text === "string")
            parts.push(block.text);
        if (block.type === "tool_result") {
            if (typeof block.content === "string")
                parts.push(block.content);
            if (Array.isArray(block.content)) {
                for (const sub of block.content) {
                    if (sub.type === "text" && typeof sub.text === "string")
                        parts.push(sub.text);
                }
            }
        }
        if (block.type === "tool_use" && block.input) {
            // Scan tool inputs (e.g., Write tool writing a .env file)
            const inputStr = typeof block.input === "string" ? block.input : JSON.stringify(block.input);
            parts.push(inputStr);
        }
    }
    return parts.join("\n");
}
// ─── Helper: check tool_result for errors ────────────────────────────────
function toolResultHasError(entry) {
    if (entry.type !== "user")
        return false;
    const content = entry.message?.content;
    if (!Array.isArray(content))
        return false;
    for (const block of content) {
        const b = block;
        if (b.type === "tool_result") {
            const resultContent = b.content;
            const text = typeof resultContent === "string"
                ? resultContent
                : JSON.stringify(resultContent ?? "");
            if (/\b(?:error|Error|FAILED|failed|FAIL|ERR|exception|Exception)\b/.test(text)) {
                return true;
            }
        }
    }
    return false;
}
// ─── Hour/day helpers ────────────────────────────────────────────────────
function isLateNight(timestamp) {
    const d = new Date(timestamp);
    const hour = d.getHours();
    return hour >= 22 || hour < 4;
}
function isWeekend(timestamp) {
    const d = new Date(timestamp);
    const day = d.getDay();
    return day === 0 || day === 6;
}
// ─── Main computation ────────────────────────────────────────────────────
export function computeVibeStats(sessions) {
    // Accumulators
    let expletives = 0;
    let corrections = 0;
    let politeUserTurns = 0;
    let totalUserTurns = 0;
    let totalUserWords = 0;
    let longestPromptWords = 0;
    let questionUserTurns = 0;
    let oneWordTurns = 0;
    let reasoningTurns = 0;
    let lateNightTurns = 0;
    let weekendTurns = 0;
    let apologies = 0;
    let readOps = 0;
    let writeOps = 0;
    let testRuns = 0;
    let failedTests = 0;
    let longestToolChain = 0;
    let selfCorrections = 0;
    let bashCommands = 0;
    let overrideSuccesses = 0;
    let overrideAttempts = 0;
    let longestAutopilot = 0;
    const firstBloodTimes = [];
    let scopeCreep = 0;
    let interruptions = 0;
    let secretLeaksUser = 0;
    let secretLeaksAi = 0;
    let planModeUses = 0;
    let agentSpawns = 0;
    const activeDays = new Set(); // track unique days for avg daily hours
    let totalTurns = 0;
    let totalDurationMin = 0;
    const sourcesSet = new Set();
    const sourceCount = {};
    for (const session of sessions) {
        const { analysis } = session;
        const entries = analysis.raw_entries;
        sourcesSet.add(analysis.source);
        sourceCount[analysis.source] = (sourceCount[analysis.source] ?? 0) + 1;
        totalTurns += analysis.turns;
        totalDurationMin += analysis.duration_ms > 0
            ? Math.max(1, Math.round(analysis.duration_ms / 60_000))
            : 0;
        // Track previous entry type for correction detection
        let prevEntryHadToolUse = false;
        let prevEntryWasAssistant = false;
        let currentToolChain = 0;
        let currentAutopilot = 0;
        let sessionFirstCorrectionTime = null;
        const sessionStartTime = analysis.start_time ? new Date(analysis.start_time).getTime() : null;
        // Track files edited per assistant "run" for self-corrections
        const filesEditedInRun = new Set();
        let aiAdmittedMistakeInRun = false;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            // ── Secret detection (all entry types) ──
            const allText = getAllText(entry);
            if (allText && SECRET_LEAK_RE.test(allText)) {
                if (entry.type === "user")
                    secretLeaksUser++;
                else if (entry.type === "assistant")
                    secretLeaksAi++;
            }
            // ── User turn stats ──
            const userText = getUserText(entry);
            if (userText !== null) {
                totalUserTurns++;
                // Expletives
                const expMatches = userText.match(EXPLETIVE_RE);
                if (expMatches)
                    expletives += expMatches.length;
                // Corrections: user turn after an assistant turn that had tool_use
                if (prevEntryWasAssistant) {
                    const isCorrection = CORRECTION_START_RE.test(userText) ||
                        CORRECTION_PHRASE_RE.test(userText);
                    if (isCorrection) {
                        corrections++;
                        overrideAttempts++;
                        // Track first correction time per session
                        if (sessionFirstCorrectionTime === null && sessionStartTime !== null) {
                            const entryTime = new Date(entry.timestamp).getTime();
                            sessionFirstCorrectionTime = (entryTime - sessionStartTime) / 60_000;
                        }
                        // Check override success: look at next 3 assistant responses
                        // for tool_result entries with error content
                        let foundError = false;
                        let checked = 0;
                        for (let j = i + 1; j < entries.length && checked < 3; j++) {
                            if (entries[j].type === "user") {
                                // Check tool_result blocks in user entries (tool responses)
                                if (toolResultHasError(entries[j])) {
                                    foundError = true;
                                    break;
                                }
                                // If this is a real user message (not tool_result), stop
                                const nextUserText = getUserText(entries[j]);
                                if (nextUserText !== null)
                                    break;
                            }
                            if (entries[j].type === "assistant") {
                                checked++;
                            }
                        }
                        if (!foundError)
                            overrideSuccesses++;
                    }
                }
                // Polite
                if (POLITE_RE.test(userText))
                    politeUserTurns++;
                // Word count
                const wc = wordCount(userText);
                totalUserWords += wc;
                if (wc > longestPromptWords)
                    longestPromptWords = wc;
                // Question
                if (endsWithQuestion(userText))
                    questionUserTurns++;
                // One-word turns (1-3 words)
                if (wc >= 1 && wc <= 3)
                    oneWordTurns++;
                // Reasoning
                if (REASONING_RE.test(userText))
                    reasoningTurns++;
                // Late night
                if (isLateNight(entry.timestamp))
                    lateNightTurns++;
                // Track active days for daily hours calculation
                if (entry.timestamp) {
                    try {
                        activeDays.add(new Date(entry.timestamp).toISOString().slice(0, 10));
                    }
                    catch { }
                }
                // Weekend
                if (isWeekend(entry.timestamp))
                    weekendTurns++;
                // Scope creep
                if (SCOPE_CREEP_RE.test(userText))
                    scopeCreep++;
                // Secret leaks — checked separately below for ALL entry types
                // Interruptions
                if (INTERRUPT_RE.test(userText))
                    interruptions++;
                // Reset autopilot and tool chain on user turn
                if (currentAutopilot > longestAutopilot)
                    longestAutopilot = currentAutopilot;
                currentAutopilot = 0;
                if (currentToolChain > longestToolChain)
                    longestToolChain = currentToolChain;
                currentToolChain = 0;
                filesEditedInRun.clear();
                aiAdmittedMistakeInRun = false;
                prevEntryHadToolUse = false;
                prevEntryWasAssistant = false;
            }
            // ── Assistant turn stats ──
            if (entry.type === "assistant") {
                currentAutopilot++;
                const assistantText = getAssistantText(entry);
                if (assistantText) {
                    if (APOLOGY_RE.test(assistantText))
                        apologies++;
                    if (AI_ADMISSION_RE.test(assistantText))
                        aiAdmittedMistakeInRun = true;
                }
                const toolBlocks = getToolUseBlocks(entry);
                for (const tool of toolBlocks) {
                    currentToolChain++;
                    // Read/write ratio
                    if (["Read", "Grep", "Glob"].includes(tool.name))
                        readOps++;
                    if (["Edit", "Write"].includes(tool.name))
                        writeOps++;
                    // Bash commands
                    if (tool.name === "Bash") {
                        bashCommands++;
                        const cmd = typeof tool.input.command === "string" ? tool.input.command : "";
                        if (TEST_CMD_RE.test(cmd)) {
                            testRuns++;
                            // Check the tool_result for this specific call
                            // Look ahead for the next user entry with tool_result
                            for (let j = i + 1; j < entries.length; j++) {
                                if (entries[j].type === "user") {
                                    if (toolResultHasError(entries[j]))
                                        failedTests++;
                                    break;
                                }
                                if (entries[j].type === "assistant")
                                    break;
                            }
                        }
                    }
                    // Plan mode and agent spawns
                    if (tool.name === "EnterPlanMode")
                        planModeUses++;
                    if (tool.name === "Agent")
                        agentSpawns++;
                    // Self-corrections: same file edited again AND there's a signal
                    // the AI knows it messed up (error in tool result, or admission in text)
                    if (tool.name === "Edit" || tool.name === "Write") {
                        const filePath = typeof tool.input.file_path === "string" ? tool.input.file_path : null;
                        if (filePath) {
                            if (filesEditedInRun.has(filePath) && aiAdmittedMistakeInRun) {
                                selfCorrections++;
                            }
                            filesEditedInRun.add(filePath);
                        }
                    }
                }
                prevEntryHadToolUse = toolBlocks.length > 0;
                prevEntryWasAssistant = true;
            }
        }
        // Finalize per-session maximums
        if (currentAutopilot > longestAutopilot)
            longestAutopilot = currentAutopilot;
        if (currentToolChain > longestToolChain)
            longestToolChain = currentToolChain;
        // First blood
        if (sessionFirstCorrectionTime !== null) {
            firstBloodTimes.push(sessionFirstCorrectionTime);
        }
    }
    // ── Derived stats ──
    const pleaseRate = totalUserTurns > 0 ? politeUserTurns / totalUserTurns : 0;
    const avgPromptWords = totalUserTurns > 0 ? Math.round(totalUserWords / totalUserTurns) : 0;
    const questionRate = totalUserTurns > 0 ? questionUserTurns / totalUserTurns : 0;
    const oneWordTurnRate = totalUserTurns > 0 ? oneWordTurns / totalUserTurns : 0;
    const reasoningRate = totalUserTurns > 0 ? reasoningTurns / totalUserTurns : 0;
    const lateNightRate = totalUserTurns > 0 ? lateNightTurns / totalUserTurns : 0;
    const weekendRate = totalUserTurns > 0 ? weekendTurns / totalUserTurns : 0;
    const readWriteRatio = writeOps > 0 ? readOps / writeOps : readOps > 0 ? readOps : 0;
    const overrideSuccessRate = overrideAttempts > 0 ? overrideSuccesses / overrideAttempts : 0;
    const turnDensity = totalDurationMin > 0 ? totalTurns / totalDurationMin : 0;
    const redirectsPerHour = totalDurationMin > 0 ? (corrections / totalDurationMin) * 60 : 0;
    // First blood: median of per-session first correction times
    let firstBloodMin = 0;
    if (firstBloodTimes.length > 0) {
        const sorted = [...firstBloodTimes].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        firstBloodMin = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }
    return {
        expletives,
        corrections,
        please_rate: round2(pleaseRate),
        avg_prompt_words: avgPromptWords,
        longest_prompt_words: longestPromptWords,
        question_rate: round2(questionRate),
        one_word_turn_rate: round2(oneWordTurnRate),
        reasoning_rate: round2(reasoningRate),
        late_night_rate: round2(lateNightRate),
        weekend_rate: round2(weekendRate),
        apologies,
        read_write_ratio: round1(readWriteRatio),
        test_runs: testRuns,
        failed_tests: failedTests,
        longest_tool_chain: longestToolChain,
        self_corrections: selfCorrections,
        bash_commands: bashCommands,
        override_success_rate: round2(overrideSuccessRate),
        longest_autopilot: longestAutopilot,
        first_blood_min: round1(firstBloodMin),
        redirects_per_hour: round1(redirectsPerHour),
        turn_density: round1(turnDensity),
        scope_creep: scopeCreep,
        interruptions,
        secret_leaks_user: secretLeaksUser,
        secret_leaks_ai: secretLeaksAi,
        plan_mode_uses: planModeUses,
        agent_spawns: agentSpawns,
        avg_daily_hours: activeDays.size > 0 ? round1(totalDurationMin / 60 / activeDays.size) : 0,
        total_turns: totalTurns,
        session_count: sessions.length,
        total_duration_min: totalDurationMin,
        sources: [...sourcesSet],
        source_breakdown: sourceCount,
    };
}
function round1(n) {
    return Math.round(n * 10) / 10;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
// ─── Exported regex patterns for testing ─────────────────────────────────
export const _patterns = {
    EXPLETIVE_RE,
    CORRECTION_START_RE,
    CORRECTION_PHRASE_RE,
    POLITE_RE,
    REASONING_RE,
    TEST_CMD_RE,
    SCOPE_CREEP_RE,
    APOLOGY_RE,
    SECRET_LEAK_RE,
    INTERRUPT_RE,
    AI_ADMISSION_RE,
};
//# sourceMappingURL=stats.js.map