import type { SessionAnalysis, Turn, FunnyMoment } from "./analyzer.js";
import type { SessionSummary, TutorialStep, Highlight, SummaryHighlight } from "./summarize.js";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtTime(ts: string): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ts: string): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function trunc(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "\u2026";
}

function shortModel(m: string): string {
  return m.replace("claude-", "").replace(/-\d{8}$/, "").replace(/-\d+$/, "");
}

function toolColor(name: string): string {
  const c: Record<string, string> = {
    Bash: "#d73a49", Edit: "#e36209", Write: "#22863a", Read: "#0366d6",
    Grep: "#6f42c1", Glob: "#0e8a16", Agent: "#b08800", WebFetch: "#005cc5", WebSearch: "#5a32a3",
  };
  return c[name] ?? "#6a737d";
}

// ── Turn rendering ──────────────────────────────

function renderTurn(turn: Turn, screenshotsDir: string | null): string {
  const tools = turn.toolCalls;
  const userText = turn.userPrompt.trim();
  const assistantText = turn.assistantText.trim();
  const tokens = turn.inputTokens + turn.outputTokens;
  const summaryPrompt = trunc(userText, 80) || "(tool continuation)";

  // Compact tool names for the summary line
  const toolSummary = tools.length
    ? tools.map((tc) => {
        const failed = !tc.succeeded;
        return `<span class="r-pill${failed ? " r-pill-err" : ""}">${esc(tc.name)}</span>`;
      }).join("")
    : "";

  // Expanded content
  const toolDetails = tools.map((tc) => {
    let label = "";
    if (tc.name === "Bash") {
      const cmd = ((tc.input as any).command ?? "").toString().split("\n")[0].slice(0, 80);
      label = `<span class="r-tool-label">${esc(cmd)}</span>`;
    } else if (["Edit", "Write", "Read"].includes(tc.name)) {
      const fp = ((tc.input as any).file_path ?? "").toString();
      label = `<span class="r-tool-label">${esc(fp)}</span>`;
    } else if (["Grep", "Glob"].includes(tc.name)) {
      label = `<span class="r-tool-label">${esc(((tc.input as any).pattern ?? "").toString().slice(0, 60))}</span>`;
    } else if (tc.name === "Agent") {
      label = `<span class="r-tool-label">${esc(((tc.input as any).description ?? "").toString().slice(0, 60))}</span>`;
    }

    const status = tc.succeeded
      ? '<span class="r-ok">\u2713</span>'
      : '<span class="r-err">\u2717</span>';

    return `<div class="r-tool-row">${status}<span class="r-pill" style="background:${toolColor(tc.name)}15;color:${toolColor(tc.name)};border-color:${toolColor(tc.name)}40">${esc(tc.name)}</span>${label}</div>`;
  }).join("");

  // Terminal blocks
  const terminals = tools
    .filter((tc) => tc.name === "Bash" && tc.resultPreview)
    .map((tc) => {
      const cmd = ((tc.input as any).command ?? "").toString();
      return `<div class="r-term"><pre><span class="r-ps">$</span> ${esc(cmd)}\n<span class="r-out">${esc(trunc(tc.resultPreview, 1200))}</span></pre></div>`;
    }).join("");

  // Screenshots
  let shots = "";
  if (screenshotsDir) {
    const prefix = `turn-${String(turn.index).padStart(4, "0")}`;
    const files = existsSync(screenshotsDir) ? readdirSync(screenshotsDir).filter((f) => f.startsWith(prefix)) : [];
    shots = files.map((f) => `<img src="file://${esc(join(screenshotsDir, f))}" class="r-screenshot" loading="lazy" />`).join("");
  }

  return `
  <details class="r-turn" id="turn-${turn.index}">
    <summary>
      <span class="r-turn-n">${turn.index + 1}</span>
      <span class="r-turn-time">${fmtTime(turn.userTimestamp)}</span>
      <span class="r-turn-prompt">${esc(summaryPrompt)}</span>
      <span class="r-turn-pills">${toolSummary}</span>
      ${tokens > 0 ? `<span class="r-turn-tok">${fmtTok(tokens)}</span>` : ""}
    </summary>
    <div class="r-turn-body">
      ${userText ? `<div class="r-user"><p>${esc(userText)}</p></div>` : ""}
      ${toolDetails ? `<div class="r-tool-details">${toolDetails}</div>` : ""}
      ${terminals}
      ${shots}
      ${assistantText ? `<div class="r-assistant"><p>${esc(trunc(assistantText, 1500))}</p></div>` : ""}
    </div>
  </details>`;
}

