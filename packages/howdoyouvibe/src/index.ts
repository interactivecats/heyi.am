#!/usr/bin/env node

import { listSessions, parseSession } from "./parsers/index.js";
import type { ParsedSession } from "./types.js";
import { computeVibeStats } from "./stats.js";
import { matchArchetype } from "./archetypes.js";
import { fetchNarrative } from "./narrative.js";
import { renderCard, formatTextBlock, copyToClipboard, promptYesNo } from "./render.js";
import { shareVibe } from "./share.js";
import { execFile } from "node:child_process";
import { platform } from "node:os";

function openUrl(url: string): void {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", url] : [url];
  execFile(cmd, args, () => {}); // fire-and-forget
}

// ─── Discover and parse all sessions ─────────────────────────────────────

async function discoverAndParse(): Promise<ParsedSession[]> {
  const metas = await listSessions();

  if (metas.length === 0) {
    console.log("  No AI coding sessions found.");
    console.log("  Supports: Claude Code, Cursor, Codex, Gemini CLI");
    process.exit(0);
  }

  // Filter to non-subagent sessions only
  const topLevel = metas.filter((m) => !m.isSubagent);
  console.log(`  Scanning ${topLevel.length} sessions...`);

  const sessions: ParsedSession[] = [];
  let skipped = 0;

  for (const meta of topLevel) {
    try {
      const analysis = await parseSession(meta.path);
      // Skip sessions with no meaningful turns
      if (analysis.turns < 1) continue;
      sessions.push({ analysis, source: analysis.source });
    } catch {
      skipped++;
    }
  }

  if (skipped > 0) {
    console.log(`  (${skipped} sessions skipped due to parse errors)`);
  }

  return sessions;
}

// ─── Main ────────────────────────────────────────────────────────────────

const sessions = await discoverAndParse();

if (sessions.length === 0) {
  console.log("  No sessions with meaningful content found.");
  process.exit(0);
}

const stats = computeVibeStats(sessions);
const match = matchArchetype(stats);
const narrative = await fetchNarrative(stats, match);

renderCard(stats, match, narrative);

// Interactive share flow (skip if not a TTY, e.g. piped output)
if (process.stdin.isTTY) {
  const wantsCopy = await promptYesNo("  Copy to clipboard?");
  if (wantsCopy) {
    const text = formatTextBlock(stats, match, narrative);
    const ok = copyToClipboard(text);
    console.log(ok ? "  Copied!" : "  Couldn't copy — clipboard not available.");
  }

  const wantsShare = await promptYesNo("  Share online?");
  if (wantsShare) {
    process.stdout.write("  Sharing...");
    const result = await shareVibe(stats, match, narrative);
    if (result) {
      console.log(" done!\n");
      console.log(`  ${result.url}`);
      console.log(`  Download card: ${result.card_url}`);
      openUrl(result.url);
    } else {
      console.log("\n  Couldn't share — your vibe lives on your machine.");
    }
  }

  console.log("\n  See your full session-by-session breakdown:");
  console.log("    npx heyiam\n");
}
