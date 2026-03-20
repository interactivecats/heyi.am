#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { listProjects, loadSession } from "./parser.js";
import { analyzeSession } from "./analyzer.js";
import { generateReport } from "./report.js";
import { summarizeSession } from "./summarize.js";
import type { SessionSummary } from "./summarize.js";
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, chmodSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { execSync, execFile, spawn } from "child_process";

const program = new Command();

program
  .name("ccs")
  .description("Claude Code Summary — analyze and summarize your Claude Code sessions")
  .version("0.1.0");

program
  .command("list")
  .description("List all projects and sessions")
  .option("-n, --limit <number>", "max sessions per project", "5")
  .action((opts) => {
    const projects = listProjects();

    if (projects.length === 0) {
      console.log("No Claude Code sessions found.");
      return;
    }

    console.log(`\n📂 Found ${projects.length} projects\n`);

    for (const project of projects) {
      console.log(`  ${project.path}`);
      const sessions = project.sessions.slice(0, parseInt(opts.limit));
      for (const session of sessions) {
        const sizeKB = (session.fileSize / 1024).toFixed(0);
        const date = session.lastModified.toLocaleDateString();
        const time = session.lastModified.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        console.log(
          `    ${session.id.slice(0, 8)}  ${date} ${time}  ${sizeKB}KB`
        );
      }
      console.log();
    }
  });

