// Re-export all types so existing `import { … } from '../api'` still works
export type {
  Project,
  Session,
  SourceAuditResult,
  ArchiveStats,
  ProjectDetail,
  BoundaryConfig,
  EnhanceStatus,
  ApiKeyStatus,
  AuthStatus,
  TriageEvent,
  TriageResult,
  EnhanceEvent,
  ProjectEnhanceResult,
  ProjectEnhanceCacheResponse,
  UploadPayload,
  UploadEvent,
  RefineAnswer,
  RefineResult,
  ExecutionStep,
  ToolUsage,
  FileChange,
  TurnEvent,
  AgentChild,
  QaPair,
  SourceInfo,
  ProjectBoundaries,
  SearchResult,
  SearchResponse,
  ContextExportResponse,
  DashboardResponse,
  DashboardProject,
  SyncProgressEvent,
  TranscriptResponse,
  TranscriptMessage,
  TranscriptBlock,
  TranscriptTextBlock,
  TranscriptThinkingBlock,
  TranscriptToolCallBlock,
} from './types'

import type {
  Project,
  Session,
  SourceAuditResult,
  ArchiveStats,
  ProjectDetail,
  BoundaryConfig,
  EnhanceStatus,
  ApiKeyStatus,
  AuthStatus,
  TriageEvent,
  EnhanceEvent,
  ProjectEnhanceResult,
  ProjectEnhanceCacheResponse,
  UploadPayload,
  UploadEvent,
  RefineAnswer,
  RefineResult,
  SearchResponse,
  ContextExportResponse,
  DashboardResponse,
  SyncProgressEvent,
  TranscriptResponse,
} from './types'

const API_BASE = '/api'

function enc(s: string) {
  return encodeURIComponent(s)
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `POST ${path} failed` } }))
    throw new Error(err.error?.message ?? `POST ${path} failed: ${res.status}`)
  }
  return res.json()
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `PUT ${path} failed` } }))
    throw new Error(err.error?.message ?? `PUT ${path} failed: ${res.status}`)
  }
  return res.json()
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `PATCH ${path} failed` } }))
    throw new Error(err.error?.message ?? `PATCH ${path} failed: ${res.status}`)
  }
  return res.json()
}

function streamSSE<E>(
  path: string,
  body: unknown,
  onEvent: (event: E) => void,
): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (res.status === 401) {
        onEvent({ type: 'error', message: 'AUTH_REQUIRED' } as E)
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }))
        onEvent({ type: 'error', message: err.error?.message ?? 'Request failed' } as E)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        onEvent({ type: 'error', message: 'No response stream' } as E)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (!json) continue
          try {
            onEvent(JSON.parse(json) as E)
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    })
    .catch((err) => {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: (err as Error).message } as E)
      }
    })

  return controller
}

// ── API Functions ──────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const data = await get<{ projects: Project[] }>('/projects')
  return data.projects
}

export async function fetchSessions(dirName: string): Promise<Session[]> {
  const data = await get<{ sessions: Session[] }>(`/projects/${enc(dirName)}/sessions`)
  return data.sessions
}

export async function fetchSession(dirName: string, id: string): Promise<Session> {
  const data = await get<{ session: Session }>(`/projects/${enc(dirName)}/sessions/${enc(id)}`)
  return data.session
}

export async function fetchSourceAudit(): Promise<SourceAuditResult> {
  return get<SourceAuditResult>('/source-audit')
}

export async function fetchArchiveStats(): Promise<ArchiveStats> {
  return get<ArchiveStats>('/archive/stats')
}

export interface LocalDataSummary {
  dbPath: string
  daemon: {
    installed: boolean
    binaryPath: string
  }
}

export async function fetchLocalData(): Promise<LocalDataSummary> {
  return get<LocalDataSummary>('/local-data')
}

export async function syncArchive(): Promise<{ archived: number; alreadyArchived: number }> {
  return post<{ archived: number; alreadyArchived: number }>('/archive/sync')
}

