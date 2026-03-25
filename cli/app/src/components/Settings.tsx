import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useAuth } from '../AuthContext';
import { fetchEnhanceStatus, type EnhanceStatus } from '../api';

const API_BASE = '/api';

async function fetchApiKeyStatus(): Promise<{ hasKey: boolean; maskedKey: string | null }> {
  const res = await fetch(`${API_BASE}/settings/api-key`);
  if (!res.ok) return { hasKey: false, maskedKey: null };
  return res.json();
}

async function saveApiKey(apiKey: string): Promise<{ ok: boolean; mode: string }> {
  const res = await fetch(`${API_BASE}/settings/api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) throw new Error('Failed to save API key');
  return res.json();
}

export function Settings() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [enhanceStatus, setEnhanceStatus] = useState<EnhanceStatus | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const auth = useAuth();

  const isConnected = auth.authenticated;
  const username = auth.username ?? '';

  useEffect(() => {
    fetchEnhanceStatus().then(setEnhanceStatus);
    fetchApiKeyStatus().then(({ hasKey, maskedKey: mk }) => {
      setHasExistingKey(hasKey);
      setMaskedKey(mk);
    });
  }, []);

  const handleSaveApiKey = async () => {
    setSaveStatus('saving');
    try {
      const result = await saveApiKey(apiKey);
      setSaveStatus('saved');
      setHasExistingKey(!!apiKey.trim());
      setMaskedKey(apiKey.trim() ? `${apiKey.trim().slice(0, 7)}...${apiKey.trim().slice(-4)}` : null);
      setApiKey('');
      // Refresh enhance status to reflect new mode
      setEnhanceStatus({ mode: result.mode as EnhanceStatus['mode'], remaining: null });
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleClearApiKey = async () => {
    setSaveStatus('saving');
    try {
      const result = await saveApiKey('');
      setSaveStatus('saved');
      setHasExistingKey(false);
      setMaskedKey(null);
      setApiKey('');
      setEnhanceStatus({ mode: result.mode as EnhanceStatus['mode'], remaining: null });
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const modeLabel = enhanceStatus?.mode === 'local'
    ? 'Local API key'
    : enhanceStatus?.mode === 'proxy'
      ? 'heyi.am proxy'
      : 'Not configured';

  const modeDotClass = enhanceStatus?.mode === 'local'
    ? 'badge--uploaded'
    : enhanceStatus?.mode === 'proxy'
      ? 'badge--uploaded'
      : 'badge--draft';

  return (
    <AppShell title="Settings" onBack={() => navigate('/')}>
      <div className="settings-page">
        {/* AI Enhancement */}
        <section className="settings-section">
          <span className="label">AI Enhancement</span>
          <div className="card">
            <div className="settings-row">
              <span className="settings-row__label">Mode</span>
              <span className={`badge ${modeDotClass}`}>
                {modeLabel}
              </span>
            </div>

            {enhanceStatus?.mode === 'proxy' && enhanceStatus.remaining != null && (
              <div className="settings-row" style={{ marginTop: 'var(--spacing-4)' }}>
                <span className="settings-row__label">Usage</span>
                <span className="settings-row__value">
                  {enhanceStatus.remaining} remaining this month
                </span>
              </div>
            )}

            {enhanceStatus?.mode === 'none' && (
              <p className="settings-help" style={{ marginTop: 'var(--spacing-4)' }}>
                Log in or set ANTHROPIC_API_KEY to enable AI enhancement.
              </p>
            )}

            {hasExistingKey && maskedKey && (
              <div className="settings-row" style={{ marginTop: 'var(--spacing-4)' }}>
                <span className="settings-row__label">API Key</span>
                <span className="settings-row__value">{maskedKey}</span>
              </div>
            )}

            <details style={{ marginTop: 'var(--spacing-4)' }}>
              <summary className="text-label" style={{ cursor: 'pointer' }}>
                {hasExistingKey ? 'Change API key' : 'Use your own API key'}
              </summary>
              <div className="settings-input-group" style={{ marginTop: 'var(--spacing-3)' }}>
                <div className="settings-input-wrapper">
                  <input
                    id="api-key-input"
                    className="input"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    autoComplete="off"
                  />
                  <button
                    className="settings-input-toggle"
                    type="button"
                    onClick={() => setShowApiKey((prev) => !prev)}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <path d="M1 1l22 22" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-2)' }}>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleSaveApiKey}
                    disabled={!apiKey.trim() || saveStatus === 'saving'}
                  >
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save'}
                  </button>
                  {hasExistingKey && (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={handleClearApiKey}
                      disabled={saveStatus === 'saving'}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {saveStatus === 'error' && (
                  <p className="settings-help" style={{ color: 'var(--color-error, #e53e3e)' }}>
                    Failed to save. Try again.
                  </p>
                )}
                <p className="settings-help">
                  Saved to ~/.config/heyiam/settings.json. Uses your own Anthropic account.
                </p>
              </div>
            </details>
          </div>
        </section>

        <hr className="divider" />

        {/* Authentication */}
        <section className="settings-section">
          <span className="label">Authentication</span>
          <div className="card">
            <div className="settings-row">
              <span className="settings-row__label">Status</span>
              {isConnected ? (
                <span className="badge badge--uploaded">
                  Connected {username}
                </span>
              ) : (
                <span className="badge badge--draft">Not connected</span>
              )}
            </div>

            <div className="settings-row" style={{ marginTop: 'var(--spacing-4)' }}>
              <span className="settings-row__label">Username</span>
              <span className="settings-row__value">
                {isConnected ? username : '\u2014'}
              </span>
            </div>

            <div style={{ marginTop: 'var(--spacing-4)' }}>
              {isConnected ? (
                <button className="btn btn-secondary" type="button">
                  Disconnect
                </button>
              ) : (
                <div className="terminal" style={{ fontSize: '0.75rem' }}>
                  <span className="terminal__prompt">$ </span>heyiam login
                </div>
              )}
            </div>
          </div>
        </section>

      </div>
    </AppShell>
  );
}

export default Settings;
