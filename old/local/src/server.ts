import "dotenv/config";
import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, chmodSync } from "fs";
import { execFile } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { listProjects, loadSession } from "./parser.js";
import { analyzeSession } from "./analyzer.js";
import { summarizeSession, summarizeSessionStreaming, regenerateWithAnswers, generateSessionQuestions, type SessionSummary, type SessionQuestion, type QuestionAnswer } from "./summarize.js";
import { getMachineKey, signPayload } from "./machine-key.js";
import { captureScreenshot } from "./screenshot.js";
import { generateOgImage } from "./og-image.js";
import { listCursorWorkspaces, parseCursorWorkspace } from "./parsers/cursor.js";
import { parseTranscript } from "./parsers/paste.js";

// ── Bearer token helpers ────────────────────────────
const BEARER_TOKEN_PATH = join(homedir(), ".claude", "heyi-am-token");

export function getStoredBearerToken(): string | null {
  try {
    if (existsSync(BEARER_TOKEN_PATH)) {
      const token = readFileSync(BEARER_TOKEN_PATH, "utf-8").trim();
      return token || null;
    }
  } catch { /* ignore read errors */ }
  return null;
}

const app = express();
const PORT = parseInt(process.env.CCS_PORT ?? "51778");

app.use(cors({ origin: [`http://localhost:${PORT}`, "http://localhost:5173"] }));
app.use(express.json());

// Bind to localhost only — never expose to network
const HOST = "127.0.0.1";

// Validate path params to prevent traversal
function isSafeParam(param: string): boolean {
  // Allow alphanumeric, hyphens, underscores. No dots (prevents . and .. traversal).
  return /^[a-zA-Z0-9_-]+$/.test(param);
}

// Disk-backed cache for AI summaries (~/.claude/ccs-cache/)
const CACHE_DIR = join(homedir(), ".claude", "ccs-cache");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

function getCachedSummary(key: string): SessionSummary | null {
  const file = join(CACHE_DIR, `${key.replace(/\//g, "__")}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function setCachedSummary(key: string, summary: SessionSummary): void {
  const file = join(CACHE_DIR, `${key.replace(/\//g, "__")}.json`);
  writeFileSync(file, JSON.stringify(summary), "utf-8");
}

function deleteCachedSummary(key: string): boolean {
  const file = join(CACHE_DIR, `${key.replace(/\//g, "__")}.json`);
  if (existsSync(file)) {
    unlinkSync(file);
    return true;
  }
  return false;
}

/**
 * Extract the first real user prompt from a JSONL file by reading
 * only enough lines to find it (avoids parsing entire large files).
 */
function getFirstPrompt(filePath: string): string {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const limit = Math.min(lines.length, 200);
    for (let i = 0; i < limit; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "user" || !entry.message) continue;
        const msgContent = entry.message.content;
        const text =
          typeof msgContent === "string"
            ? msgContent
            : Array.isArray(msgContent)
              ? msgContent
                  .filter((b: any) => b.type === "text" && b.text)
                  .map((b: any) => b.text)
                  .join(" ")
              : "";
        const trimmed = text.trim();
        if (!trimmed) continue;
        // Skip system/command/teammate messages
        if (
          trimmed.startsWith("<local-command") ||
          trimmed.startsWith("<command-name>") ||
          trimmed.startsWith("<teammate-message") ||
          trimmed.startsWith("<local-command-caveat>") ||
          trimmed.startsWith("<local-command-stdout>")
        )
          continue;
        return trimmed.slice(0, 120);
      } catch {
        continue;
      }
    }
  } catch {
    // ignore read errors
  }
  return "";
}

/**
 * Compute active session duration by summing gaps between timestamps,
 * capping each gap at MAX_GAP_MINUTES to exclude idle time.
 */
const MAX_GAP_MINUTES = 5;

function getSessionDuration(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const timestamps: number[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp) {
          timestamps.push(new Date(entry.timestamp).getTime());
        }
      } catch {
        continue;
      }
    }

    if (timestamps.length < 2) return 0;

    let activeMs = 0;
    const maxGapMs = MAX_GAP_MINUTES * 60_000;

    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1];
      activeMs += Math.min(gap, maxGapMs);
    }

    return Math.round(activeMs / 60_000);
  } catch {
    // ignore
  }
  return 0;
}