// ── Highlight rendering ─────────────────────────

function renderHighlight(h: Highlight | FunnyMoment | SummaryHighlight, isFunny = false): string {
  const type = isFunny ? (h as FunnyMoment).type : (h as Highlight).type;
  const title = isFunny ? (h as FunnyMoment).description : (h as Highlight).title;
  const desc = isFunny ? (h as FunnyMoment).context : (h as Highlight).description;
  const turnIdx = (h as any).turnIndex ?? 0;

  const typeClass: Record<string, string> = {
    impressive: "r-hl-blue", clever: "r-hl-purple",
    frustrating: "r-hl-red", repeated_failure: "r-hl-red",
    funny: "r-hl-amber", apology: "r-hl-amber", user_frustration: "r-hl-amber",
  };
  const labels: Record<string, string> = {
    impressive: "NICE", clever: "BIG BRAIN", frustrating: "OOF",
    repeated_failure: "LOOP", funny: "LOL", apology: "SORRY", user_frustration: "SIGH",
  };

  return `
  <div class="r-highlight ${typeClass[type] ?? "r-hl-amber"}">
    <div class="r-hl-label">${labels[type] ?? type.toUpperCase()}</div>
    <div class="r-hl-title">${esc(title)}</div>
    ${desc ? `<div class="r-hl-desc">${esc(trunc(desc, 300))}</div>` : ""}
    <a class="r-hl-link" href="#turn-${turnIdx}">Turn ${turnIdx + 1} &rarr;</a>
  </div>`;
}

// ── Main export ─────────────────────────────────

export function generateReport(
  a: SessionAnalysis,
  screenshotsDir: string | null = null,
  summary: SessionSummary | null = null
): string {
  const projectName = a.projectPath.split("/").pop() ?? a.projectPath;
  const totalTokens = a.tokens.totalInput + a.tokens.totalOutput;
  const toolEntries = Object.entries(a.toolUsage).sort((x, y) => y[1].count - x[1].count);
  const maxTool = Math.max(...toolEntries.map(([, s]) => s.count), 1);

  // Real turns with user text
  const realTurns = a.turns.filter((t) => t.userPrompt.trim().length > 0);

  const highlights = [
    ...(summary?.highlights ?? []).map((h) => renderHighlight(h)),
    ...a.funnyMoments.map((m) => renderHighlight(m, true)),
  ].join("");

  const tutorialHtml = summary?.tutorialSteps?.length
    ? summary.tutorialSteps.map((s, i) => `
      <li>
        <strong>${esc(s.title)}</strong>
        <p>${esc(s.description)}</p>
        ${s.keyTakeaway ? `<div class="r-takeaway">${esc(s.keyTakeaway)}</div>` : ""}
        ${s.turnRange ? `<span class="r-range">Turns ${esc(s.turnRange)}</span>` : ""}
      </li>`).join("")
    : "";

  const insightsHtml = summary?.efficiencyInsights?.length
    ? summary.efficiencyInsights.map((ins) => `<div class="r-insight">${esc(ins)}</div>`).join("")
    : "";

  const turnsHtml = a.turns.map((t) => renderTurn(t, screenshotsDir)).join("");

  const filesVisible = a.filesChanged.sort((x, y) => y.count - x.count).slice(0, 10);
  const filesOverflow = a.filesChanged.sort((x, y) => y.count - x.count).slice(10);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} \u2014 Session Summary</title>
