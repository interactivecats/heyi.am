import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { IDLE_THRESHOLD_MS, } from "./types.js";
// -- Parsing --
function parseLines(raw) {
    const lines = [];
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            lines.push(JSON.parse(trimmed));
        }
        catch {
            // skip malformed
        }
    }
    return lines;
}
function getSessionMeta(lines) {
    for (const line of lines) {
        if (line.type === "session_meta") {
            return line.payload;
        }
    }
    return null;
}
const TOOL_NAME_MAP = {
    exec_command: "Bash",
    apply_patch: "Edit",
};
function extractToolCalls(lines) {
    const calls = [];
    for (const line of lines) {
        if (line.type !== "response_item")
            continue;
        const p = line.payload;
        if (p.type === "function_call") {
            const fc = p;
            let input = {};
            try {
                input = JSON.parse(fc.arguments);
            }
            catch { /* raw string arg like apply_patch */ }
            const name = TOOL_NAME_MAP[fc.name] ?? fc.name;
            calls.push({ id: fc.call_id, name, input });
        }
        else if (p.type === "custom_tool_call") {
            const ct = p;
            const name = TOOL_NAME_MAP[ct.name] ?? ct.name;
            calls.push({ id: ct.call_id, name, input: { patch: ct.input } });
        }
    }
    return calls;
}
function extractFilesTouched(toolCalls) {
    const files = new Set();
    for (const call of toolCalls) {
        if (call.name === "Bash") {
            const cmd = call.input.cmd;
            const workdir = call.input.workdir;
            if (workdir)
                files.add(workdir);
            if (cmd) {
                const pathMatches = cmd.match(/(?:cat|sed\s+-n\s+'[^']*'\s+|nl\s+|wc\s+-l\s+)(\S+)/g);
                if (pathMatches) {
                    for (const m of pathMatches) {
                        const parts = m.split(/\s+/);
                        const filePath = parts[parts.length - 1];
                        if (filePath && !filePath.startsWith("-"))
                            files.add(filePath);
                    }
                }
            }
        }
        else if (call.name === "Edit") {
            const patch = call.input.patch;
            if (patch) {
                const fileMatches = patch.matchAll(/\*\*\* (?:Update|Add|Delete) File: (.+)/g);
                for (const m of fileMatches) {
                    files.add(m[1]);
                }
            }
        }
    }
    return [...files].sort();
}
function countTurns(lines) {
    let turns = 0;
    for (const line of lines) {
        if (line.type === "event_msg") {
            const p = line.payload;
            if (p.type === "task_started")
                turns++;
        }
    }
    return Math.max(turns, 1);
}
function computeDuration(lines) {
    const timestamps = [];
    let startStr = null;
    let endStr = null;
    for (const line of lines) {
        if (!line.timestamp)
            continue;
        if (!startStr)
            startStr = line.timestamp;
        endStr = line.timestamp;
        timestamps.push(new Date(line.timestamp).getTime());
    }
    if (timestamps.length < 2 || !startStr || !endStr) {
        return { duration_ms: 0, wall_clock_ms: 0, start_time: startStr, end_time: endStr };
    }
    const wallClock = timestamps[timestamps.length - 1] - timestamps[0];
    let activeMs = 0;
    for (let i = 1; i < timestamps.length; i++) {
        const gap = timestamps[i] - timestamps[i - 1];
        if (gap < IDLE_THRESHOLD_MS)
            activeMs += gap;
    }
    return {
        duration_ms: Math.max(activeMs, 0),
        wall_clock_ms: Math.max(wallClock, 0),
        start_time: startStr,
        end_time: endStr,
    };
}
function computeLocStats(toolCalls) {
    let totalAdded = 0;
    let totalRemoved = 0;
    const filesChanged = new Set();
    for (const call of toolCalls) {
        if (call.name !== "Edit")
            continue;
        const patch = call.input.patch;
        if (!patch)
            continue;
        const fileMatches = patch.matchAll(/\*\*\* (?:Update|Add|Delete) File: (.+)/g);
        for (const m of fileMatches) {
            filesChanged.add(m[1]);
        }
        for (const line of patch.split("\n")) {
            if (line.startsWith("+") && !line.startsWith("+++"))
                totalAdded++;
            if (line.startsWith("-") && !line.startsWith("---"))
                totalRemoved++;
        }
    }
    return {
        loc_added: totalAdded,
        loc_removed: totalRemoved,
        loc_net: totalAdded - totalRemoved,
        files_changed: [...filesChanged].sort(),
    };
}
function toRawEntries(lines, sessionId, cwd) {
    return lines.map((line, i) => {
        const p = line.payload;
        let entryType = "system";
        let message;
        if (line.type === "response_item" && p.type === "message") {
            const mp = p;
            entryType = mp.role === "user" ? "user" : mp.role === "assistant" ? "assistant" : "system";
            const textContent = mp.content
                ?.filter((b) => b.type === "input_text" || b.type === "output_text")
                .map((b) => b.text ?? "")
                .join("\n");
            message = { role: mp.role, content: textContent || undefined };
        }
        else if (line.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call")) {
            entryType = "assistant";
        }
        else if (line.type === "event_msg" && p.type === "user_message") {
            entryType = "user";
            message = { role: "user", content: p.message };
        }
        else if (line.type === "event_msg" && p.type === "agent_message") {
            entryType = "assistant";
            message = { role: "assistant", content: p.message };
        }
        else if (line.type === "session_meta") {
            entryType = "system";
        }
        return {
            type: entryType,
            uuid: `codex-${sessionId}-${i}`,
            timestamp: line.timestamp,
            sessionId,
            message,
            cwd,
        };
    });
}
// -- Parser interface --
async function detect(path) {
    if (!path.endsWith(".jsonl"))
        return false;
    try {
        const raw = await readFile(path, "utf-8");
        const firstLine = raw.split("\n")[0];
        if (!firstLine)
            return false;
        const entry = JSON.parse(firstLine);
        if (entry.type !== "session_meta")
            return false;
        const payload = entry.payload;
        return !!(payload?.cwd && (payload?.cli_version || payload?.originator));
    }
    catch {
        return false;
    }
}
async function parse(path) {
    const raw = await readFile(path, "utf-8");
    const lines = parseLines(raw);
    const meta = getSessionMeta(lines);
    const sessionId = meta?.id ?? "unknown";
    const cwd = meta?.cwd;
    const toolCalls = extractToolCalls(lines);
    const filesTouched = extractFilesTouched(toolCalls);
    const turns = countTurns(lines);
    const { duration_ms, wall_clock_ms, start_time, end_time } = computeDuration(lines);
    const loc_stats = computeLocStats(toolCalls);
    const raw_entries = toRawEntries(lines, sessionId, cwd);
    return {
        source: "codex",
        turns,
        tool_calls: toolCalls,
        files_touched: filesTouched,
        duration_ms,
        wall_clock_ms,
        loc_stats,
        raw_entries,
        start_time,
        end_time,
        cwd,
    };
}
export const codexParser = {
    name: "codex",
    detect,
    parse,
};
async function readFirstLine(filePath) {
    try {
        const raw = await readFile(filePath, "utf-8");
        const nl = raw.indexOf("\n");
        return nl === -1 ? raw : raw.slice(0, nl);
    }
    catch {
        return null;
    }
}
async function walkDir(dir, pattern, results) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            await walkDir(full, pattern, results);
        }
        else if (pattern.test(entry.name)) {
            results.push(full);
        }
    }
}
export async function discoverCodexSessions() {
    const sessionsDir = join(homedir(), ".codex", "sessions");
    const files = [];
    await walkDir(sessionsDir, /^rollout-.*\.jsonl$/, files);
    const results = [];
    for (const filePath of files) {
        const firstLine = await readFirstLine(filePath);
        if (!firstLine)
            continue;
        try {
            const entry = JSON.parse(firstLine);
            if (entry.type !== "session_meta" || !entry.payload?.cwd || !entry.payload?.id)
                continue;
            results.push({
                path: filePath,
                sessionId: entry.payload.id,
                cwd: entry.payload.cwd,
            });
        }
        catch {
            continue;
        }
    }
    return results;
}
//# sourceMappingURL=codex.js.map