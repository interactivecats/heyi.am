import express from "express";
import crypto from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3002");
const DATA_DIR = process.env.DATA_DIR ?? "./data";
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

// Ensure data directory exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: "1mb" }));

// CORS — restrict to configured origins (the local app)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:51778").split(",");
app.use((_req, res, next) => {
  const origin = _req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Delete-Token");
  if (_req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

interface ShareRecord {
  id: string;
  viewerToken: string;
  deleteToken: string;
  createdAt: string;
  expiresAt: string | null;
  title: string;
  summary: any;
}

function generateId(): string {
  return crypto.randomBytes(16).toString("base64url"); // 22 chars, URL-safe
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function getRecord(id: string): ShareRecord | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const file = join(DATA_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    const record = JSON.parse(readFileSync(file, "utf-8")) as ShareRecord;
    // Check expiry
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      unlinkSync(file);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

// Simple rate limiting: max 10 creates per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_EXPIRY_DAYS = 90;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// POST /share — create a new shared session
app.post("/share", (req, res) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    return;
  }
  const { title, summary, expiresIn } = req.body;

  if (!summary) {
    res.status(400).json({ error: "Missing summary data" });
    return;
  }

  const id = generateId();
  const viewerToken = generateToken();
  const deleteToken = generateToken();

  // expiresIn: number of days, capped at MAX_EXPIRY_DAYS. Default 30 days.
  const days = Math.min(Math.max(expiresIn ?? 30, 1), MAX_EXPIRY_DAYS);
  let expiresAt: string | null = null;
  {
    const d = new Date();
    d.setDate(d.getDate() + expiresIn);
    expiresAt = d.toISOString();
  }

  const record: ShareRecord = {
    id,
    viewerToken,
    deleteToken,
    createdAt: new Date().toISOString(),
    expiresAt,
    title: title ?? "Shared Session",
    summary,
  };

  writeFileSync(join(DATA_DIR, `${id}.json`), JSON.stringify(record));

  res.json({
    url: `${BASE_URL}/s/${id}/${viewerToken}`,
    deleteToken,
    id,
    expiresAt,
  });
});

// DELETE /s/:id — delete a shared session (requires delete token)
app.delete("/s/:id", (req, res) => {
  const { id } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const token = req.headers["x-delete-token"] as string;
  if (!token) {
    res.status(401).json({ error: "Delete token required" });
    return;
  }

  const record = getRecord(id);
  if (!record) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const expected = Buffer.from(record.deleteToken);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    res.status(403).json({ error: "Invalid delete token" });
    return;
  }

  unlinkSync(join(DATA_DIR, `${id}.json`));
  res.json({ deleted: true });
});

// GET /s/:id/:viewerToken — view a shared session (token in path, not query)
app.get("/s/:id/:viewerToken", (req, res) => {
  const { id, viewerToken } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !/^[a-zA-Z0-9_-]+$/.test(viewerToken)) {
    res.status(404).send(renderNotFound());
    return;
  }

  const record = getRecord(id);
  if (!record) {
    res.status(404).send(renderNotFound());
    return;
  }

  const expected = Buffer.from(record.viewerToken);
  const provided = Buffer.from(viewerToken);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    res.status(404).send(renderNotFound());
    return;
  }

  // Security headers: prevent token leakage via Referer, lock down content
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(renderShare(record));
});

// Health check — no data leaked
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ── HTML rendering ──────────────────────────────

