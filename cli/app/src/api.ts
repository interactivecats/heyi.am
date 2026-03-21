import type { Session } from './types';

const API_BASE = '/api';

export interface ApiProject {
  name: string;
  dirName: string;
  sessionCount: number;
  description: string;
}

export async function fetchProjects(): Promise<ApiProject[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
  const data = await res.json();
  return data.projects;
}

export async function fetchSessions(projectName: string): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectName)}/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  const data = await res.json();
  return data.sessions;
}

export async function fetchSession(projectName: string, sessionId: string): Promise<Session> {
  const res = await fetch(
    `${API_BASE}/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
  const data = await res.json();
  return data.session;
}

// Enhancement types matching cli/src/summarize.ts
export interface EnhancementQuestion {
  text: string;
  suggestedAnswer: string;
}

export interface EnhancementStep {
  stepNumber: number;
  title: string;
  body: string;
}

export interface EnhancementResult {
  title: string;
  developerTake: string;
  context: string;
  skills: string[];
  questions: EnhancementQuestion[];
  executionSteps: EnhancementStep[];
}

export type StreamEvent =
  | { type: 'title'; data: string }
  | { type: 'context'; data: string }
  | { type: 'developer_take'; data: string }
  | { type: 'skills'; data: string[] }
  | { type: 'question'; data: EnhancementQuestion }
  | { type: 'step'; data: EnhancementStep }
  | { type: 'done'; data: EnhancementResult }
  | { type: 'error'; data: string };

export class EnhanceError extends Error {
  code: string;
  resetsAt?: string;

  constructor(code: string, message: string, resetsAt?: string) {
    super(message);
    this.name = 'EnhanceError';
    this.code = code;
    this.resetsAt = resetsAt;
  }
}

export async function enhanceSession(
  projectName: string,
  sessionId: string,
): Promise<EnhancementResult> {
  const res = await fetch(
    `${API_BASE}/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/enhance`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: { code: 'ENHANCE_FAILED', message: `Enhancement failed: ${res.status}` } }));
    const err = errBody.error ?? {};
    throw new EnhanceError(err.code ?? 'ENHANCE_FAILED', err.message ?? `Enhancement failed: ${res.status}`, err.resets_at);
  }
  const data = await res.json();
  return data.result;
}

export function enhanceSessionStream(
  projectName: string,
  sessionId: string,
): EventSource {
  return new EventSource(
    `${API_BASE}/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/enhance/stream`,
  );
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

export interface PublishResult {
  token: string;
  url: string;
  sealed: boolean;
  content_hash: string;
}

export async function publishSession(session: Record<string, unknown>): Promise<PublishResult> {
  const res = await fetch(`${API_BASE}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Publish failed' }));
    throw new Error(err.error || err.errors?.join(', ') || 'Publish failed');
  }
  return res.json();
}

export async function fetchAllSessions(): Promise<{ projects: ApiProject[]; sessions: Session[] }> {
  const projects = await fetchProjects();

  // Fetch sessions for all projects in parallel (not sequentially)
  const results = await Promise.allSettled(
    projects.map((p) => fetchSessions(p.dirName)),
  );

  const allSessions: Session[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allSessions.push(...result.value);
    }
  }

  return { projects, sessions: allSessions };
}
