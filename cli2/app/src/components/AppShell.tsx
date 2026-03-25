import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

interface AppShellProps {
  /** Page title shown in header next to logo */
  title?: string;
  /** Whether to render the sidebar */
  showSidebar?: boolean;
  /** Content rendered inside the sidebar */
  sidebarContent?: ReactNode;
  /** Sticky bottom action bar content */
  bottomBar?: ReactNode;
  /** Back button handler — shows back arrow when provided */
  onBack?: () => void;
  /** Actions rendered in the header right area (before auth/settings) */
  headerActions?: ReactNode;
  /** Main content */
  children: ReactNode;
}

/**
 * AppShell provides the consistent layout for all CLI screens:
 * Header (logo, back, title, auth, settings) + optional Sidebar + Main + optional BottomBar
 */
export function AppShell({
  title,
  showSidebar = false,
  sidebarContent,
  bottomBar,
  onBack,
  headerActions,
  children,
}: AppShellProps) {
  const auth = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="app-header" role="banner">
        <div className="app-header__left">
          {onBack != null && (
            <button
              className="app-header__back"
              onClick={onBack}
              aria-label="Go back"
              type="button"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <span className="app-header__logo" aria-label="heyi.am home">
            heyi.am
          </span>
          {title != null && title.length > 0 && (
            <span className="app-header__title">{title}</span>
          )}
        </div>
        <div className="app-header__right">
          {headerActions}
          <div className="app-header__auth-indicator">
            <span
              className={`app-header__auth-dot${auth.authenticated ? ' app-header__auth-dot--connected' : ''}`}
              aria-label={auth.authenticated ? 'Authenticated' : 'Not authenticated'}
            />
          </div>
          <button
            className="app-header__icon-btn"
            aria-label="Settings"
            type="button"
            onClick={() => navigate('/settings')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="app-shell__body">
        {showSidebar && (
          <aside className="app-sidebar" role="complementary">
            {sidebarContent}
          </aside>
        )}
        <main className="app-main" role="main">
          {children}
          {bottomBar != null && (
            <div className="app-bottom-bar">
              <div className="app-bottom-bar__inner glass-panel">
                {bottomBar}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