export async function exportArchive(): Promise<void> {
  const res = await fetch(`${API_BASE}/archive/export`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Export failed' }))
    throw new Error(err.error ?? `Export failed: ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'heyiam-archive.tar.gz'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function verifyArchive(): Promise<VerifyArchiveResult> {
  return get<VerifyArchiveResult>('/archive/verify')
}

export interface VerifyArchiveResult {
  total: number
  verified: number
  missing: number
  errors: string[]
}

export async function fetchProjectDetail(dirName: string): Promise<ProjectDetail> {
  return get<ProjectDetail>(`/projects/${enc(dirName)}/detail`)
}

export async function fetchBoundaries(dirName: string): Promise<BoundaryConfig> {
  return get<BoundaryConfig>(`/projects/${enc(dirName)}/boundaries`)
}

export async function saveBoundaries(dirName: string, data: { selectedSessionIds: string[] }): Promise<{ ok: boolean; selectedSessionIds: string[] }> {
  return put(`/projects/${enc(dirName)}/boundaries`, data)
}

export async function patchSessionEnhanced(
  sessionId: string,
  fields: {
    title?: string
    developerTake?: string
    skills?: string[]
    qaPairs?: Array<{ question: string; answer: string }>
    executionSteps?: Array<{ stepNumber: number; title: string; body: string }>
  },
): Promise<{ ok: boolean; enhancedAt: string }> {
  return patch(`/sessions/${enc(sessionId)}/enhanced`, fields)
}

export async function enhanceSession(
  dirName: string,
  sessionId: string,
): Promise<{ result: { title: string; skills: string[] }; provider: string }> {
  return post(`/projects/${enc(dirName)}/sessions/${enc(sessionId)}/enhance`)
}

export function triageProject(
  dirName: string,
  onEvent: (event: TriageEvent) => void,
): AbortController {
  return streamSSE(`/projects/${enc(dirName)}/triage`, {}, onEvent)
}

export function enhanceProject(
  dirName: string,
  selectedSessionIds: string[],
  skippedSessions: Array<{ title: string; duration: number; loc: number }>,
  onEvent: (event: EnhanceEvent) => void,
  force?: boolean,
): AbortController {
  return streamSSE(
    `/projects/${enc(dirName)}/enhance-project`,
    { selectedSessionIds, skippedSessions, force },
    onEvent,
  )
}

export async function refineNarrative(
  dirName: string,
  draftNarrative: string,
  draftTimeline: ProjectEnhanceResult['timeline'],
  answers: RefineAnswer[],
): Promise<RefineResult> {
  return post<RefineResult>(`/projects/${enc(dirName)}/refine-narrative`, {
    draftNarrative,
    draftTimeline,
    answers,
  })
}

export function uploadProject(
  dirName: string,
  payload: UploadPayload,
  onEvent: (event: UploadEvent) => void,
): AbortController {
  return streamSSE(`/projects/${enc(dirName)}/upload`, payload, onEvent)
}

export async function fetchEnhanceStatus(): Promise<EnhanceStatus> {
  try {
    return await get<EnhanceStatus>('/enhance/status')
  } catch {
    return { mode: 'unknown', remaining: null }
  }
}

export async function fetchApiKeyStatus(): Promise<ApiKeyStatus> {
  try {
    return await get<ApiKeyStatus>('/settings/api-key')
  } catch {
    return { hasKey: false }
  }
}

export async function saveApiKey(key: string): Promise<void> {
  await post('/settings/api-key', { apiKey: key })
}

export interface TemplateInfo {
  name: string
  label: string
  description: string
  accent: string
  mode: 'light' | 'dark'
  tags: string[]
  builtIn: boolean
}

export async function fetchTemplates(): Promise<TemplateInfo[]> {
  try {
    const data = await get<{ templates: TemplateInfo[] }>('/templates')
    return data.templates
  } catch {
    return []
  }
}

export async function fetchTheme(): Promise<{ template: string }> {
  try {
    return await get<{ template: string }>('/settings/theme')
  } catch {
    return { template: 'editorial' }
  }
}

export async function saveTheme(template: string): Promise<void> {
  await post('/settings/theme', { template })
}

// ── Portfolio profile ────────────────────────────────────────

export interface PortfolioProfile {
  displayName?: string
  bio?: string
  photoBase64?: string
  location?: string
  email?: string
  phone?: string
  linkedinUrl?: string
  githubUrl?: string
  twitterHandle?: string
  websiteUrl?: string
  resumeBase64?: string
  resumeFilename?: string
  /**
   * Hex color (e.g. `#084471`) used as the portfolio accent. Reserved for
   * a future custom-accent feature — the EditRail picker was removed in
   * favor of the default. portfolio-render-data.ts still honors any
   * previously persisted value.
   */
  accent?: string
  /**
   * User-curated list of projects on the portfolio (toggled visibility +
   * drag-to-reorder). Persisted server-side; the rendered portfolio uses
   * this to filter and order the projects list. Empty/missing means
   * "include all projects in default order".
   */
  projectsOnPortfolio?: Array<{ projectId: string; included: boolean; order: number }>
}

export async function fetchPortfolio(): Promise<PortfolioProfile> {
  try {
    return await get<PortfolioProfile>('/portfolio')
  } catch {
    return {}
  }
}

export async function savePortfolio(data: PortfolioProfile): Promise<void> {
  await post('/portfolio', data)
}

// ── Portfolio publish state ──────────────────────────────────

export type PortfolioTargetVisibility = 'public' | 'unlisted'

export interface PortfolioPublishTarget {
  lastPublishedAt: string
  lastPublishedProfileHash: string
  lastPublishedProfile: PortfolioProfile
  config: Record<string, unknown>
  visibility?: PortfolioTargetVisibility
  url?: string
  lastError?: string
  lastErrorAt?: string
}

export interface PortfolioPublishState {
  targets: Record<string, PortfolioPublishTarget>
}

export interface PortfolioPublishResult {
  ok: boolean
  url: string
  publishedAt?: string
  hash?: string
}

export async function fetchPortfolioPublishState(): Promise<PortfolioPublishState> {
  try {
    return await get<PortfolioPublishState>('/portfolio/state')
  } catch {
    return { targets: {} }
  }
}

/**
 * Publish the portfolio to the given target. Phase 3 only supports the
 * `heyi.am` target — `targetId` is plumbed through now so Phase 4 (export)
 * and Phase 5 (github) can add branches without a breaking API change.
 */
export async function publishPortfolio(targetId: string): Promise<PortfolioPublishResult> {
  if (targetId !== 'heyi.am') {
    throw new Error(`Unsupported publish target: ${targetId}`)
  }
  return post<PortfolioPublishResult>('/portfolio/upload')
}

// ── Portfolio export (zip download) ──────────────────────────

/**
 * POST /api/portfolio/export, receive a zip blob, and trigger a browser
 * download. Mirrors the existing exportArchive() pattern. Returns the
 * filename used so callers can show a confirmation.
 */
export async function downloadPortfolioZip(): Promise<{ ok: true; filename: string }> {
  const res = await fetch(`${API_BASE}/portfolio/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    let message = `Portfolio export failed: ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) message = body.error.message
    } catch { /* non-JSON */ }
    throw new Error(message)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const filename =
    res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
    'portfolio.zip'
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { ok: true, filename }
}

// ── GitHub Pages publish target ──────────────────────────────

export interface GithubAccount {
  login: string
  name: string | null
  avatarUrl: string
}

export interface GithubDeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface GithubRepo {
  id: number
  name: string
  full_name: string
  owner: { login: string }
  default_branch: string
  private: boolean
  html_url: string
}

export type GithubPollResponse =
  | { status: 'success'; account: GithubAccount }
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'denied' }

