import type { Project, ProjectDetail, ProjectSettings, SessionAnalysis, SessionSummary, SessionQuestion, QuestionAnswer, CaseStudy } from "./types";

const BASE = "/api";

function getApiKey(): string | null {
  return localStorage.getItem("anthropic_api_key");
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function fetchProjectDetail(projectName: string): Promise<ProjectDetail> {
  const res = await fetch(`${BASE}/projects/${projectName}`);
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

export async function saveProjectSettings(
  projectName: string,
  settings: Partial<ProjectSettings>
): Promise<ProjectSettings> {
  const res = await fetch(`${BASE}/projects/${projectName}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save project settings");
  const data = await res.json();
  return data.settings;
}

export async function fetchSession(
  projectName: string,
  sessionId: string
): Promise<SessionAnalysis> {
  const res = await fetch(`${BASE}/sessions/${projectName}/${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch session");
  return res.json();
}

export async function fetchSummary(
  projectName: string,
  sessionId: string
): Promise<SessionSummary> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(
    `${BASE}/sessions/${projectName}/${sessionId}/summarize`,
    { headers }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to fetch summary");
  }
  return res.json();
}

// ── Streaming summarization ─────────────────────

export interface StreamEvent {
  type: "partial" | "complete" | "error";
  partial?: Partial<SessionSummary>;
  summary?: SessionSummary;
  error?: string;
}

/**
 * Stream AI summarization via SSE. Calls onEvent for each partial/complete/error.
 * Optionally pass answers + questions to weave dev's voice into the summary.
 * Returns a cleanup function to abort the stream.
 */
export function streamSummary(
  projectName: string,
  sessionId: string,
  onEvent: (event: StreamEvent) => void,
  answers?: QuestionAnswer[],
  questions?: SessionQuestion[],
): () => void {
  const apiKey = getApiKey();
  const url = `${BASE}/sessions/${projectName}/${sessionId}/summarize-stream`;
  const hasAnswers = answers && answers.length > 0;

  const controller = new AbortController();

  const fetchOptions: RequestInit = {
    signal: controller.signal,
    ...(hasAnswers
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-api-key": apiKey } : {}),
          },
          body: JSON.stringify({ answers, questions }),
        }
      : {
          headers: apiKey ? { "x-api-key": apiKey } : {},
        }),
  };

  fetch(url, fetchOptions).then(async (res) => {
    if (!res.ok || !res.body) {
      onEvent({ type: "error", error: "Failed to start summarization" });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6)) as StreamEvent;
            onEvent(event);
          } catch { /* skip unparseable lines */ }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== "AbortError") {
      onEvent({ type: "error", error: err.message || "Stream failed" });
    }
  });

  return () => controller.abort();
}

/**
 * Check if a cached AI summary exists (without triggering AI).
 */
export async function getCachedSummary(
  projectName: string,
  sessionId: string,
): Promise<SessionSummary | null> {
  const res = await fetch(`${BASE}/sessions/${projectName}/${sessionId}/summary-cache`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.cached ? data.summary : null;
}

/**
 * Clear the cached AI summary for a session so it re-runs fresh.
 */
export async function clearSummaryCache(
  projectName: string,
  sessionId: string,
): Promise<void> {
  await fetch(`${BASE}/sessions/${projectName}/${sessionId}/summary-cache`, {
    method: "DELETE",
  });
}

/**
 * Generate targeted questions from raw session analysis.
 * Called before AI enhancement so the dev can answer first.
 */
export async function generateQuestions(
  projectName: string,
  sessionId: string,
): Promise<SessionQuestion[]> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`${BASE}/sessions/${projectName}/${sessionId}/generate-questions`, {
    method: "POST",
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to generate questions");
  }

  const data = await res.json();
  return data.questions;
}

// ── Auth status ─────────────────────────────────

export interface AuthStatus {
  authenticated: boolean;
  username?: string | null;
}

/**
 * Check whether the local CLI is authenticated with heyi.am.
 */
export interface ConnectResult {
  connected: boolean;
  username?: string | null;
  error?: string;
}

/**
 * Start the device auth flow — opens browser, polls for completion.
 * This is a long-running request (up to 2 min).
 */
export async function startAuthConnect(): Promise<ConnectResult> {
  const res = await fetch(`${BASE}/auth/connect`, { method: "POST" });
  if (!res.ok) return { connected: false, error: "Failed to start auth" };
  return res.json();
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  try {
    const res = await fetch(`${BASE}/auth/status`);
    if (!res.ok) return { authenticated: false };
    return res.json();
  } catch {
    return { authenticated: false };
  }
}

// ── Sharing ─────────────────────────────────────

export interface ShareResult {
  url: string;
  delete_token: string;
  token: string;
  status: "created" | "updated";
  shared_at: string;
  linked: boolean;
  deleteCode: string | null;
}

export interface ShareStatus {
  shared: boolean;
  url?: string;
  token?: string;
  deleteToken?: string;
  title?: string;
  sharedAt?: string;
}

/**
 * Share a session via the local server.
 * The local server handles: analysis, summary, signing, and POSTing to heyi.am.
 */
export async function shareSession(
  projectName: string,
  sessionId: string,
  annotation?: string
): Promise<ShareResult> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`${BASE}/share/${projectName}/${sessionId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ annotation: annotation || null }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to share");
  }

  return res.json();
}

/**
 * Share a session with full edited case study data.
 * Sends the user-edited fields alongside the session reference.
 */
export async function shareSessionWithEdits(
  projectName: string,
  sessionId: string,
  caseStudy: Partial<CaseStudy>
): Promise<ShareResult> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`${BASE}/share/${projectName}/${sessionId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      developer_take: caseStudy.developer_take || null,
      title: caseStudy.title,
      context: caseStudy.context,
      execution_path: caseStudy.execution_path,
      skills: caseStudy.skills,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to share");
  }

  return res.json();
}

/**
 * Check if a session has been shared before.
 */
export async function getShareStatus(
  projectName: string,
  sessionId: string
): Promise<ShareStatus> {
  const res = await fetch(`${BASE}/share-status/${projectName}/${sessionId}`);
  if (!res.ok) return { shared: false };
  return res.json();
}

/**
 * Delete a share.
 */
export async function deleteShare(token: string, deleteToken: string): Promise<void> {
  const res = await fetch(`${BASE}/share/${token}`, {
    method: "DELETE",
    headers: { "X-Delete-Token": deleteToken },
  });
  if (!res.ok) throw new Error("Failed to delete share");
}
