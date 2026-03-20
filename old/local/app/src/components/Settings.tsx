import { useState } from "react";
import { Link } from "react-router-dom";

export default function Settings() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("anthropic_api_key") ?? ""
  );
  const [saved, setSaved] = useState(false);
  const [masked, setMasked] = useState(true);

  const handleSave = () => {
    localStorage.setItem("anthropic_api_key", apiKey);
    localStorage.removeItem("ccs_banner_dismissed");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <header className="app-header">
        <span className="app-header__title">heyi<b>.</b>am</span>
      </header>

      <Link to="/" className="back-link">
        &larr; Sessions
      </Link>

      <div className="settings">
        <h1 className="settings__title">Settings</h1>

        <div className="settings__section">
          <label className="settings__label">Anthropic API Key</label>
          <p className="settings__description">
            Required for AI summaries and sharing. Stored locally, only sent to Anthropic.
          </p>
          <div className="settings__input-row">
            <input
              type={masked ? "password" : "text"}
              className="settings__input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              spellCheck={false}
            />
            <button
              className="settings__toggle"
              onClick={() => setMasked(!masked)}
            >
              {masked ? "Show" : "Hide"}
            </button>
          </div>
          <span className="settings__hint">
            Get a key at{" "}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>
          </span>
        </div>

        <div className="settings__actions">
          <button
            className="settings__save"
            onClick={handleSave}
            disabled={!apiKey.trim()}
          >
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
