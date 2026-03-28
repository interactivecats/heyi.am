defmodule HeyiAmAppWeb.PreviewController do
  use HeyiAmAppWeb, :controller

  alias HeyiAm.Projects
  alias HeyiAm.Shares

  def project(conn, %{"slug" => slug}) do
    user = conn.assigns.current_scope.user

    case Projects.get_project_by_slug(user.id, slug) do
      nil ->
        conn |> put_status(:not_found) |> text("Project not found")

      %{rendered_html: html, title: title} when is_binary(html) and html != "" ->
        render_preview(conn, html, title)

      _project ->
        conn |> put_status(:not_found) |> text("No rendered content yet — publish from the CLI first")
    end
  end

  def session(conn, %{"id" => id}) do
    user = conn.assigns.current_scope.user

    case Shares.get_user_share(user.id, id) do
      nil ->
        conn |> put_status(:not_found) |> text("Session not found")

      %{rendered_html: html, title: title} when is_binary(html) and html != "" ->
        render_preview(conn, html, title)

      _share ->
        conn |> put_status(:not_found) |> text("No rendered content yet — publish from the CLI first")
    end
  end

  defp render_preview(conn, html, title) do
    conn
    |> put_resp_header("content-type", "text/html; charset=utf-8")
    |> send_resp(200, preview_shell(html, title))
  end

  defp preview_shell(rendered_html, title) do
    public_css = Application.get_env(:heyi_am_app_web, :public_url) <> "/assets/css/app.css"
    public_js = Application.get_env(:heyi_am_app_web, :public_url) <> "/assets/js/app.js"
    safe_title = title |> Phoenix.HTML.html_escape() |> Phoenix.HTML.safe_to_string()

    """
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Preview: #{safe_title} · heyi.am</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="#{public_css}" />
      <script defer src="#{public_js}"></script>
      <style>
        .preview-banner {
          position: sticky; top: 0; z-index: 100;
          background: #191c1e; color: #f0f1f3;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 0.75rem; font-weight: 500;
          letter-spacing: 0.04em; text-transform: uppercase;
          text-align: center; padding: 0.5rem;
        }
      </style>
    </head>
    <body>
      <div class="preview-banner">Preview — not publicly visible</div>
      #{rendered_html}
    </body>
    </html>
    """
  end
end