// GET /api/projects
app.get("/api/projects", (_req, res) => {
  try {
    const projects = listProjects();
    const result = projects.map((project) => ({
      name: project.name,
      path: project.path,
      displayName: project.displayName,
      sessions: project.sessions.map((s) => ({
        id: s.id,
        date: s.lastModified.toISOString(),
        fileSize: s.fileSize,
        duration: getSessionDuration(s.filePath),
        firstPrompt: getFirstPrompt(s.filePath),
      })),
    }));
    res.json(result);
  } catch (err) {
    console.error("Error listing projects:", err);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// GET /api/sessions/:projectName/:sessionId
app.get("/api/sessions/:projectName/:sessionId", (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    if (!isSafeParam(sessionId) || !isSafeParam(projectName)) {
      res.status(400).json({ error: "Invalid parameters" });
      return;
    }
    const session = loadSession(projectName, sessionId);
    const analysis = analyzeSession(session);
    // Filter turns to only those with actual user text
    analysis.turns = analysis.turns.filter(
      (t) => t.userPrompt.trim().length > 0
    );
    res.json(analysis);
  } catch (err: any) {
    if (err.message?.includes("not found")) {
      res.status(404).json({ error: "Session not found" });
    } else {
      console.error("Error loading session:", err);
      res.status(500).json({ error: "Failed to load session" });
    }
  }
});

// GET /api/sessions/:projectName/:sessionId/summary-cache (check if cached, no AI trigger)
app.get("/api/sessions/:projectName/:sessionId/summary-cache", (req, res) => {
  const { projectName, sessionId } = req.params;
  if (!isSafeParam(sessionId) || !isSafeParam(projectName)) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }
  const cached = getCachedSummary(`${projectName}/${sessionId}`);
  if (cached) {
    res.json({ cached: true, summary: cached });
  } else {
    res.json({ cached: false });
  }
});

// DELETE /api/sessions/:projectName/:sessionId/summary-cache
app.delete("/api/sessions/:projectName/:sessionId/summary-cache", (req, res) => {
  const { projectName, sessionId } = req.params;
  if (!isSafeParam(sessionId) || !isSafeParam(projectName)) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }
  const deleted = deleteCachedSummary(`${projectName}/${sessionId}`);
  res.json({ deleted });
});

