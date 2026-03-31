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

export async function saveBoundaries(dirName: string, data: BoundaryConfig): Promise<void> {
  await post(`/projects/${enc(dirName)}/boundaries`, data)
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
