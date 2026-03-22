import type { Session } from './types';

const API_BASE = '/api';

export interface ApiProject {
  name: string;
  dirName: string;
  sessionCount: number;
  description: string;
  totalLoc: number;
  totalDuration: number;
  totalFiles: number;
  skills: string[];
  dateRange: string;
  lastSessionDate: string;
  isPublished?: boolean;
  publishedSessionCount?: number;
  publishedSessions?: string[];
  enhancedAt?: string | null;
}

export async function fetchProjects(): Promise<ApiProject[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
  const data = await res.json();
  return data.projects;
}

export async function fetchSessions(projectDirName: string): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectDirName)}/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  const data = await res.json();
  return data.sessions;
}

export async function fetchSession(projectDirName: string, sessionId: string): Promise<Session> {
  const res = await fetch(
    `${API_BASE}/projects/${encodeURIComponent(projectDirName)}/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
  const data = await res.json();
  return data.session;
}

// Triage types
export interface TriageResult {
  selected: Array<{ sessionId: string; reason: string }>;
  skipped: Array<{ sessionId: string; reason: string }>;
  /** True when all sessions were auto-selected (small project, < 5 sessions) */
  autoSelected?: boolean;
  /** Method used for triage: 'llm', 'scoring', or 'auto-select' */
  triageMethod?: string;
}

export type TriageEvent =
  | { type: 'loading_stats'; sessionId: string; index: number; total: number }
  | { type: 'scanning'; total: number }
  | { type: 'hard_floor'; sessionId: string; title: string; passed: boolean; reason?: string }
  | { type: 'extracting_signals'; sessionId: string; title: string }
  | { type: 'signals_done'; sessionId: string }
  | { type: 'llm_ranking'; sessionCount: number }
  | { type: 'scoring_fallback'; sessionCount: number }
  | { type: 'done'; selected: number; skipped: number }
  | { type: 'error'; message: string }
  | { type: 'result'; selected: Array<{ sessionId: string; reason: string }>; skipped: Array<{ sessionId: string; reason: string }> };

// ── Triage SSE stream ────────────────────────────────────────────

export function triageProject(
  dirName: string,
  onEvent: (event: TriageEvent) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/projects/${encodeURIComponent(dirName)}/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Triage failed' } }));
        throw new Error(err.error?.message ?? 'Triage failed');
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            onEvent(JSON.parse(json) as TriageEvent);
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    })
    .catch((err) => {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: (err as Error).message });
      }
    });

  return controller;
}

export interface EnhanceStatus {
  mode: 'local' | 'proxy' | 'none' | 'unknown';
  remaining: number | null;
  message?: string;
}

export async function fetchEnhanceStatus(): Promise<EnhanceStatus> {
  try {
    const res = await fetch(`${API_BASE}/enhance/status`);
    if (!res.ok) return { mode: 'unknown', remaining: null };
    return await res.json();
  } catch {
    return { mode: 'unknown', remaining: null };
  }
}

export interface AuthStatus {
  authenticated: boolean;
  username?: string;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  try {
    const res = await fetch(`${API_BASE}/auth/status`);
    if (!res.ok) return { authenticated: false };
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}

export interface DeviceCodeInfo {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function startDeviceAuth(): Promise<DeviceCodeInfo> {
  const res = await fetch(`${API_BASE}/auth/login`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to start auth: ${res.status}`);
  return res.json();
}

