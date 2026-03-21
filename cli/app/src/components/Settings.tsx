import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useAuth } from '../AuthContext';
import { fetchEnhanceStatus, type EnhanceStatus } from '../api';

export function Settings() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [enhanceStatus, setEnhanceStatus] = useState<EnhanceStatus | null>(null);
  const auth = useAuth();

  const isConnected = auth.authenticated;
  const username = auth.username ?? '';
  const machineToken = 'ed25519:a4f2...8b3c';
  const tokenFingerprint = 'SHA256:kR7x...Qm4w';

  useEffect(() => {
    fetchEnhanceStatus().then(setEnhanceStatus);
  }, []);

  const modeLabel = enhanceStatus?.mode === 'local'
    ? 'Local API key'
    : enhanceStatus?.mode === 'proxy'
      ? 'heyi.am proxy'
      : 'Not configured';

  const modeDotClass = enhanceStatus?.mode === 'local'
    ? 'badge--published'
    : enhanceStatus?.mode === 'proxy'
      ? 'badge--published'
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

            <details style={{ marginTop: 'var(--spacing-4)' }}>
              <summary className="text-label" style={{ cursor: 'pointer' }}>
                Use your own API key
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
                <p className="settings-help">
                  Uses your own Anthropic account. Bypasses proxy quota.
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
                <span className="badge badge--published">
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

        <hr className="divider" />

        {/* Machine Identity */}
        <section className="settings-section">
          <span className="label">Machine Identity</span>
          <div className="card">
            <div className="settings-input-group">
              <span className="text-label">Machine Token</span>
              <div
                className="terminal"
                style={{ fontSize: '0.75rem', padding: 'var(--spacing-3)' }}
              >
                {machineToken}
              </div>
              <p className="settings-help">
                Used for cryptographic signing of published sessions
              </p>
            </div>

            <div
              className="settings-row"
              style={{ marginTop: 'var(--spacing-4)' }}
            >
              <span className="settings-row__label">Token fingerprint</span>
              <span className="settings-row__value">{tokenFingerprint}</span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export default Settings;
