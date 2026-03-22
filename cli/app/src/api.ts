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
}

export async function triageProject(dirName: string): Promise<TriageResult> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(dirName)}/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Triage failed' } }));
    throw new Error(err.error?.message ?? 'Triage failed');
  }
  return res.json();
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