export async function pollDeviceAuth(deviceCode: string): Promise<AuthStatus> {
  const res = await fetch(`${API_BASE}/auth/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_code: deviceCode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'poll_failed' }));
    if (data.error === 'authorization_pending') {
      return { authenticated: false };
    }
    throw new Error(data.error || 'Poll failed');
  }
  return res.json();
}

// ── Project Enhance types ────────────────────────────────────────

export interface ProjectEnhanceResult {
  narrative: string;
  arc: Array<{ phase: number; title: string; description: string }>;
  skills: string[];
  timeline: Array<{
    period: string;
    label: string;
    sessions: Array<{
      sessionId: string;
      title: string;
      featured: boolean;
      tag?: string;
    }>;
  }>;
  questions: Array<{
    id: string;
    category: 'pattern' | 'architecture' | 'evolution';
    question: string;
    context: string;
  }>;
}

export type EnhanceEventType =
  | { type: 'session_progress'; sessionId: string; title: string; status: 'enhancing' | 'done' | 'skipped' | 'failed'; detail?: string; skills?: string[] }
  | { type: 'project_enhance'; status: 'generating' }
  | { type: 'narrative_chunk'; text: string }
  | { type: 'cached'; enhancedAt: string }
  | { type: 'stale_cache'; previousEnhancedAt: string }
  | { type: 'done'; result: ProjectEnhanceResult }
  | { type: 'error'; message: string };

// ── Project Enhance SSE stream ───────────────────────────────────

export function enhanceProject(
  dirName: string,
  selectedSessionIds: string[],
  skippedSessions: Array<{ title: string; duration: number; loc: number }>,
  onEvent: (event: EnhanceEventType) => void,
  force?: boolean,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/projects/${encodeURIComponent(dirName)}/enhance-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedSessionIds, skippedSessions, force }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Enhance failed' } }));
        onEvent({ type: 'error', message: err.error?.message ?? 'Enhance failed' });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onEvent({ type: 'error', message: 'No response stream' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            onEvent(JSON.parse(json) as EnhanceEventType);
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    })
    .catch((err) => {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: (err as Error).message });
      }
    });

  return controller;
}

// ── Project Enhance Cache ────────────────────────────────────────

export interface ProjectEnhanceCacheResponse {
  fingerprint: string;
  enhancedAt: string;
  selectedSessionIds: string[];
  result: ProjectEnhanceResult;
  isFresh: boolean;
}

export async function fetchProjectEnhanceCache(dirName: string): Promise<ProjectEnhanceCacheResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(dirName)}/enhance-cache`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveProjectEnhanceLocally(
  dirName: string,
  selectedSessionIds: string[],
  result: ProjectEnhanceResult,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(dirName)}/enhance-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedSessionIds, result }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Narrative Refinement ─────────────────────────────────────────

export interface RefineAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export interface RefineResult {
  narrative: string;
  timeline: ProjectEnhanceResult['timeline'];
}

export async function refineNarrative(
  dirName: string,
  draftNarrative: string,
  draftTimeline: ProjectEnhanceResult['timeline'],
  answers: RefineAnswer[],
): Promise<RefineResult> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(dirName)}/refine-narrative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftNarrative, draftTimeline, answers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Refine failed' } }));
    throw new Error(err.error?.message ?? 'Refine failed');
  }
  return res.json();
}

// ── Publish ─────────────────────────────────────────────────────

export interface PublishProjectPayload {
  title: string;
  slug: string;
  narrative: string;
  repoUrl: string;
  projectUrl: string;
  timeline: ProjectEnhanceResult['timeline'];
  skills: string[];
  totalSessions: number;
  totalLoc: number;
  totalDurationMinutes: number;
  totalFilesChanged: number;
  skippedSessions: Array<{ title: string; duration: number; loc: number; reason: string }>;
  selectedSessionIds: string[];
}

export interface PublishSessionStatus {
  sessionId: string;
  status: 'publishing' | 'published' | 'failed';
  error?: string;
}

export type PublishEvent =
  | { type: 'project'; status: 'creating' | 'created' | 'failed'; error?: string; fatal?: boolean; projectId?: number; slug?: string }
  | { type: 'session'; sessionId: string; status: 'publishing' | 'published' | 'failed'; error?: string }
  | { type: 'done'; projectUrl: string; uploaded: number; failed: number; failedSessions: Array<{ sessionId: string; error: string }> }
  | { type: 'error'; error: string };

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

export function publishProject(
  dirName: string,
  payload: PublishProjectPayload,
  onEvent: (event: PublishEvent) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/projects/${encodeURIComponent(dirName)}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (res.status === 401) {
        throw new AuthRequiredError();
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Publish failed' } }));
        onEvent({ type: 'error', error: err.error?.message ?? 'Publish failed' });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onEvent({ type: 'error', error: 'No response stream' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            onEvent(JSON.parse(json) as PublishEvent);
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    })
    .catch((err) => {
      if ((err as Error).name === 'AbortError') return;
      if (err instanceof AuthRequiredError) {
        onEvent({ type: 'error', error: 'AUTH_REQUIRED' });
      } else {
        onEvent({ type: 'error', error: (err as Error).message });
      }
    });

  return controller;
}
