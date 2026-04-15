/**
 * Render data types for static HTML generation.
 *
 * These interfaces define the data shapes that the CLI render functions
 * accept. They are intentionally separate from the interactive UI types
 * in `app/src/types.ts` — the render pipeline owns its own contract.
 */

import type { AgentSummary } from '../routes/context.js';

/**
 * Output target for the render pipeline.
 *
 * - `'fragment'`: body HTML only, no `<html>`/`<head>` shell. Used when Phoenix
 *   wraps the output for hosted serving.
 * - `'static'`: full standalone pages wired together as a self-contained
 *   static site directory that opens without a server (file://).
 */
export type RenderTarget = 'fragment' | 'static';

export interface UserInfo {
  username: string;
  accent: string;
}

export interface PortfolioUser extends UserInfo {
  displayName: string;
  bio: string;
  location: string;
  status: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  twitterHandle?: string;
  websiteUrl?: string;
  resumeUrl?: string;
}

export interface PortfolioProject {
  slug: string;
  title: string;
  narrative: string;
  totalSessions: number;
  totalLoc: number;
  totalDurationMinutes: number;
  totalAgentDurationMinutes?: number;
  totalFilesChanged: number;
  skills: string[];
  sourceCounts?: Array<{ tool: string; count: number }>;
  publishedCount: number;
  /** Lightweight session records for activity charts */
  sessions?: Array<{ date: string; loc: number; durationMinutes: number }>;
}

export interface PortfolioRenderData {
  user: PortfolioUser;
  projects: PortfolioProject[];
  /** Aggregate human duration across all projects (minutes) */
  totalDurationMinutes: number;
  /** Aggregate agent duration across all projects (minutes) */
  totalAgentDurationMinutes?: number;
  /** Aggregate lines changed across all projects */
  totalLoc: number;
  /** Aggregate sessions across all projects */
  totalSessions: number;
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
  totalTokens?: number;
}

export interface SessionCard {
  token: string;
  slug: string;
  title: string;
  devTake: string;
  durationMinutes: number;
  wallClockMinutes?: number;
  turns: number;
  locChanged: number;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  skills: string[];
  recordedAt: string;
  sourceTool: string;
  agentSummary?: AgentSummary;
}

export interface ProjectRenderData {
  user: UserInfo;
  project: ProjectDetail;
  /** Curated sessions for the card grid */
  sessions: SessionCard[];
  /** All sessions for work timeline and growth chart (falls back to sessions if not set) */
  allSessions?: SessionCard[];
  /** Base URL prefix for session links (e.g. "/ben/my-project" or "./sessions"). */
  sessionBaseUrl?: string;
  /** Suffix appended to session links (e.g. ".html" for static export). */
  sessionSuffix?: string;
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
  wallClockMinutes?: number;
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
  agentSummary?: AgentSummary;
}

export interface SessionRenderData {
  user: UserInfo;
  projectSlug?: string;
  session: SessionDetail;
}
