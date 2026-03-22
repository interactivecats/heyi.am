defmodule HeyiAmWeb.AppShell do
  @moduledoc """
  App shell components providing the two main layout shells:

  - `public_shell/1` — for visitor-facing pages (portfolio, session case study, project)
  - `editor_shell/1` — for authenticated editor/workbench views (portfolio editor, project editor)

  Both shells compose a topbar, optional sidebar, and content area using slots.
  """
  use Phoenix.Component

  # ── Public Shell ──────────────────────────────────────────────
  @doc """
  Renders the public app shell used by portfolio, session case study, and project pages.

  ## Layout
  - Topbar: logo left, nav tabs center, status indicator right
  - No sidebar
  - Centered max-width content area (~1200px)
  - Light surface background

  ## Attributes
  - `logo_text` — text for the logo (defaults to "heyi.am")
  - `logo_href` — link target for logo (defaults to "/")
  - `current_page` — identifies the active nav tab for aria-current

  ## Slots
  - `nav_item` — navigation tab items (requires `href` and `label` attrs)
  - `status` — optional status indicator in the topbar right area
  - `inner_block` — the main page content

  ## Examples

      <.public_shell logo_text="heyi.am" current_page="portfolio">
        <:nav_item href="/" label="Portfolio" />
        <:nav_item href="/archive" label="Archive" />
        <h1>Page content</h1>
      </.public_shell>
  """
  attr :logo_text, :string, default: "heyi.am"
  attr :logo_href, :string, default: "/"
  attr :current_page, :string, default: nil
  attr :class, :string, default: nil

  slot :nav_item do
    attr :href, :string, required: true
    attr :label, :string, required: true
  end

  slot :status
  slot :inner_block, required: true

  def public_shell(assigns) do
    ~H"""
    <div class="public-shell">
      <header class="topbar" role="banner">
        <div class="topbar-left">
          <a href={@logo_href} class="topbar-logo">
            {@logo_text}
          </a>
          <nav :if={@nav_item != []} aria-label="Main navigation">
            <ul class="topbar-nav">
              <li :for={item <- @nav_item}>
                <a
                  href={item.href}
                  class="topbar-nav-link"
                  aria-current={if item.label == @current_page, do: "page"}
                >
                  {item.label}
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div class="topbar-actions">
          {render_slot(@status)}
        </div>
      </header>

      <main class={["public-shell-main", @class]}>
        {render_slot(@inner_block)}
      </main>

      <footer style="border-top: 1px solid var(--outline-variant); padding-block: var(--spacing-6); margin-block-start: var(--spacing-8);">
        <div style="max-width: var(--content-max-width); margin-inline: auto; padding-inline: var(--spacing-6); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--spacing-4);">
          <span class="label-sm" style="color: var(--on-surface-variant);">
            heyi.am
          </span>
          <nav aria-label="Footer" style="display: flex; gap: var(--spacing-6);">
            <a href="/terms" class="label-sm" style="color: var(--on-surface-variant); text-decoration: none;">Terms</a>
            <a href="/privacy" class="label-sm" style="color: var(--on-surface-variant); text-decoration: none;">Privacy</a>
          </nav>
        </div>
      </footer>
    </div>
    """
  end

  # ── Editor Shell ──────────────────────────────────────────────
  @doc """
  Renders the editor app shell used by portfolio editor, project editor, and workbench views.

  ## Layout
  - Dark topbar: logo + nav tabs + action buttons (right side)
  - Left sidebar: project tree / navigation
  - Content area fills remaining space

  ## Attributes
  - `logo_text` — text for the logo (defaults to "Workbench")
  - `logo_href` — link target for logo (defaults to "/")
  - `current_page` — identifies the active nav tab for aria-current

  ## Slots
  - `nav_item` — navigation tab items (requires `href` and `label` attrs)
  - `actions` — right-side action buttons (save, deploy, etc.)
  - `sidebar` — sidebar content (project tree, navigation links)
  - `inner_block` — the main editor content

  ## Examples

      <.editor_shell logo_text="Workbench" current_page="Portfolio">
        <:nav_item href="/drafts" label="Drafts" />
        <:nav_item href="/sessions" label="Sessions" />
        <:nav_item href="/portfolio" label="Portfolio" />
        <:actions>
          <button class="btn btn-secondary btn-sm">Seal</button>
          <button class="btn btn-primary btn-sm">Save & Deploy</button>
        </:actions>
        <:sidebar>
          <div class="sidebar-header">
            <div class="sidebar-header-icon">P</div>
            <div>
              <div class="sidebar-header-title">Project Alpha</div>
              <div class="sidebar-header-subtitle">Local Instance</div>
            </div>
          </div>
          <ul class="sidebar-nav">
            <li><a href="#" class="sidebar-nav-link active">Portfolio</a></li>
          </ul>
        </:sidebar>
        <div>Editor content here</div>
      </.editor_shell>
  """
  attr :logo_text, :string, default: "Workbench"
  attr :logo_href, :string, default: "/"
  attr :current_page, :string, default: nil
  attr :class, :string, default: nil

  slot :nav_item do
    attr :href, :string, required: true
    attr :label, :string, required: true
  end

  slot :actions
  slot :sidebar
  slot :inner_block, required: true

  def editor_shell(assigns) do
    ~H"""
    <div class="editor-shell">
      <header class="topbar topbar--editor" role="banner">
        <div class="topbar-left">
          <a href={@logo_href} class="topbar-logo">
            {@logo_text}
          </a>
          <nav :if={@nav_item != []} aria-label="Main navigation">
            <ul class="topbar-nav">
              <li :for={item <- @nav_item}>
                <a
                  href={item.href}
                  class="topbar-nav-link"
                  aria-current={if item.label == @current_page, do: "page"}
                >
                  {item.label}
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div class="topbar-actions">
          {render_slot(@actions)}
        </div>
      </header>

      <div class="app-shell">
        <aside :if={@sidebar != []} class="sidebar" role="complementary" aria-label="Sidebar navigation">
          {render_slot(@sidebar)}
        </aside>

        <main class={["app-shell-main", @class]}>
          {render_slot(@inner_block)}
        </main>
      </div>
    </div>
    """
  end
end