export interface GithubPublishResponse {
  ok: true
  url: string
  publishedAt?: string
  hash?: string
}

export class GithubApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function githubFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let code = `HTTP_${res.status}`
    let message = `${path} failed: ${res.status}`
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } }
      if (body?.error?.code) code = body.error.code
      if (body?.error?.message) message = body.error.message
    } catch { /* non-JSON */ }
    throw new GithubApiError(code, message, res.status)
  }
  return (await res.json()) as T
}

export async function requestGithubDeviceCode(): Promise<GithubDeviceCode> {
  return githubFetch<GithubDeviceCode>('/github/device-code', { method: 'POST' })
}

export async function pollGithubToken(args: {
  device_code: string
}): Promise<GithubPollResponse> {
  return githubFetch<GithubPollResponse>('/github/poll-token', {
    method: 'POST',
    body: JSON.stringify(args),
  })
}

export async function fetchGithubAccount(): Promise<GithubAccount | null> {
  const res = await githubFetch<{ account: GithubAccount | null }>('/github/account')
  return res.account
}

export async function disconnectGithub(): Promise<void> {
  await githubFetch<{ ok: true }>('/github/account', { method: 'DELETE' })
}

export async function fetchGithubRepos(): Promise<GithubRepo[]> {
  const res = await githubFetch<{ repos: GithubRepo[] }>('/github/repos')
  return res.repos
}

export async function publishToGithub(args: {
  owner: string
  repo: string
  branch?: string
}): Promise<GithubPublishResponse> {
  return githubFetch<GithubPublishResponse>('/github/publish', {
    method: 'POST',
    body: JSON.stringify(args),
  })
}

export async function deleteProjectScreenshot(dirName: string): Promise<void> {
  await fetch(`${API_BASE}/projects/${encodeURIComponent(dirName)}/screenshot`, { method: 'DELETE' })
}

export interface RenderResult {
  html: string
  css: string
  template: string
  accent?: string
  mode?: 'light' | 'dark'
}

