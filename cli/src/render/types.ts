/**
 * Render data types for static HTML generation.
 *
 * These interfaces define the data shapes that the CLI render functions
 * accept. They are intentionally separate from the interactive UI types
 * in `app/src/types.ts` — the render pipeline owns its own contract.
 */

export interface UserInfo {
  username: string;
  accent: string;
}

export interface PortfolioUser extends UserInfo {
  displayName: string;
  bio: string;
  location: string;
  status: string;
}

export interface PortfolioProject {
  slug: string;
  title: string;
  narrative: string;
  totalSessions: number;
  totalLoc: number;
  totalDurationMinutes: number;
  totalFilesChanged: number;
  skills: string[];
  publishedCount: number;
}

export interface PortfolioRenderData {
  user: PortfolioUser;
  projects: PortfolioProject[];
}

export interface ProjectTimeline {
  period: string;
  label: string;
  sessions: Array<Record<string, unknown>>;
}

export interface ProjectDetail {
  slug: string;
  title: string;
  narrative: string;
  repoUrl?: string;
  projectUrl?: string;
  screenshotUrl?: string;
  timeline: ProjectTimeline[];
  skills: string[];
  totalSessions: number;
  totalLoc: number;
  totalDurationMinutes: number;
  totalAgentDurationMinutes?: number;
  totalFilesChanged: number;
}

export interface SessionCard {
  token: string;
  slug: string;
  title: string;
  devTake: string;
  durationMinutes: number;
  turns: number;
  locChanged: number;
  filesChanged: number;
  skills: string[];
  recordedAt: string;
  sourceTool: string;
  agentSummary?: Record<string, unknown>;
}

export interface ProjectRenderData {
  user: UserInfo;
  project: ProjectDetail;
  sessions: SessionCard[];
}

export interface Beat {
  stepNumber: number;
  title: string;
  body: string;
}

export interface QaPair {
  question: string;
  answer: string;
}

export interface ToolBreakdownEntry {
  tool: string;
  count: number;
}

export interface FileEntry {
  path: string;
  additions: number;
  deletions: number;
}

export interface SessionDetail {
  token: string;
  title: string;
  devTake: string;
  context?: string;
  durationMinutes: number;
  turns: number;
  filesChanged: number;
  locChanged: number;
  skills: string[];
  narrative?: string;
  beats?: Beat[];
  qaPairs?: QaPair[];
  highlights?: string[];
  toolBreakdown?: ToolBreakdownEntry[];
  topFiles?: FileEntry[];
  recordedAt: string;
  sourceTool: string;
  template: string;
  agentSummary?: Record<string, unknown>;
}

export interface SessionRenderData {
  user: UserInfo;
  projectSlug?: string;
  session: SessionDetail;
}