// Shared SSE handler for summarize-stream (GET without answers, POST with answers)
async function handleSummarizeStream(
  req: express.Request,
  res: express.Response,
  answers?: QuestionAnswer[],
  questions?: SessionQuestion[],
) {
  try {
    const projectName = req.params.projectName as string;
    const sessionId = req.params.sessionId as string;
    if (!isSafeParam(sessionId) || !isSafeParam(projectName)) {
      res.status(400).json({ error: "Invalid parameters" });
      return;
    }
    const cacheKey = `${projectName}/${sessionId}`;

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Check disk cache first — but only if no answers (answers = fresh run)
    if (!answers || answers.length === 0) {
      const cached = getCachedSummary(cacheKey);
      if (cached) {
        res.write(`data: ${JSON.stringify({ type: "complete", summary: cached })}\n\n`);
        res.end();
        return;
      }
    }

    const apiKey = (req.headers["x-api-key"] as string) || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ type: "error", error: "No API key. Set one in Settings." })}\n\n`);
      res.end();
      return;
    }

    const session = loadSession(projectName, sessionId);
    const analysis = analyzeSession(session);

    const summary = await summarizeSessionStreaming(
      analysis, apiKey,
      (partial) => {
        res.write(`data: ${JSON.stringify({ type: "partial", partial })}\n\n`);
      },
      answers,
      questions,
    );

    // Cache the final result
    setCachedSummary(cacheKey, summary);

    // Send complete event
    res.write(`data: ${JSON.stringify({ type: "complete", summary })}\n\n`);
    res.end();
  } catch (err: any) {
    const error = err.message?.includes("not found") ? "Session not found" : "Failed to summarize session";
    try {
      res.write(`data: ${JSON.stringify({ type: "error", error })}\n\n`);
      res.end();
    } catch {
      // Connection may have been closed
    }
  }
}

// GET /api/sessions/:projectName/:sessionId/summarize-stream (SSE, no answers)
app.get("/api/sessions/:projectName/:sessionId/summarize-stream", (req, res) => {
  handleSummarizeStream(req, res);
});

// POST /api/sessions/:projectName/:sessionId/summarize-stream (SSE with answers)
app.post("/api/sessions/:projectName/:sessionId/summarize-stream", (req, res) => {
  const { answers, questions } = req.body || {};
  const validatedAnswers: QuestionAnswer[] | undefined = Array.isArray(answers)
    ? answers
        .filter((a: any) => a && typeof a.questionId === "string" && typeof a.answer === "string")
        .map((a: any) => ({ questionId: a.questionId, answer: a.answer.slice(0, 200) }))
    : undefined;
  const validatedQuestions: SessionQuestion[] | undefined = Array.isArray(questions)
    ? questions
        .filter((q: any) => q && typeof q.id === "string" && typeof q.question === "string")
        .map((q: any) => ({
          id: q.id.slice(0, 50),
          category: q.category || "approach",
          question: q.question.slice(0, 200),
          suggestedAnswer: (q.suggestedAnswer || "").slice(0, 120),
        }))
    : undefined;
  handleSummarizeStream(req, res, validatedAnswers, validatedQuestions);
});

// GET /api/sessions/:projectName/:sessionId/summarize
app.get("/api/sessions/:projectName/:sessionId/summarize", async (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    if (!isSafeParam(sessionId) || !isSafeParam(projectName)) {
      res.status(400).json({ error: "Invalid parameters" });
      return;
    }
    const cacheKey = `${projectName}/${sessionId}`;

    // Check disk cache first
    const cached = getCachedSummary(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const apiKey = (req.headers["x-api-key"] as string) || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "No API key. Set one in Settings." });
      return;
    }

    const session = loadSession(projectName, sessionId);
    const analysis = analyzeSession(session);
    const summary = await summarizeSession(analysis, apiKey);

    // Save to disk so it persists across restarts
    setCachedSummary(cacheKey, summary);
    res.json(summary);
  } catch (err: any) {
    if (err.message?.includes("not found")) {
      res.status(404).json({ error: "Session not found" });
    } else {
      console.error("Error summarizing session:", err);
      res.status(500).json({ error: "Failed to summarize session" });
    }
  }
});

// POST /api/sessions/:projectName/:sessionId/generate-questions
// Generates targeted questions from raw analysis (called before AI enhancement)
app.post("/api/sessions/:projectName/:sessionId/generate-questions", async (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    if (!isSafeParam(sessionId) || !isSafeParam(projectName)) {
      res.status(400).json({ error: "Invalid parameters" });
      return;
    }

    const apiKey = (req.headers["x-api-key"] as string) || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "No API key. Set one in Settings." });
      return;
    }

    const session = loadSession(projectName, sessionId);
    const analysis = analyzeSession(session);
    const questions = await generateSessionQuestions(analysis, apiKey);

    res.json({ questions });
  } catch (err: any) {
    if (err.message?.includes("not found")) {
      res.status(404).json({ error: "Session not found" });
    } else {
      console.error("Error generating questions:", err);
      res.status(500).json({ error: "Failed to generate questions" });
    }
  }
});

// POST /api/sessions/:projectName/:sessionId/regenerate
// Accepts { answers }, uses cached questions, calls regenerateWithAnswers, caches result
app.post("/api/sessions/:projectName/:sessionId/regenerate", async (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    if (!isSafeParam(sessionId) || !isSafeParam(projectName)) {
      res.status(400).json({ error: "Invalid parameters" });
      return;
    }

    const apiKey = (req.headers["x-api-key"] as string) || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "No API key. Set one in Settings." });
      return;
    }

    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      res.status(400).json({ error: "answers array is required" });
      return;
    }

    // Validate answers (max 200 chars each)
    const validatedAnswers: QuestionAnswer[] = answers
      .filter((a: any) => a && typeof a.questionId === "string" && typeof a.answer === "string")
      .map((a: any) => ({
        questionId: a.questionId,
        answer: a.answer.slice(0, 200),
      }));

    // Load original summary from cache — questions come from here, not the client
    const cacheKey = `${projectName}/${sessionId}`;
    const originalSummary = getCachedSummary(cacheKey);
    if (!originalSummary) {
      res.status(404).json({ error: "No cached summary found. Run AI analysis first." });
      return;
    }

    const cachedQuestions = originalSummary.questions ?? [];
    if (cachedQuestions.length === 0) {
      res.status(400).json({ error: "No questions found in cached summary." });
      return;
    }

    // Regenerate with answers (using server-cached questions, not client-sent)
    const enrichedFields = await regenerateWithAnswers(
      originalSummary,
      cachedQuestions as SessionQuestion[],
      validatedAnswers,
      apiKey,
    );

    // Merge enriched fields into original summary
    const enrichedSummary: SessionSummary = {
      ...originalSummary,
      ...enrichedFields,
    };

    // Cache separately with __with-answers key
    setCachedSummary(`${cacheKey}__with-answers`, enrichedSummary);

    res.json(enrichedSummary);
  } catch (err: any) {
    console.error("Error regenerating with answers:", err);
    res.status(500).json({ error: "Failed to regenerate" });
  }
});

// ── Share with heyi.am ──────────────────────────────

const HEYI_AM_URL = process.env.HEYI_AM_URL ?? "http://localhost:4000";

// POST /api/share/:projectName/:sessionId
app.post("/api/share/:projectName/:sessionId", async (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    if (!isSafeParam(sessionId) || !isSafeParam(projectName)) {
      res.status(400).json({ error: "Invalid parameters" });
      return;
    }

    // 1. Load session + analysis
    const session = loadSession(projectName, sessionId);
    const analysis = analyzeSession(session);

    // 2. Get or generate AI summary (uses disk cache, optional)
    const cacheKey = `${projectName}/${sessionId}`;
    let summary = getCachedSummary(cacheKey);
    if (!summary) {
      const apiKey = (req.headers["x-api-key"] as string) || process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        summary = await summarizeSession(analysis, apiKey);
        setCachedSummary(cacheKey, summary);
      }
      // No API key — share without AI summary, using raw analysis data
    }

    // 3. Build share payload
    //    v2 fields: context, developer_take, executionPath, patterns
    //    Legacy fields preserved for backward compat: annotation, tutorialSteps, beats
    //    Editor overrides: if the user edited fields in the SessionEditor, prefer those
    //    Validate and sanitize editor input at the boundary
    const editorTitle = typeof req.body?.title === "string" ? req.body.title.slice(0, 80) : undefined;
    const editorContext = typeof req.body?.context === "string" ? req.body.context.slice(0, 200) : undefined;
    const editorExecutionPath = Array.isArray(req.body?.execution_path)
      ? req.body.execution_path
          .filter((s: any) => s && typeof s === "object")
          .slice(0, 10)  // cap at 10 steps max
          .map((s: any) => ({
            title: typeof s.title === "string" ? s.title.slice(0, 80) : "",
            body: typeof s.body === "string" ? s.body.slice(0, 160) : "",
            insight: typeof s.insight === "string" ? s.insight.slice(0, 160) : "",
          }))
      : null;
    const editorHeroImageUrl = typeof req.body?.hero_image_url === "string" ? req.body.hero_image_url : undefined;
    const editorSkills = Array.isArray(req.body?.skills)
      ? req.body.skills
          .filter((s: any) => typeof s === "string")
          .slice(0, 20)  // cap at 20 skills
          .map((s: string) => s.slice(0, 40))
      : null;

    const payload = {
      title: editorTitle || summary?.title || summary?.oneLineSummary || analysis.turns[0]?.userPrompt.slice(0, 100) || "Untitled Session",
      context: editorContext ?? summary?.context ?? null,
      one_line_summary: summary?.oneLineSummary || null,
      narrative: summary?.narrative || null,
      // developer_take: user fills in via editor; annotation for backward compat
      // Sanitize at the boundary — enforce max 300 chars
      developer_take: typeof (req.body?.developer_take ?? req.body?.annotation) === "string"
        ? (req.body?.developer_take ?? req.body?.annotation).slice(0, 300)
        : null,
      annotation: typeof (req.body?.developer_take ?? req.body?.annotation) === "string"
        ? (req.body?.developer_take ?? req.body?.annotation).slice(0, 300)
        : null,
      summary: {
        ogImageUrl: undefined as string | undefined,
        totalTurns: analysis.turns.length,
        toolUsage: summary?.toolUsage || Object.fromEntries(
          Object.entries(analysis.toolUsage).map(([name, usage]) => [name, { count: usage.count }])
        ),
        // v2: executionPath with decisions, reasons, and insights
        // Prefer editor overrides when provided
        executionPath: (editorExecutionPath || summary?.executionPath || []).map((step: any) => ({
          title: step.title,
          body: step.body,
          insight: step.insight,
        })),
        // v2: behavioral patterns extracted from session
        patterns: summary?.patterns || null,
        highlights: (summary?.highlights || []).map((h) => ({
          type: h.type,
          title: h.title,
          description: h.description,
        })),
        // Legacy fields for backward compatibility
        tutorialSteps: (summary?.tutorialSteps || []).map((s) => ({
          title: s.title,
          description: s.description,
          keyTakeaway: s.keyTakeaway,
        })),
        turningPoints: (summary?.turningPoints || []).map((tp) => ({
          type: tp.type,
          title: tp.title,
          description: tp.description,
          turnIndex: tp.turnIndex,
          context: tp.context,
        })),
        beats: (summary?.beats || []).map((b) => ({
          type: b.type,
          title: b.title,
          description: b.description,
          turnIndex: b.turnIndex,
          time: b.time,
          direction: b.direction || null,
          directionNote: b.directionNote || null,
        })),
        // Raw analysis data for no-summary rendering
        prompts: analysis.turns.map((t) => ({
          text: t.userPrompt.slice(0, 300),
          timestamp: t.userTimestamp,
          tools: t.toolCalls.map((tc) => tc.name),
        })),
        filesChanged: analysis.filesChanged.map((f) => ({
          path: f.filePath,
          tool: f.tool,
          count: f.count,
        })),
        funnyMoments: analysis.funnyMoments,
      },
      skills: editorSkills || summary?.skills || summary?.extractedSkills || [],
      source_tool: "claude-code",
      project_name: projectName,
      duration_minutes: analysis.duration.minutes,
      turn_count: analysis.turns.length,
      step_count: editorExecutionPath?.length ?? summary?.executionPath?.length ?? summary?.tutorialSteps?.length ?? 0,
      session_month: new Date(analysis.duration.start).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      hero_image_url: editorHeroImageUrl || undefined,
      session_id: sessionId,
      machine_token: getMachineKey().token,
    };

    // 4. Generate og:image and upload before creating share
    //    (best-effort — share succeeds even if og:image fails)
    const bearerToken = getStoredBearerToken();
    let ogImageUrl: string | undefined;
    try {
      const totalToolCalls = Object.values(payload.summary.toolUsage || {})
        .reduce((sum: number, t: any) => sum + (t.count || 0), 0);

      const ogPng = await generateOgImage({
        title: payload.title,
        durationMinutes: payload.duration_minutes,
        turnCount: payload.turn_count,
        toolCalls: totalToolCalls || undefined,
        fileCount: payload.summary.filesChanged?.length || undefined,
        skills: payload.skills?.slice(0, 6),
      });

      // Upload via the Phoenix upload-image API using multipart form
      const formData = new FormData();
      formData.append(
        "image",
        new Blob([new Uint8Array(ogPng)], { type: "image/png" }),
        `og-image.png`,
      );

      const uploadHeaders: Record<string, string> = {};
      if (bearerToken) {
        uploadHeaders["Authorization"] = `Bearer ${bearerToken}`;
      }

      const uploadRes = await fetch(`${HEYI_AM_URL}/api/upload-image`, {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });

      if (uploadRes.ok) {
        const uploadResult = await uploadRes.json();
        ogImageUrl = uploadResult.url;
        // Store in summary so Phoenix templates can read it
        payload.summary.ogImageUrl = ogImageUrl;
        console.log(`   og:image uploaded: ${ogImageUrl}`);
      } else {
        console.error("og:image upload failed:", await uploadRes.text().catch(() => "unknown"));
      }
    } catch (ogErr) {
      // og:image generation is best-effort — log and continue
      console.error("og:image generation failed:", ogErr);
    }

    // 5. Build headers — Bearer token takes priority, machine_token as fallback
    const body = JSON.stringify(payload);

    const shareHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      // Always send machine_token for linking (Phoenix uses it to associate anonymous shares)
      "X-Machine-Token": getMachineKey().token,
    };

    if (bearerToken) {
      // Authenticated publish — Bearer token, no signature needed
      shareHeaders["Authorization"] = `Bearer ${bearerToken}`;
    } else {
      // Anonymous publish — sign with Ed25519 for backward compat
      shareHeaders["X-Signature"] = signPayload(body);
    }

    // 6. POST to heyi.am
    const response = await fetch(`${HEYI_AM_URL}/api/share`, {
      method: "POST",
      headers: shareHeaders,
      body,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Share server error" }));
      res.status(response.status).json(err);
      return;
    }

    const result = await response.json();

    // 7. Persist share record locally
    saveShareRecord(projectName, sessionId, {
      url: result.url,
      token: result.token,
      deleteToken: result.delete_token,
      title: payload.title,
      ogImageUrl,
      linked: result.linked ?? false,
      deleteCode: result.delete_code ?? null,
    });

    res.json({
      ...result,
      og_image_url: ogImageUrl,
      linked: result.linked ?? false,
      deleteCode: result.delete_code ?? null,
    });

    // Best-effort sync project settings after publish
    const projectSettings = getProjectSettings(projectName);
    syncProjectToServer(projectName, projectSettings);
  } catch (err: any) {
    console.error("Error sharing session:", err);
    if (err.message?.includes("not found")) {
      res.status(404).json({ error: "Session not found" });
    } else {
      res.status(500).json({ error: "Failed to share" });
    }
  }
});

// GET /api/share-status/:projectName/:sessionId
// Check if a session has been shared before, verifying with the server
app.get("/api/share-status/:projectName/:sessionId", async (req, res) => {
  const { projectName, sessionId } = req.params;
  if (!isSafeParam(sessionId) || !isSafeParam(projectName)) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }
  try {
    const shares = JSON.parse(readFileSync(getShareStorePath(), "utf-8"));
    const key = `${projectName}/${sessionId}`;
    const share = shares[key];
    if (!share) {
      res.json({ shared: false });
      return;
    }

    // Verify the share still exists on the server
    try {
      const verify = await fetch(`${HEYI_AM_URL}/api/share/${share.token}`);
      if (verify.ok) {
        const data = await verify.json();
        if (!data.exists) {
          // Share was deleted server-side — clean up local record
          delete shares[key];
          writeFileSync(getShareStorePath(), JSON.stringify(shares, null, 2), "utf-8");
          res.json({ shared: false });
          return;
        }
      }
    } catch {
      // Server unreachable — fall through to local record (offline-friendly)
    }

    // Exclude sensitive fields from the response
    const { deleteToken: _dt, deleteCode: _dc, ...publicShare } = share;
    res.json({ shared: true, ...publicShare });
  } catch {
    res.json({ shared: false });
  }
});

// Local share store (maps session keys to share info)
const SHARE_STORE_PATH = join(homedir(), ".claude", "heyi-am-shares.json");

function getShareStorePath(): string {
  if (!existsSync(SHARE_STORE_PATH)) {
    writeFileSync(SHARE_STORE_PATH, "{}", "utf-8");
  }
  return SHARE_STORE_PATH;
}

function saveShareRecord(projectName: string, sessionId: string, record: any): void {
  const store = JSON.parse(readFileSync(getShareStorePath(), "utf-8"));
  store[`${projectName}/${sessionId}`] = {
    ...record,
    sharedAt: new Date().toISOString(),
  };
  writeFileSync(getShareStorePath(), JSON.stringify(store, null, 2), "utf-8");
}

// DELETE /api/share/:token — proxy delete to heyi.am
app.delete("/api/share/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!isSafeParam(token)) {
      res.status(400).json({ error: "Invalid token" });
      return;
    }
    const deleteToken = req.headers["x-delete-token"] as string;
    if (!deleteToken) {
      res.status(400).json({ error: "Delete token required" });
      return;
    }

    // Verify this share belongs to this machine before proxying
    try {
      const shares = JSON.parse(readFileSync(getShareStorePath(), "utf-8"));
      const isLocal = Object.values(shares).some((s: any) => s.token === token);
      if (!isLocal) {
        res.status(403).json({ error: "Share not found locally" });
        return;
      }
    } catch {
      res.status(403).json({ error: "Cannot verify share ownership" });
      return;
    }

    const response = await fetch(`${HEYI_AM_URL}/api/share/${token}`, {
      method: "DELETE",
      headers: { "X-Delete-Token": deleteToken },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Delete failed" }));
      res.status(response.status).json(err);
      return;
    }

    res.json(await response.json());
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete share" });
  }
});

// GET /api/auth/status — check if the user is authenticated via stored Bearer token
app.get("/api/auth/status", async (_req, res) => {
  const token = getStoredBearerToken();
  if (!token) {
    res.json({ authenticated: false });
    return;
  }

  // Verify token with Phoenix /api/me endpoint
  try {
    const meRes = await fetch(`${HEYI_AM_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (meRes.ok) {
      const user = await meRes.json();
      res.json({
        authenticated: true,
        username: user.username || user.email || null,
      });
      return;
    }
  } catch {
    // Phoenix unreachable — fall back to token-exists check (offline-friendly)
  }

  // Token exists but could not verify — report as authenticated with no username
  // (better UX than falsely reporting unauthenticated when offline)
  res.json({ authenticated: true, username: null });
});

