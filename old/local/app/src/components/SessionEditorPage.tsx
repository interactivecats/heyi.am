import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { fetchSession, fetchSummary, shareSessionWithEdits, fetchAuthStatus, startAuthConnect } from "../api";
import type { ShareResult, AuthStatus } from "../api";
import type { SessionAnalysis, SessionSummary } from "../types";
import SessionEditor, { buildEditorData } from "./SessionEditor";
import type { EditorData } from "./SessionEditor";
import { SkeletonLine } from "./Skeleton";

export default function SessionEditorPage() {
  const { project, id } = useParams<{ project: string; id: string }>();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<ShareResult | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    if (!project || !id) return;

    let cancelled = false;

    async function load() {
      try {
        const [analysisData, summaryData] = await Promise.all([
          fetchSession(project!, id!),
          fetchSummary(project!, id!).catch(() => null),
        ]);
        if (cancelled) return;
        setAnalysis(analysisData);
        setSummary(summaryData);
      } catch {
        if (!cancelled) {
          setError("Could not load session data. Try refreshing.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    fetchAuthStatus().then(setAuthStatus);
    return () => { cancelled = true; };
  }, [project, id]);

  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pendingPublishData, setPendingPublishData] = useState<EditorData | null>(null);

  async function handlePublish(data: EditorData) {
    if (!project || !id) {
      throw new Error("Missing project or session ID");
    }

    // If not authenticated, show a prompt before publishing
    if (authStatus && !authStatus.authenticated && !pendingPublishData) {
      setPendingPublishData(data);
      setShowAuthPrompt(true);
      throw new Error("__auth_prompt__");
    }

    const result = await shareSessionWithEdits(project, id, {
      title: data.title,
      context: data.context,
      developer_take: data.developer_take,
      execution_path: data.execution_path,
      skills: data.skills,
    });

    setPublishResult(result);
    return result;
  }

  async function handleConnect() {
    setConnecting(true);
    const result = await startAuthConnect();
    setConnecting(false);

    if (result.connected) {
      // Connected! Now publish with auth
      setShowAuthPrompt(false);
      setAuthStatus({ authenticated: true, username: result.username || null });

      if (pendingPublishData && project && id) {
        const data = pendingPublishData;
        setPendingPublishData(null);

        const publishRes = await shareSessionWithEdits(project, id, {
          title: data.title,
          context: data.context,
          developer_take: data.developer_take,
          execution_path: data.execution_path,
          skills: data.skills,
        });
        setPublishResult(publishRes);
      }
    }
  }

  async function publishAnyway() {
    if (!pendingPublishData || !project || !id) return;
    setShowAuthPrompt(false);
    const data = pendingPublishData;
    setPendingPublishData(null);

    const result = await shareSessionWithEdits(project, id, {
      title: data.title,
      context: data.context,
      developer_take: data.developer_take,
      execution_path: data.execution_path,
      skills: data.skills,
    });

    setPublishResult(result);
  }

  function handleCancel() {
    navigate(`/session/${project}/${id}`);
  }

  if (error) {
    return (
      <div className="error-state">
        {error}
        <br />
        <Link to="/" className="back-link">
          Back to sessions
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
        <Link
          to={`/session/${project}/${id}`}
          className="se-nav-back"
        >
          Back to preview
        </Link>
      </nav>

      {showAuthPrompt ? (
        <div className="se-auth-prompt">
          {connecting ? (
            <>
              <div className="se-auth-prompt__title">Connecting...</div>
              <p className="se-auth-prompt__desc">
                A browser window opened to heyi.am. Authorize the connection there,
                then come back here.
              </p>
            </>
          ) : (
            <>
              <div className="se-auth-prompt__title">Connect your account?</div>
              <p className="se-auth-prompt__desc">
                Connect your heyi.am account to add this session to your portfolio.
                A browser window will open — if you're already logged in, just click Authorize.
              </p>
              <div className="se-auth-prompt__actions">
                <button
                  className="se-auth-prompt__connect"
                  onClick={handleConnect}
                >
                  Connect now
                </button>
              </div>
              <button
                className="se-auth-prompt__skip"
                onClick={publishAnyway}
              >
                Publish anonymously instead
              </button>
            </>
          )}
        </div>
      ) : publishResult ? (
        <div className="se-success">
          <div className="se-success__label">Session Published</div>
          <a
            href={publishResult.url}
            className="se-success__url"
            target="_blank"
            rel="noopener noreferrer"
          >
            {publishResult.url}
          </a>

          {publishResult.linked ? (
            <p className="se-success__note">Added to your portfolio.</p>
          ) : (
            <div className="se-success__anon">
              {publishResult.deleteCode && (
                <div className="se-success__delete-code">
                  <span className="se-success__delete-code-label">Delete code:</span>
                  <code className="se-success__delete-code-value">{publishResult.deleteCode}</code>
                </div>
              )}
              <p className="se-success__anon-hint">
                {publishResult.deleteCode
                  ? "Save this code -- it is the only way to delete this share."
                  : null}
              </p>
              <p className="se-success__login-hint">
                Want a portfolio? Run: <code>ccs login</code>
              </p>
            </div>
          )}

          <div className="se-success__actions">
            <a
              href={publishResult.url}
              className="se-success__view"
              target="_blank"
              rel="noopener noreferrer"
            >
              View published page
            </a>
            <button
              className="se-success__copy"
              onClick={() => navigator.clipboard.writeText(publishResult.url)}
            >
              Copy link
            </button>
            <Link
              to={`/session/${project}/${id}`}
              className="se-success__back"
            >
              Back to session
            </Link>
          </div>
        </div>
      ) : loading ? (
        <div className="se-loading">
          <SkeletonLine width="60%" />
          <SkeletonLine width="80%" />
          <SkeletonLine width="40%" />
          <SkeletonLine width="100%" />
          <SkeletonLine width="70%" />
        </div>
      ) : analysis ? (
        <SessionEditor
          initialData={buildEditorData(summary, analysis)}
          analysis={analysis}
          onPublish={handlePublish}
          onCancel={handleCancel}
        />
      ) : null}

      <footer>
        <Link to="/">heyi.am</Link>
      </footer>
    </>
  );
}
