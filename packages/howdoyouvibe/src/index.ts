#!/usr/bin/env node

import { listSessions, parseSession } from "./parsers/index.js";
import type { ParsedSession } from "./types.js";
import { computeVibeStats } from "./stats.js";
import { matchArchetype } from "./archetypes.js";
import { fetchNarrative, localResult } from "./narrative.js";
import { renderCard, formatTextBlock, copyToClipboard, promptYesNo, link } from "./render.js";
import { shareVibe } from "./share.js";
import { execFile } from "node:child_process";
import { platform } from "node:os";

function openUrl(url: string): void {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", url] : [url];
  execFile(cmd, args, () => {}); // fire-and-forget
}

// ─── Discover and parse all sessions ─────────────────────────────────────

async function discoverAndParse(): Promise<{ sessions: ParsedSession[]; childTokens: number }> {
  const metas = await listSessions();

  if (metas.length === 0) {
    console.log("  No AI coding sessions found.");
    console.log("  Supports: Claude Code, Cursor, Codex, Gemini CLI");
    process.exit(0);
  }

  const topLevel = metas.filter((m) => !m.isSubagent);
  const children = metas.filter((m) => m.isSubagent);
  console.log("  Scanning local AI sessions: ~/.claude, ~/.cursor, ~/.codex, ~/.gemini");
  console.log(`  Found ${topLevel.length} parent sessions${children.length > 0 ? ` + ${children.length} subagents` : ""}...`);

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

  // Parse child sessions for token usage only (behavioral stats come from parents)
  let childTokens = 0;
  for (const meta of children) {
    try {
      const analysis = await parseSession(meta.path);
      if (analysis.token_usage) {
        childTokens += (analysis.token_usage.input_tokens ?? 0)
          + (analysis.token_usage.output_tokens ?? 0);
      }
    } catch {
      // skip — child parse failures don't matter
    }
  }

  if (skipped > 0) {
    console.log(`  (${skipped} sessions skipped due to parse errors)`);
  }

  return { sessions, childTokens };
}

// ─── Main ────────────────────────────────────────────────────────────────

const { sessions, childTokens } = await discoverAndParse();

if (sessions.length === 0) {
  console.log("  No sessions with meaningful content found.");
  process.exit(0);
}

const stats = computeVibeStats(sessions);
stats.total_tokens += childTokens;
const match = matchArchetype(stats);

// Privacy consent — ask before any network call
let cloudConsent = false;
if (process.stdin.isTTY) {
  console.log("");
  console.log("  Share to howdoyouvibe.com for an AI-written roast of your stats.");
  console.log("  No code or session content is shared — only computed numbers.");
  console.log("");
  cloudConsent = await promptYesNo("  Generate AI narrative now?");
  if (!cloudConsent) {
    console.log("  No problem — running fully local.\n");
  }
}

let { headline, narrative } = cloudConsent
  ? await fetchNarrative(stats, match)
  : localResult(stats, match);

renderCard(stats, headline, narrative);

// Interactive share flow (skip if not a TTY, e.g. piped output)
if (process.stdin.isTTY) {
  const wantsCopy = await promptYesNo("  Copy to clipboard?");
  if (wantsCopy) {
    const text = formatTextBlock(stats, headline, narrative);
    const ok = copyToClipboard(text);
    console.log(ok ? "  Copied!" : "  Couldn't copy — clipboard not available.");
  }

  const wantsShare = await promptYesNo("  Post to howdoyouvibe.com? Get a shareable link and delete code.");
  if (wantsShare) {
    process.stdout.write("  Publishing...");
    const result = await shareVibe(stats, match, headline, narrative);
    if (result) {
      console.log(" done!\n");
      console.log(`  ${result.url}`);
      console.log(`  Download card: ${result.card_url}`);
      console.log("");
      console.log(`  Delete code: ${result.delete_code}`);
      console.log(`  Delete link: ${result.delete_url}`);
      console.log("  Save this — it's the only way to remove your vibe.");
      openUrl(result.url);
    } else {
      console.log("\n  Couldn't share — your vibe lives on your machine.");
    }
  }

  console.log("");
  console.log(`  Did you know? Claude Code only saves ~30 days of sessions.`);
  console.log(`  Keep a local archive and create a public portfolio at ${link("https://heyiam.com", "heyiam.com")}`);
  console.log("");
}