// POST /api/auth/connect — start device auth flow from the React UI
// Opens browser to heyi.am/device, polls for completion, stores token locally
app.post("/api/auth/connect", async (_req, res) => {
  try {
    // Step 1: Request device authorization from Phoenix
    const authRes = await fetch(`${HEYI_AM_URL}/api/device/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!authRes.ok) {
      res.status(502).json({ error: "Could not reach heyi.am" });
      return;
    }

    const { device_code, user_code, verification_uri } = await authRes.json();

    // Step 2: Open browser to the auth page
    const authUrl = `${verification_uri}?code=${user_code}`;
    try {
      const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      execFile(openCmd, [authUrl], () => {});
    } catch { /* browser didn't open */ }

    // Step 3: Poll for completion (max 2 minutes from the React UI)
    const pollInterval = 3000;
    const maxAttempts = 40;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollInterval));

      try {
        const tokenRes = await fetch(`${HEYI_AM_URL}/api/device/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code }),
        });

        if (!tokenRes.ok) continue;
        const data = await tokenRes.json();

        if (data.status === "authorized") {
          // Store the token locally
          const tokenPath = join(homedir(), ".claude", "heyi-am-token");
          const dir = join(homedir(), ".claude");
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(tokenPath, data.token, "utf-8");
          chmodSync(tokenPath, 0o600);

          // Batch sync all project settings to server on login
          try {
            const projectStore = JSON.parse(readFileSync(getProjectStorePath(), "utf-8"));
            for (const [projName, projSettings] of Object.entries(projectStore)) {
              syncProjectToServer(projName, projSettings as Record<string, unknown>);
            }
          } catch { /* silent */ }

          res.json({
            connected: true,
            username: data.user?.username || null,
          });
          return;
        }

        if (data.status === "expired") {
          res.json({ connected: false, error: "Authorization expired" });
          return;
        }
      } catch { /* keep polling */ }
    }

    res.json({ connected: false, error: "Timed out waiting for authorization" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to start auth flow" });
  }
});