program
  .command("summary")
  .description("Generate a summary report for a session")
  .argument("[session-id]", "Session ID (first 8 chars is enough)")
  .option("-p, --project <name>", "Project name (encoded)")
  .option("-o, --output <path>", "Output HTML file path")
  .option("-s, --screenshots <dir>", "Screenshots directory to include")
  .option("--latest", "Use the most recent session")
  .option("--json", "Output raw analysis as JSON instead of HTML")
  .option("--ai", "Use Claude to generate narrative summary and insights")
  .action(async (sessionIdPrefix, opts) => {
    const projects = listProjects();

    let projectName: string;
    let sessionId: string;

    if (opts.latest) {
      // Find the most recent session across all projects
      let latest: { project: string; id: string; date: Date } | null = null;
      for (const p of projects) {
        if (p.sessions.length > 0) {
          const s = p.sessions[0];
          if (!latest || s.lastModified > latest.date) {
            latest = { project: p.name, id: s.id, date: s.lastModified };
          }
        }
      }
      if (!latest) {
        console.error("No sessions found.");
        process.exit(1);
      }
      projectName = latest.project;
      sessionId = latest.id;
    } else if (sessionIdPrefix) {
      // Find session by prefix
      let found: { project: string; id: string } | null = null;

      for (const p of projects) {
        // If project specified, filter
        if (opts.project && p.name !== opts.project) continue;

        for (const s of p.sessions) {
          if (s.id.startsWith(sessionIdPrefix)) {
            found = { project: p.name, id: s.id };
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        console.error(`Session not found: ${sessionIdPrefix}`);
        console.error("Run 'ccs list' to see available sessions.");
        process.exit(1);
      }
      projectName = found.project;
      sessionId = found.id;
    } else {
      console.error("Provide a session ID or use --latest");
      process.exit(1);
    }

    console.log(`\nAnalyzing session ${sessionId.slice(0, 8)}...`);

    const session = loadSession(projectName, sessionId);
    const analysis = analyzeSession(session);

    if (opts.json) {
      console.log(JSON.stringify(analysis, null, 2));
      return;
    }

    let summary: SessionSummary | null = null;
    if (opts.ai) {
      const cliApiKey = process.env.ANTHROPIC_API_KEY;
      if (!cliApiKey) {
        console.error("   No ANTHROPIC_API_KEY set. Skipping AI summary.");
      } else {
        console.log("   Generating AI summary...");
        try {
          summary = await summarizeSession(analysis, cliApiKey);
          console.log(`   AI summary generated (${summary.tokensUsed} tokens analyzed)`);
        } catch (err: any) {
          console.error(`   AI summary failed: ${err.message}`);
          console.error("   Continuing without AI summary...");
        }
      }
    }

    const screenshotsDir = opts.screenshots ?? null;
    const html = generateReport(analysis, screenshotsDir, summary);

    const outputPath =
      opts.output ?? join(process.cwd(), `session-${sessionId.slice(0, 8)}.html`);

    writeFileSync(outputPath, html, "utf-8");
    console.log(`\n✅ Report saved to: ${outputPath}`);
    console.log(`   Open in browser: file://${outputPath}\n`);

    // Print quick stats
    console.log(`   Turns: ${analysis.turns.length}`);
    console.log(`   Tool Calls: ${analysis.totalToolCalls}`);
    console.log(`   Files Changed: ${analysis.filesChanged.length}`);
    console.log(`   Duration: ${analysis.duration.minutes} min`);
    console.log(
      `   Tokens: ${formatTokens(analysis.tokens.totalInput + analysis.tokens.totalOutput)}`
    );
    if (analysis.funnyMoments.length > 0) {
      console.log(`   Highlights: ${analysis.funnyMoments.length}`);
    }
    console.log();
  });

program
  .command("compare")
  .description("Compare two sessions side by side")
  .argument("<session1>", "First session ID prefix")
  .argument("<session2>", "Second session ID prefix")
  .action((s1, s2) => {
    const projects = listProjects();

    function findSession(prefix: string) {
      for (const p of projects) {
        for (const s of p.sessions) {
          if (s.id.startsWith(prefix)) return { project: p.name, id: s.id };
        }
      }
      return null;
    }

    const found1 = findSession(s1);
    const found2 = findSession(s2);

    if (!found1 || !found2) {
      console.error("One or both sessions not found.");
      process.exit(1);
    }

    const a1 = analyzeSession(loadSession(found1.project, found1.id));
    const a2 = analyzeSession(loadSession(found2.project, found2.id));

    console.log(`\n  Comparing sessions:\n`);
    console.log(`  ${"".padEnd(25)} ${s1.slice(0, 8).padEnd(15)} ${s2.slice(0, 8)}`);
    console.log(`  ${"─".repeat(55)}`);
    console.log(
      `  ${"Turns".padEnd(25)} ${String(a1.turns.length).padEnd(15)} ${a2.turns.length}`
    );
    console.log(
      `  ${"Tool Calls".padEnd(25)} ${String(a1.totalToolCalls).padEnd(15)} ${a2.totalToolCalls}`
    );
    console.log(
      `  ${"Files Changed".padEnd(25)} ${String(a1.filesChanged.length).padEnd(15)} ${a2.filesChanged.length}`
    );
    console.log(
      `  ${"Duration (min)".padEnd(25)} ${String(a1.duration.minutes).padEnd(15)} ${a2.duration.minutes}`
    );
    console.log(
      `  ${"Total Tokens".padEnd(25)} ${formatTokens(a1.tokens.totalInput + a1.tokens.totalOutput).padEnd(15)} ${formatTokens(a2.tokens.totalInput + a2.tokens.totalOutput)}`
    );
    console.log(
      `  ${"Rejected Calls".padEnd(25)} ${String(a1.rejectedToolCalls).padEnd(15)} ${a2.rejectedToolCalls}`
    );
    console.log(
      `  ${"Agents Spawned".padEnd(25)} ${String(a1.subagentCount).padEnd(15)} ${a2.subagentCount}`
    );
    console.log(
      `  ${"Highlights".padEnd(25)} ${String(a1.funnyMoments.length).padEnd(15)} ${a2.funnyMoments.length}`
    );
    console.log();
  });

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

// ── Auth token storage ──────────────────────────

const TOKEN_PATH = join(homedir(), ".claude", "heyi-am-token");
let HEYI_AM_URL = process.env.HEYI_AM_URL || "https://heyi.am";

function getStoredToken(): string | null {
  try {
    if (existsSync(TOKEN_PATH)) {
      return readFileSync(TOKEN_PATH, "utf-8").trim();
    }
  } catch { /* ignore */ }
  return null;
}

function storeToken(token: string): void {
  const dir = join(homedir(), ".claude");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TOKEN_PATH, token, "utf-8");
  chmodSync(TOKEN_PATH, 0o600);
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  execFile(cmd, [url], () => { /* ignore errors */ });
}

// ── ccs login ───────────────────────────────────

program
  .command("login")
  .description("Connect your CLI to your heyi.am account")
  .option("--url <url>", "heyi.am server URL (for development)")
  .action(async (opts) => {
    if (opts.url) HEYI_AM_URL = opts.url;
    const existing = getStoredToken();
    if (existing) {
      try {
        const res = await fetch(`${HEYI_AM_URL}/api/me`, {
          headers: { Authorization: `Bearer ${existing}` },
        });
        if (res.ok) {
          const user = await res.json();
          console.log(`\n  Already logged in as ${user.username || user.email}`);
          console.log(`  View your portfolio: ${HEYI_AM_URL}/${user.username}\n`);
          return;
        }
      } catch { /* token invalid, continue */ }
    }

    console.log("\n  Opening browser to authenticate...\n");

    let deviceCode: string;
    let userCode: string;
    let verificationUri: string;

    try {
      const res = await fetch(`${HEYI_AM_URL}/api/device/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        console.error("  Failed to start authentication. Is heyi.am reachable?");
        process.exit(1);
      }

      const data = await res.json();
      deviceCode = data.device_code;
      userCode = data.user_code;
      verificationUri = data.verification_uri;
    } catch {
      console.error("  Could not reach heyi.am. Check your internet connection.");
      process.exit(1);
    }

    const authUrl = `${verificationUri}?code=${userCode}`;
    console.log(`  Your code: ${userCode}`);
    console.log(`  If the browser doesn't open, visit: ${authUrl}\n`);

    openBrowser(authUrl);

    process.stdout.write("  Waiting for authorization...");

    const pollInterval = 5000;
    const maxAttempts = 120;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollInterval));
      process.stdout.write(".");

      try {
        const res = await fetch(`${HEYI_AM_URL}/api/device/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: deviceCode }),
        });

        if (!res.ok) continue;
        const data = await res.json();

        if (data.status === "authorized") {
          storeToken(data.token);
          console.log("\n");
          console.log(`  ✓ Logged in as ${data.user.username || data.user.email}`);
          console.log(`  Your published sessions are now on your portfolio.`);
          console.log(`  View: ${HEYI_AM_URL}/${data.user.username}\n`);
          return;
        }

        if (data.status === "expired") {
          console.log("\n\n  Authorization expired. Run `ccs login` to try again.\n");
          process.exit(1);
        }
      } catch { /* keep polling */ }
    }

    console.log("\n\n  Timed out. Run `ccs login` to try again.\n");
    process.exit(1);
  });

program
  .command("logout")
  .description("Disconnect your CLI from heyi.am")
  .action(() => {
    if (existsSync(TOKEN_PATH)) {
      unlinkSync(TOKEN_PATH);
      console.log("\n  Logged out. Your published sessions are still live.\n");
    } else {
      console.log("\n  Not logged in.\n");
    }
  });

program
  .command("open", { isDefault: true })
  .description("Launch the web app")
  .option("--port <port>", "Port to run on", "51778")
  .option("--no-open", "Don't open browser automatically")
  .action(async (opts) => {
    const port = opts.port;
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const appDir = join(__dirname, "../app");
    const distDir = join(appDir, "dist");

    // Build frontend if not already built
    if (!existsSync(distDir)) {
      console.log("Building frontend (first run)...");
      try {
        execSync("npm run build", { cwd: appDir, stdio: "inherit" });
      } catch {
        console.error("Failed to build frontend. Run from the project root.");
        process.exit(1);
      }
    }

    // Start the server
    process.env.CCS_PORT = port;
    await import("./server.js");

    // Open browser
    if (opts.open !== false) {
      const url = `http://localhost:${port}`;
      setTimeout(async () => {
        const { execFile } = await import("child_process");
        const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        execFile(cmd, [url], (err) => {
          if (err) console.log(`Open ${url} in your browser`);
        });
      }, 1000);
    }
  });

program.parse();
