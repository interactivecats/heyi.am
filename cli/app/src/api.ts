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

export async function enhanceSession(
  projectName: string,
  sessionId: string,
): Promise<EnhancementResult> {
  const res = await fetch(
    `${API_BASE}/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/enhance`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`Enhancement failed: ${res.status}`);
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