// POST /api/screenshot — capture a URL screenshot for hero image
app.post("/api/screenshot", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "URL is required" });
      return;
    }

    // URL validation — prevent SSRF
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      res.status(400).json({ error: "Only http/https URLs are allowed" });
      return;
    }

    // Block private/reserved ranges including AWS IMDS, IPv6-mapped IPv4
    if (/^(localhost|127\.|0\.0\.0\.0|::1|::ffff:|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fc00:|fd|fe80:)/i.test(parsed.hostname)) {
      res.status(400).json({ error: "Private addresses are not allowed" });
      return;
    }

    const filePath = await captureScreenshot(url);
    res.json({ filePath, url });
  } catch (err: any) {
    console.error("Screenshot error:", err);
    res.status(500).json({ error: "Failed to capture screenshot" });
  }
});

// ── Project settings store ──────────────────────

const PROJECT_STORE_PATH = join(homedir(), ".claude", "heyi-am-projects.json");

function getProjectStorePath(): string {
  if (!existsSync(PROJECT_STORE_PATH)) {
    writeFileSync(PROJECT_STORE_PATH, "{}", "utf-8");
  }
  return PROJECT_STORE_PATH;
}

function getProjectSettings(projectName: string): Record<string, unknown> {
  const store = JSON.parse(readFileSync(getProjectStorePath(), "utf-8"));
  return store[projectName] || {};
}

