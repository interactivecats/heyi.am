import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchSession, getShareStatus, streamSummary, clearSummaryCache, getCachedSummary, fetchAuthStatus, generateQuestions } from "../api";
import type { SessionAnalysis, SessionSummary, SessionQuestion, QuestionAnswer } from "../types";
import type { ShareStatus, AuthStatus } from "../api";
import SharePreview from "./SharePreview";
import QuestionsStep from "./QuestionsStep";
import { SkeletonLine } from "./Skeleton";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SessionDetail() {
  const { project, id } = useParams<{ project: string; id: string }>();
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "sharing" | "shared">("idle");
  const [shareInfo, setShareInfo] = useState<ShareStatus | null>(null);
  const [aiState, setAiState] = useState<"idle" | "generating-questions" | "questions" | "streaming" | "done">("idle");
  const [aiStatus, setAiStatus] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [sessionQuestions, setSessionQuestions] = useState<SessionQuestion[]>([]);

  useEffect(() => {
    if (!project || !id) return;
    fetchSession(project, id)
      .then(setAnalysis)
      .catch(() => setError("Session not found"));
    // Load cached summary if it exists (no AI trigger)
    getCachedSummary(project, id).then((cached) => {
      if (cached) {
        setSummary(cached);
        setAiState("done");
      }
    });
    getShareStatus(project, id).then((status) => {
      if (status.shared) {
        setShareInfo(status);
        setShareState("shared");
      }
    });
    fetchAuthStatus().then(setAuthStatus);
  }, [project, id]);

  /** Build scripted commentary from analysis data we already have */
  function buildScriptedMessages(a: SessionAnalysis): string[] {
    const msgs: string[] = [];
    msgs.push(`Reading ${a.turns.length} turns across ${a.duration.minutes} minutes...`);

    if (a.totalToolCalls > 50) {
      msgs.push(`${a.totalToolCalls} tool calls — this was an intense session`);
    } else if (a.totalToolCalls > 20) {
      msgs.push(`${a.totalToolCalls} tool calls across the session`);
    }

    const files = a.filesChanged || [];
    if (files.length > 10) {
      msgs.push(`${files.length} files touched — wide scope`);
    } else if (files.length > 0) {
      msgs.push(`${files.length} file${files.length !== 1 ? "s" : ""} changed`);
    }

    // Tool usage insights
    const topTool = Object.entries(a.toolUsage).sort(([,a],[,b]) => b.count - a.count)[0];
    if (topTool) {
      const [name, usage] = topTool;
      if (name === "Read" && usage.count > 10) {
        msgs.push("Heavy reading before editing — good context loading");
      } else if (name === "Edit" && usage.count > 15) {
        msgs.push("Lots of edits — hands-on refactoring session");
      } else if (name === "Bash" && usage.count > 5) {
        msgs.push("Frequent terminal usage — testing and verifying as you go");
      }
    }

    if (a.rejectedToolCalls > 2) {
      msgs.push(`${a.rejectedToolCalls} rejected calls — you were steering actively`);
    }

    msgs.push("Extracting decisions and insights...");
    return msgs;
  }

  // Start enhancement: generate questions first, then stream
  const handleEnhance = useCallback(async () => {
    if (!project || !id || aiState === "streaming" || aiState === "generating-questions" || aiState === "questions" || !analysis) return;

    // Step 1: Generate questions from raw analysis
    setAiState("generating-questions");
    setAiStatus("Reviewing your session...");
    try {
      const questions = await generateQuestions(project, id);
      if (questions.length > 0) {
        setSessionQuestions(questions);
        setAiState("questions");
        return; // Wait for user to answer — startStreaming called from onComplete
      }
    } catch (err) {
      console.error("Question generation failed, proceeding without:", err);
    }

    // No questions or generation failed — stream directly
    startStreaming();
  }, [project, id, aiState, analysis]);

  // Called after questions answered (or skipped)
  function handleQuestionsComplete(answers: QuestionAnswer[]) {
    startStreaming(answers, sessionQuestions);
  }

  function handleQuestionsSkip() {
    startStreaming();
  }

  // Step 2: Stream the AI enhancement (optionally with answers baked in)
  const startStreaming = useCallback((answers?: QuestionAnswer[], questions?: SessionQuestion[]) => {
    if (!project || !id || !analysis) return;
    setAiState("streaming");

    // Phase 1: Scripted commentary from analysis data (instant)
    const scripted = buildScriptedMessages(analysis);
    let msgIndex = 0;
    let pendingComplete: { summary: SessionSummary; doneMsg: string } | null = null;

    setAiStatus(scripted[0]);

    // Show scripted messages on a timer
    const scriptedTimer = setInterval(() => {
      msgIndex++;
      if (msgIndex < scripted.length) {
        setAiStatus(scripted[msgIndex]);
      } else {
        clearInterval(scriptedTimer);
        // If a cached result arrived while we were showing scripted messages, apply it now
        if (pendingComplete) {
          const { summary: s, doneMsg } = pendingComplete;
          setAiStatus(doneMsg);
          setSummary(s);
          setAiState("done");
          pendingComplete = null;
        }
      }
    }, 800);

    // Phase 2: Real AI stream updates (with optional answers baked in)
    const cleanup = streamSummary(project, id, (event) => {
      if (event.type === "partial" && event.partial) {
        const p = event.partial;

        // Switch to real AI status updates
        if (p.executionPath && p.executionPath.length > 0) {
          const stepCount = p.executionPath.length;
          const latestTitle = p.executionPath[stepCount - 1]?.title;
          const msg = latestTitle
            ? `Step ${stepCount}: ${latestTitle}`
            : `${stepCount} step${stepCount !== 1 ? "s" : ""} extracted`;
          setAiStatus(msg);
        } else if (p.title) {
          const msg = `Title: "${p.title}"`;
          setAiStatus(msg);
        }

        setSummary((prev) => ({
          ...prev,
          ...p,
          narrative: p.narrative || prev?.narrative || "",
          tutorialSteps: prev?.tutorialSteps || [],
          efficiencyInsights: prev?.efficiencyInsights || [],
          highlights: p.highlights || prev?.highlights || [],
          oneLineSummary: p.title || prev?.oneLineSummary || "",
        } as SessionSummary));
      } else if (event.type === "complete" && event.summary) {
        const stepCount = event.summary.executionPath?.length || 0;
        const skillCount = (event.summary.skills || event.summary.extractedSkills || []).length;
        const doneMsg = `Done — ${stepCount} steps, ${skillCount} skills identified`;

        // If scripted messages haven't finished yet, queue the complete for after
        if (msgIndex < scripted.length) {
          pendingComplete = { summary: event.summary, doneMsg };
        } else {
          clearInterval(scriptedTimer);
          setAiStatus(doneMsg);
          setSummary(event.summary);
          setAiState("done");
        }
      } else if (event.type === "error") {
        clearInterval(scriptedTimer);
        setAiState("idle");
        setAiStatus("");
      }
    }, answers, questions && questions.length > 0 ? questions : undefined);

    return () => {
      clearInterval(scriptedTimer);
      cleanup();
    };
  }, [project, id, analysis]);

  if (error) {
    return (
      <div className="error-state">
        {error}
        <br />
        <Link to="/" className="back-link">
          &larr; Back to sessions
        </Link>
      </div>
    );
  }

  return (
    <>
      <nav>
        <Link to="/" className="logo">heyi<b>.</b>am</Link>
        {authStatus && (
          <span className="auth-indicator">
            {authStatus.authenticated
              ? authStatus.username || "logged in"
              : <span className="auth-indicator__hint">run <code>ccs login</code></span>}
          </span>
        )}
        <div className="share-area">
          {shareState === "shared" && shareInfo?.sharedAt && (
            <span className="share-status">
              Shared {timeAgo(shareInfo.sharedAt)}
            </span>
          )}

          {/* Enhance with AI button */}
          {aiState === "idle" && (
            <button
              className="enhance-btn"
              onClick={handleEnhance}
            >
              Enhance with AI
            </button>
          )}
          {aiState === "generating-questions" && (
            <span className="enhance-btn enhance-btn--active">
              <span className="enhance-btn__dot" />
              {aiStatus || "Reviewing session..."}
            </span>
          )}
          {aiState === "streaming" && (
            <span className="enhance-btn enhance-btn--active">
              <span className="enhance-btn__dot" />
              {aiStatus || "Enhancing..."}
            </span>
          )}
          {aiState === "done" && (
            <>
              <span className="enhance-btn enhance-btn--done">
                AI enhanced
              </span>
              <button
                className="enhance-btn enhance-btn--rerun"
                onClick={async () => {
                  if (!project || !id) return;
                  await clearSummaryCache(project, id);
                  setSummary(null);
                  setSessionQuestions([]);
                  setAiState("idle");
                  setAiStatus("");
                  setTimeout(() => handleEnhance(), 50);
                }}
              >
                Re-run AI
              </button>
            </>
          )}

          <Link
            to={`/session/${project}/${id}/edit`}
            className="copy-btn"
          >
            Edit &amp; Publish
          </Link>
        </div>
      </nav>

      {aiState === "questions" && sessionQuestions.length > 0 ? (
        <QuestionsStep
          questions={sessionQuestions}
          onComplete={handleQuestionsComplete}
          onSkip={handleQuestionsSkip}
        />
      ) : analysis ? (
        <SharePreview
          analysis={analysis}
          summary={summary}
          enhancing={aiState === "streaming"}
        />
      ) : (
        <section className="sp-hero">
          <SkeletonLine width="80%" />
          <SkeletonLine width="60%" />
          <SkeletonLine width="100%" />
          <SkeletonLine width="90%" />
        </section>
      )}

      <footer>
        <Link to="/">heyi.am</Link>
      </footer>
    </>
  );
}