<style>
:root {
  --bg: #ffffff; --bg2: #f6f8fa; --bg-code: #0d1117;
  --border: #d1d9e0; --border-light: #e8ecf0;
  --text: #1f2328; --text2: #59636e; --text3: #8b949e;
  --accent: #0969da; --red: #cf222e; --green: #1a7f37; --amber: #9a6700; --purple: #6f42c1;
  --mono: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --bg2: #161b22; --bg-code: #010409;
    --border: #30363d; --border-light: #21262d;
    --text: #e6edf3; --text2: #8b949e; --text3: #6e7681;
    --accent: #58a6ff; --red: #f85149; --green: #3fb950; --amber: #d29922; --purple: #bc8cff;
  }
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { font-size: 15px; }
body { font-family: var(--sans); background: var(--bg); color: var(--text); line-height: 1.65; -webkit-font-smoothing: antialiased; }

.report { max-width: 720px; margin: 0 auto; padding: 48px 24px 96px; }

/* Header */
.r-project { font-family: var(--mono); font-size: 12px; color: var(--text3); margin-bottom: 4px; }
.r-title { font-size: 22px; font-weight: 600; line-height: 1.3; margin-bottom: 8px; }
.r-meta { font-size: 13px; color: var(--text2); margin-bottom: 32px; }
.r-meta .sep { margin: 0 6px; color: var(--text3); }

/* Section labels */
.r-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-light); }
.r-section { margin-bottom: 40px; }

/* Narrative */
.r-narrative p { font-size: 15px; line-height: 1.8; color: var(--text2); margin-bottom: 16px; }

/* Tutorial */
.r-steps ol { padding-left: 24px; counter-reset: none; }
.r-steps li { margin-bottom: 20px; }
.r-steps li strong { display: block; font-size: 15px; color: var(--text); margin-bottom: 4px; }
.r-steps li p { font-size: 14px; color: var(--text2); line-height: 1.7; margin: 0; }
.r-takeaway { font-size: 13px; color: var(--green); margin-top: 6px; padding-left: 12px; border-left: 2px solid var(--green); font-style: italic; }
.r-range { font-family: var(--mono); font-size: 11px; color: var(--text3); }

/* Insights */
.r-insight { padding: 10px 14px; margin-bottom: 8px; background: var(--bg2); border-left: 3px solid var(--amber); border-radius: 0 4px 4px 0; font-size: 14px; color: var(--text2); line-height: 1.7; }

/* Highlights */
.r-highlight { border-left: 3px solid var(--amber); padding: 10px 14px; margin-bottom: 10px; background: var(--bg2); border-radius: 0 4px 4px 0; }
.r-hl-blue { border-left-color: var(--accent); }
.r-hl-purple { border-left-color: var(--purple); }
.r-hl-red { border-left-color: var(--red); }
.r-hl-amber { border-left-color: var(--amber); }
.r-hl-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); margin-bottom: 4px; }
.r-hl-blue .r-hl-label { color: var(--accent); }
.r-hl-purple .r-hl-label { color: var(--purple); }
.r-hl-red .r-hl-label { color: var(--red); }
.r-hl-amber .r-hl-label { color: var(--amber); }
.r-hl-title { font-size: 14px; font-weight: 600; color: var(--text); }
.r-hl-desc { font-size: 13px; color: var(--text2); margin-top: 4px; line-height: 1.6; }
.r-hl-link { font-family: var(--mono); font-size: 11px; color: var(--accent); text-decoration: none; margin-top: 6px; display: inline-block; }
.r-hl-link:hover { text-decoration: underline; }