function renderShare(record: ShareRecord): string {
  const s = record.summary;
  const esc = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

  const narrativeHtml = s.narrative
    ? s.narrative.split("\n\n").map((p: string) => `<p>${esc(p.trim())}</p>`).join("")
    : "";

  const highlightsHtml = (s.highlights ?? [])
    .map((h: any) => `
      <div class="highlight">
        <span class="hl-tag">${esc(h.type?.toUpperCase() ?? "")}</span>
        <strong>${esc(h.title ?? "")}</strong>
        <p>${esc(h.description ?? "")}</p>
      </div>
    `)
    .join("");

  const stepsHtml = (s.tutorialSteps ?? [])
    .map((step: any, i: number) => `
      <li>
        <strong>${esc(step.title ?? "")}</strong>
        <p>${esc(step.description ?? "")}</p>
        ${step.keyTakeaway ? `<div class="takeaway">${esc(step.keyTakeaway)}</div>` : ""}
      </li>
    `)
    .join("");

  const insightsHtml = (s.efficiencyInsights ?? [])
    .map((ins: string) => `<div class="insight">${esc(ins)}</div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(record.title)}</title>
<meta property="og:title" content="${esc(record.title)}">
<meta property="og:description" content="${esc(s.oneLineSummary ?? "")}">
<style>
:root {
  --bg: #fff; --bg2: #f6f8fa; --border: #e1e4e8;
  --text: #1f2328; --text2: #59636e; --text3: #8b949e;
  --accent: #0969da; --green: #1a7f37; --red: #cf222e; --amber: #9a6700; --purple: #6f42c1;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --bg2: #161b22; --border: #30363d;
    --text: #e6edf3; --text2: #8b949e; --text3: #6e7681;
    --accent: #58a6ff; --green: #3fb950; --red: #f85149; --amber: #d29922; --purple: #bc8cff;
  }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--sans); background: var(--bg); color: var(--text); line-height: 1.65; max-width: 720px; margin: 0 auto; padding: 48px 24px 96px; }
h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
.meta { font-size: 13px; color: var(--text2); margin-bottom: 32px; }
.label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.section { margin-bottom: 40px; }
p { font-size: 15px; color: var(--text2); line-height: 1.8; margin-bottom: 12px; }
.highlight { background: var(--bg2); border-left: 3px solid var(--amber); border-radius: 0 4px 4px 0; padding: 10px 14px; margin-bottom: 10px; }
.hl-tag { font-family: var(--mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); margin-right: 8px; }
.highlight strong { font-size: 14px; }
.highlight p { font-size: 13px; margin-top: 4px; margin-bottom: 0; }
ol { padding-left: 24px; }
li { margin-bottom: 16px; }
li strong { display: inline; font-size: 15px; color: var(--text); }
li p { font-size: 14px; margin: 4px 0 0; }
.takeaway { font-size: 13px; color: var(--green); margin-top: 6px; padding-left: 12px; border-left: 2px solid var(--green); font-style: italic; }
.insight { padding: 10px 14px; margin-bottom: 8px; background: var(--bg2); border-left: 3px solid var(--amber); border-radius: 0 4px 4px 0; font-size: 14px; color: var(--text2); }
.footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text3); }
.footer a { color: var(--accent); text-decoration: none; }
</style>
</head>
<body>
  <h1>${esc(s.oneLineSummary ?? record.title)}</h1>
  <div class="meta">
    Shared ${new Date(record.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
    ${record.expiresAt ? ` · Expires ${new Date(record.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
  </div>

  ${narrativeHtml ? `<div class="section"><div class="label">Summary</div>${narrativeHtml}</div>` : ""}
  ${highlightsHtml ? `<div class="section"><div class="label">Highlights</div>${highlightsHtml}</div>` : ""}
  ${stepsHtml ? `<div class="section"><div class="label">Walkthrough</div><ol>${stepsHtml}</ol></div>` : ""}
  ${insightsHtml ? `<div class="section"><div class="label">Efficiency Insights</div>${insightsHtml}</div>` : ""}

  <div class="footer">
    Shared via <a href="https://github.com/benjamincates/claude-code-summary">Claude Code Summary</a>
  </div>
</body>
</html>`;
}

function renderNotFound(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Not Found</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;color:#59636e;}h1{font-size:18px;font-weight:500;}</style>
</head>
<body><h1>This shared session has expired or been deleted.</h1></body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`Share server running on ${BASE_URL}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