async function fetchRender<T extends RenderResult>(path: string): Promise<T | null> {
  try {
    return await get<T>(path)
  } catch {
    return null
  }
}

export function fetchProjectRender(dirName: string) {
  return fetchRender<RenderResult & { screenshotUrl?: string }>(`/projects/${encodeURIComponent(dirName)}/render`)
}

export function fetchSessionRender(sessionId: string) {
  return fetchRender<RenderResult>(`/sessions/${encodeURIComponent(sessionId)}/render`)
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  try {
    return await get<AuthStatus>('/auth/status')
  } catch {
    return { authenticated: false }
  }
}

// ── Search & Session lookup ──────────────────────────────────

export async function searchSessions(
  query: string,
  filters?: { source?: string; project?: string; skill?: string },
): Promise<SearchResponse> {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (filters?.source) params.set('source', filters.source)
  if (filters?.project) params.set('project', filters.project)
  if (filters?.skill) params.set('skill', filters.skill)
  return get<SearchResponse>(`/search?${params.toString()}`)
}

export async function fetchSessionById(sessionId: string): Promise<Session> {
  const data = await get<{ session: Session }>(`/sessions/${enc(sessionId)}`)
  return data.session
}

export async function fetchSessionContext(
  sessionId: string,
  format: 'compact' | 'summary' | 'full' = 'summary',
): Promise<ContextExportResponse> {
  return get<ContextExportResponse>(`/sessions/${enc(sessionId)}/context?format=${format}`)
}

export async function fetchTranscript(sessionId: string): Promise<TranscriptResponse> {
  return get<TranscriptResponse>(`/sessions/${enc(sessionId)}/transcript`)
}

// ── Enhance cache ────────────────────────────────────────────

export async function fetchProjectEnhanceCache(
  dirName: string,
): Promise<ProjectEnhanceCacheResponse | null> {
  try {
    return await get<ProjectEnhanceCacheResponse>(`/projects/${enc(dirName)}/enhance-cache`)
  } catch {
    return null
  }
}

export async function saveProjectEnhanceLocally(
  dirName: string,
  selectedSessionIds: string[],
  result: ProjectEnhanceResult,
  extras?: { title?: string; repoUrl?: string; projectUrl?: string; screenshotBase64?: string },
): Promise<boolean> {
  try {
    await post(`/projects/${enc(dirName)}/enhance-save`, {
      selectedSessionIds,
      result,
      ...extras,
    })
    return true
  } catch {
    return false
  }
}

// ── Git remote auto-detection ────────────────────────────────

export async function fetchGitRemote(
  dirName: string,
): Promise<{ url: string | null }> {
  try {
    return await get<{ url: string | null }>(`/projects/${enc(dirName)}/git-remote`)
  } catch {
    return { url: null }
  }
}

// ── Screenshot capture ───────────────────────────────────────

export async function captureScreenshotFromUrl(
  dirName: string,
  slug: string,
  url: string,
): Promise<{ ok: boolean; key?: string; preview?: string; error?: string }> {
  return post(`/projects/${enc(dirName)}/screenshot-capture`, { url, slug })
}

// ── Device auth ──────────────────────────────────────────────

export interface DeviceCodeInfo {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export async function pollDeviceAuth(deviceCode: string): Promise<AuthStatus> {
  return post<AuthStatus>('/auth/poll', { device_code: deviceCode })
}

export async function checkUsername(username: string): Promise<{ available: boolean; reason?: string }> {
  return get<{ available: boolean; reason?: string }>(`/auth/check-username?username=${encodeURIComponent(username)}`)
}

export async function startSignup(username: string): Promise<DeviceCodeInfo> {
  return post<DeviceCodeInfo>('/auth/signup', { username })
}

export async function startLogin(): Promise<DeviceCodeInfo> {
  return post<DeviceCodeInfo>('/auth/login')
}

export async function logout(): Promise<void> {
  await post('/auth/logout')
}

// ── Dashboard (SQLite-backed) ─────────────────────────────────

export async function fetchDashboard(): Promise<DashboardResponse> {
  return get<DashboardResponse>('/dashboard')
}

export async function completeOnboarding(): Promise<void> {
  await post('/onboarding/complete')
}

export function subscribeSyncProgress(
  onEvent: (event: SyncProgressEvent) => void,
): () => void {
  const source = new EventSource(`${API_BASE}/sync/progress`)
  source.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data))
    } catch { /* skip malformed */ }
  }
  source.onerror = () => {
    source.close()
  }
  return () => source.close()
}