/* Tool bars */
.r-bars { display: flex; flex-direction: column; gap: 5px; }
.r-bar { display: flex; align-items: center; gap: 8px; }
.r-bar-name { width: 72px; text-align: right; font-family: var(--mono); font-size: 12px; color: var(--text2); flex-shrink: 0; }
.r-bar-track { flex: 1; height: 8px; background: var(--bg2); border-radius: 4px; overflow: hidden; }
.r-bar-fill { height: 100%; border-radius: 4px; }
.r-bar-count { font-family: var(--mono); font-size: 12px; color: var(--text2); width: 32px; }
.r-bar-err { font-family: var(--mono); font-size: 11px; color: var(--red); width: 40px; }

/* Files */
.r-files { display: flex; flex-direction: column; }
.r-file { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-light); font-size: 13px; }
.r-file:last-child { border-bottom: none; }
.r-file-path { font-family: var(--mono); font-size: 12px; color: var(--text2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.r-file-count { font-family: var(--mono); font-size: 12px; color: var(--text3); flex-shrink: 0; }

/* Timeline */
.r-controls { display: flex; gap: 8px; margin-bottom: 12px; }
.r-controls button { font-family: var(--mono); font-size: 11px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg2); color: var(--text2); cursor: pointer; }
.r-controls button:hover { background: var(--border-light); color: var(--text); }

details.r-turn { border-bottom: 1px solid var(--border-light); }
details.r-turn summary { display: flex; align-items: center; gap: 8px; padding: 8px 0; cursor: pointer; font-size: 13px; list-style: none; flex-wrap: wrap; }
details.r-turn summary::-webkit-details-marker { display: none; }
details.r-turn summary::before { content: '\u25b6'; font-size: 9px; color: var(--text3); transition: transform 0.15s; flex-shrink: 0; }
details.r-turn[open] summary::before { transform: rotate(90deg); }
.r-turn-n { font-family: var(--mono); font-size: 11px; color: var(--text3); min-width: 24px; }
.r-turn-time { font-family: var(--mono); font-size: 11px; color: var(--text3); }
.r-turn-prompt { color: var(--text); font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-turn-pills { display: flex; gap: 3px; flex-shrink: 0; flex-wrap: wrap; }
.r-turn-tok { font-family: var(--mono); font-size: 10px; color: var(--text3); flex-shrink: 0; }

.r-turn-body { padding: 8px 0 16px 32px; }
.r-user p { white-space: pre-wrap; word-break: break-word; font-size: 14px; color: var(--text); margin-bottom: 12px; }
.r-assistant p { white-space: pre-wrap; word-break: break-word; font-size: 13px; color: var(--text2); line-height: 1.7; }

.r-pill { display: inline-block; font-family: var(--mono); font-size: 10px; padding: 1px 6px; border-radius: 3px; background: var(--bg2); color: var(--text3); border: 1px solid var(--border-light); }
.r-pill-err { color: var(--red); border-color: var(--red); background: transparent; }

.r-tool-details { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
.r-tool-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.r-tool-label { font-family: var(--mono); font-size: 11px; color: var(--text3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-ok { color: var(--green); font-weight: 600; font-size: 12px; }
.r-err { color: var(--red); font-weight: 600; font-size: 12px; }

.r-term { border-radius: 6px; overflow: hidden; margin: 8px 0; background: var(--bg-code); border: 1px solid #30363d; }
.r-term pre { padding: 12px 14px; font-family: var(--mono); font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; max-height: 250px; overflow-y: auto; color: #c9d1d9; }
.r-ps { color: #3fb950; }
.r-out { color: #8b949e; }

.r-screenshot { max-width: 100%; border-radius: 6px; margin: 8px 0; border: 1px solid var(--border); }

/* Overflow files */
details.r-more { margin-top: 4px; }
details.r-more summary { font-family: var(--mono); font-size: 12px; color: var(--accent); cursor: pointer; list-style: none; }
details.r-more summary::-webkit-details-marker { display: none; }

.r-empty { color: var(--text3); font-style: italic; font-size: 13px; padding: 8px 0; }

@media print {
  body { background: white; color: black; }
  .r-term { background: #f3f4f6; border-color: #ddd; }
  .r-term pre, .r-out { color: #333; }
  details.r-turn { break-inside: avoid; }
  .r-controls { display: none; }
}
</style>
</head>
<body>
<article class="report">

  <div class="r-project">${esc(a.projectPath)}</div>
  <h1 class="r-title">${summary?.oneLineSummary ? esc(summary.oneLineSummary) : `Session on ${esc(projectName)}`}</h1>
  <p class="r-meta">
    ${fmtDate(a.duration.start)}<span class="sep">&middot;</span>${fmtTime(a.duration.start)}\u2013${fmtTime(a.duration.end)}<span class="sep">&middot;</span>${a.duration.minutes}m<span class="sep">&middot;</span>${realTurns.length} turns<span class="sep">&middot;</span>${a.totalToolCalls} tool calls<span class="sep">&middot;</span>${a.filesChanged.length} files<span class="sep">&middot;</span>${fmtTok(totalTokens)} tokens<span class="sep">&middot;</span>${esc(a.gitBranch)}${a.subagentCount > 0 ? `<span class="sep">&middot;</span>${a.subagentCount} agents` : ""}
  </p>

  ${summary?.narrative ? `
  <div class="r-section">
    <div class="r-label">Summary</div>
    <div class="r-narrative">${summary.narrative.split("\n\n").map((p) => `<p>${esc(p.trim())}</p>`).join("")}</div>
  </div>
  ` : ""}

  ${highlights ? `
  <div class="r-section">
    <div class="r-label">Highlights</div>
    ${highlights}
  </div>
  ` : ""}

  ${tutorialHtml ? `
  <div class="r-section r-steps">
    <div class="r-label">Walkthrough</div>
    <ol>${tutorialHtml}</ol>
  </div>
  ` : ""}

  ${insightsHtml ? `
  <div class="r-section">
    <div class="r-label">Efficiency Insights</div>
    ${insightsHtml}
  </div>
  ` : ""}

  <div class="r-section">
    <div class="r-label">Tools</div>
    <div class="r-bars">
      ${toolEntries.map(([name, stats]) => `
        <div class="r-bar">
          <div class="r-bar-name">${esc(name)}</div>
          <div class="r-bar-track"><div class="r-bar-fill" style="width:${(stats.count / maxTool) * 100}%;background:${toolColor(name)}"></div></div>
          <div class="r-bar-count">${stats.count}</div>
          <div class="r-bar-err">${stats.errors > 0 ? stats.errors + " err" : ""}</div>
        </div>
      `).join("")}
    </div>
  </div>

  ${a.filesChanged.length ? `
  <div class="r-section">
    <div class="r-label">Files Changed</div>
    <div class="r-files">
      ${filesVisible.map((f) => `
        <div class="r-file">
          <div class="r-file-path">${esc(f.filePath)}</div>
          <div class="r-file-count">${f.count}x</div>
        </div>
      `).join("")}
    </div>
    ${filesOverflow.length ? `
    <details class="r-more">
      <summary>+${filesOverflow.length} more files</summary>
      <div class="r-files">
        ${filesOverflow.map((f) => `
          <div class="r-file">
            <div class="r-file-path">${esc(f.filePath)}</div>
            <div class="r-file-count">${f.count}x</div>
          </div>
        `).join("")}
      </div>
    </details>
    ` : ""}
  </div>
  ` : ""}

  <div class="r-section">
    <div class="r-label">Timeline (${a.turns.length} messages)</div>
    <div class="r-controls">
      <button onclick="document.querySelectorAll('details.r-turn').forEach(d=>d.open=true)">Expand all</button>
      <button onclick="document.querySelectorAll('details.r-turn').forEach(d=>d.open=false)">Collapse all</button>
    </div>
    ${turnsHtml}
  </div>

</article>
</body>
</html>`;
}
