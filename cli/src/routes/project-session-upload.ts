/**
 * Shared session upload pipeline used by single-project publish (SSE) and
 * portfolio publish (batch). Keeps POST /api/sessions payloads identical.
 */
import { readFileSync } from 'node:fs';
import { API_URL } from '../config.js';
import {
  loadEnhancedData,
  saveEnhancedData,
  getDefaultTemplate,
  isTranscriptIncluded,
} from '../settings.js';
import { redactSession, redactText, scanTextSync, formatFindings, stripHomePathsInText } from '../redact.js';
import { renderSessionHtml } from '../render/index.js';
import { buildSessionRenderData, buildSessionCard } from '../render/build-render-data.js';
import type { SessionCard } from '../render/types.js';
import { buildAgentSummary, type RouteContext, type ProjectInfo } from './context.js';
import { toSlug } from '../format-utils.js';
import { getFileCountWithChildren } from '../db.js';

export type SessionUploadProgress = (event: Record<string, unknown>) => void;

export async function uploadSelectedSessions(
  ctx: RouteContext,
  auth: { token: string; username: string },
  options: {
    proj: ProjectInfo;
    projectData: { project_id: number; slug: string };
    selectedSessionIds: string[];
    sessionStatus?: 'listed' | 'unlisted';
    send?: SessionUploadProgress;
  },
): Promise<{
  uploadedCount: number;
  failedSessions: Array<{ sessionId: string; error: string }>;
  uploadedSessionCards: SessionCard[];
}> {
  const { proj, projectData, selectedSessionIds, sessionStatus, send } = options;
  const shareStatus = sessionStatus ?? 'unlisted';
  const notify = send ?? ((_evt: Record<string, unknown>) => {});

  let uploadedCount = 0;
  const failedSessions: Array<{ sessionId: string; error: string }> = [];
  const uploadedSessionCards: SessionCard[] = [];

  const selectedTemplate = getDefaultTemplate() || 'editorial';

  for (const sessionId of selectedSessionIds) {
    const meta = proj.sessions.find((s) => s.sessionId === sessionId);
    if (!meta) continue;

    notify({ type: 'session', sessionId, status: 'uploading' });

    try {
      const session = await ctx.loadSession(meta.path, proj.name, sessionId);
      const enhanced = loadEnhancedData(sessionId);
      const sessionSlug = toSlug(enhanced?.title ?? session.title ?? sessionId, 80);
      const includeTranscript = isTranscriptIncluded(sessionId);

      const agentSummary = await buildAgentSummary(
        meta.children ?? [],
        (c) => ctx.getSessionStats(c, proj.name),
        { deduplicate: true },
      );

      const devTake = (enhanced?.developerTake ?? session.developerTake ?? '').slice(0, 2000);
      const sessionNarrative = (enhanced as { narrative?: string })?.narrative ?? '';
      const sessionTitle = enhanced?.title ?? session.title;
      const sessionSkills = enhanced?.skills ?? session.skills ?? [];
      const sessionSourceTool = session.source ?? meta.source ?? 'claude';
      const sessionRecordedAt = session.date ? new Date(session.date).toISOString() : new Date().toISOString();
      const renderOpts = {
        sessionId,
        session,
        enhanced,
        username: auth.username,
        projectSlug: projectData.slug,
        sessionSlug,
        sourceTool: sessionSourceTool,
        agentSummary,
        template: selectedTemplate,
      };

      let sessionRenderedHtml: string | null = null;
      try {
        const sessionRenderData = buildSessionRenderData(renderOpts);
        sessionRenderedHtml = renderSessionHtml(sessionRenderData, selectedTemplate);
      } catch (renderErr) {
        console.error(`[upload] Session render failed for ${sessionId}:`, (renderErr as Error).message);
      }

      uploadedSessionCards.push(buildSessionCard(renderOpts));

      const childLoc = agentSummary?.agents?.reduce(
        (s: number, a: { loc_changed?: number }) => s + (a.loc_changed ?? 0),
        0,
      ) ?? 0;
      const totalLocChanged = (session.linesOfCode ?? 0) + childLoc;
      const totalFilesChanged = getFileCountWithChildren(ctx.db, sessionId) || session.filesChanged?.length || 0;

      const sessionPayload = {
        session: {
          title: sessionTitle,
          dev_take: devTake,
          context: enhanced?.context ?? '',
          duration_minutes: session.durationMinutes ?? 0,
          turns: session.turns ?? 0,
          files_changed: totalFilesChanged,
          loc_changed: totalLocChanged,
          recorded_at: sessionRecordedAt,
          end_time: session.endTime ? new Date(session.endTime).toISOString() : null,
          cwd: session.cwd ?? null,
          wall_clock_minutes: session.wallClockMinutes ?? null,
          template: selectedTemplate,
          language: null,
          tools: session.toolBreakdown?.map((t) => t.tool) ?? [],
          skills: sessionSkills,
          narrative: sessionNarrative,
          project_name: proj.name,
          project_id: projectData.project_id,
          slug: sessionSlug,
          status: shareStatus,
          source_tool: sessionSourceTool,
          agent_summary: agentSummary,
          rendered_html: sessionRenderedHtml,
        },
      };

      const turnTimeline = (session.turnTimeline ?? []).map((t) => ({
        timestamp: t.timestamp,
        type: t.type,
        content: (t.content ?? '').slice(0, 200),
        tools: (t as { tools?: string[] }).tools ?? [],
      }));
      const transcriptExcerpt = (session.rawLog ?? []).slice(0, 10).map((line, i) => {
        const role = line.startsWith('> ') ? 'dev' : 'ai';
        const text = role === 'dev' ? line.slice(2) : line;
        return { role, id: `Turn ${i + 1}`, text, timestamp: null };
      });

      const sessionData = {
        version: 1,
        id: sessionId,
        title: sessionTitle,
        dev_take: devTake,
        context: enhanced?.context ?? '',
        duration_minutes: session.durationMinutes ?? 0,
        turns: session.turns ?? 0,
        files_changed: (session.filesChanged ?? []).slice(0, 20).map((f) => (typeof f === 'string' ? { path: f, additions: 0, deletions: 0 } : f)),
        loc_changed: totalLocChanged,
        date: sessionRecordedAt,
        end_time: (() => {
          if (!session.endTime || !session.date) return null;
          const wallMs = new Date(session.endTime).getTime() - new Date(session.date).getTime();
          const activeMs = (session.durationMinutes ?? 0) * 60_000;
          return wallMs <= activeMs * 3 ? new Date(session.endTime).toISOString() : null;
        })(),
        cwd: session.cwd ?? null,
        wall_clock_minutes: session.wallClockMinutes ?? null,
        template: selectedTemplate,
        skills: sessionSkills,
        tools: session.toolBreakdown?.map((t) => t.tool) ?? [],
        source: sessionSourceTool,
        slug: sessionSlug,
        project_name: proj.name,
        narrative: sessionNarrative,
        status: shareStatus as 'listed' | 'unlisted',
        raw_log: [] as string[],
        execution_path: (enhanced?.executionSteps ?? session.executionPath ?? []).map((s, i) => ({
          label: s.title ?? `Step ${i + 1}`,
          description: (s as { description?: string }).description ?? (s as { body?: string }).body ?? '',
        })),
        qa_pairs: enhanced?.qaPairs ?? session.qaPairs ?? [],
        highlights: [],
        tool_breakdown: (session.toolBreakdown ?? []).map((t) => ({ tool: t.tool, count: t.count })),
        top_files: (session.filesChanged ?? []).slice(0, 20).map((f) => (typeof f === 'string' ? { path: f, additions: 0, deletions: 0 } : f)),
        ...(includeTranscript ? { turn_timeline: turnTimeline } : {}),
        ...(includeTranscript ? { transcript_excerpt: transcriptExcerpt } : {}),
        agent_summary: agentSummary,
        children: agentSummary?.agents?.map((a: { role: string; duration_minutes: number; loc_changed: number }) => ({
          sessionId: a.role,
          role: a.role,
          durationMinutes: a.duration_minutes,
          linesOfCode: a.loc_changed,
        })) ?? [],
      };

      const sessionCwd = session.cwd ?? undefined;
      const redactedPayload = redactSession(sessionPayload, 'high', sessionCwd);
      const redactedData = redactSession(sessionData as Record<string, unknown>, 'high', sessionCwd);

      const payloadFindings = scanTextSync(JSON.stringify(sessionPayload));
      if (payloadFindings.length > 0) {
        const summary = formatFindings(payloadFindings);
        notify({ type: 'redaction', sessionId, message: summary });
      }

      const sessionRes = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify(redactedPayload),
      });

      if (sessionRes.ok) {
        uploadedCount++;

        try {
          const sesData = await sessionRes.json() as { upload_urls?: { raw?: string; log?: string; session?: string } };
          if (sesData.upload_urls && includeTranscript) {
            const { raw: rawUrl, log: logUrl } = sesData.upload_urls;
            if (rawUrl && meta.path && !meta.path.startsWith('cursor://')) {
              try {
                const rawText = readFileSync(meta.path, 'utf-8');
                let redactedRaw = redactText(rawText);
                redactedRaw = stripHomePathsInText(redactedRaw, sessionCwd);
                await fetch(rawUrl, { method: 'PUT', body: Buffer.from(redactedRaw, 'utf-8'), headers: { 'Content-Type': 'application/octet-stream' } });
              } catch { /* S3 upload is best-effort */ }
            }
            if (logUrl && session.rawLog && session.rawLog.length > 0) {
              try {
                const redactedLog = session.rawLog.map((line: string) => {
                  let cleaned = redactText(line);
                  cleaned = stripHomePathsInText(cleaned, sessionCwd);
                  return cleaned;
                });
                await fetch(logUrl, { method: 'PUT', body: JSON.stringify(redactedLog), headers: { 'Content-Type': 'application/json' } });
              } catch { /* S3 upload is best-effort */ }
            }
            if (sesData.upload_urls.session) {
              try {
                await fetch(sesData.upload_urls.session, {
                  method: 'PUT',
                  body: JSON.stringify(redactedData),
                  headers: { 'Content-Type': 'application/json' },
                });
              } catch { /* S3 upload is best-effort */ }
            }
          }
        } catch { /* Response already consumed or no upload_urls -- not fatal */ }

        if (enhanced) {
          saveEnhancedData(sessionId, { ...enhanced, uploaded: true });
        }
        notify({ type: 'session', sessionId, status: 'uploaded' });
      } else {
        const sesErrBody = await sessionRes.json().catch(() => null);
        const rawSesErr = sesErrBody && typeof sesErrBody === 'object' ? (sesErrBody as { error?: unknown }).error : null;
        const errMsg = typeof rawSesErr === 'string' ? rawSesErr
          : (rawSesErr && typeof rawSesErr === 'object' && 'message' in rawSesErr) ? (rawSesErr as { message: string }).message
          : `HTTP ${sessionRes.status}`;
        failedSessions.push({ sessionId, error: errMsg });
        notify({ type: 'session', sessionId, status: 'failed', error: errMsg });
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      failedSessions.push({ sessionId, error: errMsg });
      notify({ type: 'session', sessionId, status: 'failed', error: errMsg });
    }
  }

  return { uploadedCount, failedSessions, uploadedSessionCards };
}