function saveProjectSettings(projectName: string, settings: Record<string, unknown>): void {
  const store = JSON.parse(readFileSync(getProjectStorePath(), "utf-8"));
  store[projectName] = { ...store[projectName], ...settings, updatedAt: new Date().toISOString() };
  writeFileSync(getProjectStorePath(), JSON.stringify(store, null, 2), "utf-8");
}

async function syncProjectToServer(projectName: string, settings: Record<string, unknown>): Promise<void> {
  const token = getStoredBearerToken();
  if (!token) return;

  try {
    const serverUrl = HEYI_AM_URL;
    await fetch(`${serverUrl}/api/projects/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        project_key: projectName,
        display_name: settings.displayName ?? settings.display_name,
        description: settings.description,
        visible: settings.visible,
        featured_quote: settings.featuredQuote ?? settings.featured_quote,
        featured_sessions: settings.featuredSessions ?? settings.featured_sessions
      })
    });
  } catch {
    // Silent — local save succeeded, server sync is best-effort
  }
}

// GET /api/projects/:projectName — project detail with stats and share status
app.get("/api/projects/:projectName", (req, res) => {
  const { projectName } = req.params;
  if (!isSafeParam(projectName)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }

  try {
    const projects = listProjects();
    const project = projects.find((p) => p.name === projectName);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Load share store to check publish status
    const shares = JSON.parse(readFileSync(getShareStorePath(), "utf-8"));

    // Compute aggregate stats from all sessions
    let totalDuration = 0;
    const sessions = project.sessions.map((s) => {
      const duration = getSessionDuration(s.filePath);
      totalDuration += duration;
      const shareKey = `${projectName}/${s.id}`;
      const shareInfo = shares[shareKey] || null;
      return {
        id: s.id,
        date: s.lastModified.toISOString(),
        fileSize: s.fileSize,
        duration,
        firstPrompt: getFirstPrompt(s.filePath),
        shared: !!shareInfo,
        shareUrl: shareInfo?.url || null,
        shareTitle: shareInfo?.title || null,
      };
    });

    const settings = getProjectSettings(projectName);

    res.json({
      name: project.name,
      path: project.path,
      displayName: project.displayName,
      sessions,
      stats: {
        totalSessions: sessions.length,
        publishedSessions: sessions.filter((s) => s.shared).length,
        totalDuration,
      },
      settings,
    });
  } catch (err) {
    console.error("Error loading project:", err);
    res.status(500).json({ error: "Failed to load project" });
  }
});

// PUT /api/projects/:projectName/settings — save project settings
app.put("/api/projects/:projectName/settings", (req, res) => {
  const { projectName } = req.params;
  if (!isSafeParam(projectName)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }

  try {
    const { displayName, description, visible, featuredSessions, featuredQuote } = req.body;

    const settings: Record<string, unknown> = {};
    if (displayName !== undefined) settings.displayName = String(displayName).slice(0, 80);
    if (description !== undefined) settings.description = String(description).slice(0, 300);
    if (visible !== undefined) settings.visible = !!visible;
    if (featuredSessions !== undefined && Array.isArray(featuredSessions)) {
      settings.featuredSessions = featuredSessions.slice(0, 6).map(String);
    }
    if (featuredQuote !== undefined) settings.featuredQuote = String(featuredQuote).slice(0, 300);

    saveProjectSettings(projectName, settings);
    // Sync to server (best-effort, don't block response)
    syncProjectToServer(projectName, getProjectSettings(projectName));
    res.json({ ok: true, settings: getProjectSettings(projectName) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// ── Multi-tool import (Step 9) ──────────────────

// GET /api/import/cursor — list available Cursor workspaces
app.get("/api/import/cursor", (_req, res) => {
  try {
    const workspaces = listCursorWorkspaces();
    res.json({ workspaces: workspaces.map((w) => ({ path: w })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/import/cursor/:index — list conversations in a workspace
app.get("/api/import/cursor/:index", async (req, res) => {
  try {
    const workspaces = listCursorWorkspaces();
    const idx = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= workspaces.length) {
      res.status(400).json({ error: "Invalid workspace index" });
      return;
    }
    const conversations = await parseCursorWorkspace(workspaces[idx]);
    res.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messages.length,
        createdAt: c.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/paste — import from pasted transcript
app.post("/api/import/paste", (req, res) => {
  try {
    const { text, sourceTool } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    const entries = parseTranscript(text, sourceTool || "paste");
    res.json({
      entries: entries.length,
      preview: entries.slice(0, 3).map((e) => ({
        role: e.type,
        content: (typeof e.message?.content === "string" ? e.message.content : "").slice(0, 100),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload-image — proxy image upload to Phoenix with Bearer auth
app.post("/api/upload-image", async (req, res) => {
  const token = getStoredBearerToken();
  if (!token) {
    res.status(401).json({ error: "Not authenticated. Run 'ccs login' first." });
    return;
  }

  try {
    // Express hasn't parsed the body (no multer), so collect raw chunks
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      try {
        const body = Buffer.concat(chunks);
        const response = await fetch(`${HEYI_AM_URL}/api/upload-image`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": req.headers["content-type"] || "multipart/form-data",
          },
          body,
        });
        const result = await response.json();
        res.status(response.status).json(result);
      } catch {
        res.status(500).json({ error: "Failed to upload image" });
      }
    });
  } catch {
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// Serve built React app as static files
const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "../app/dist");
if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  // Express v5 wildcard syntax: catch-all for SPA routing
  app.get("/{*path}", (_req, res) => {
    res.sendFile(join(staticDir, "index.html"));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Claude Code Summary running on http://${HOST}:${PORT}`);
});
