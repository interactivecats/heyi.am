defmodule HeyiAmPublicWeb.ShareController do
  use HeyiAmPublicWeb, :controller

  alias HeyiAm.Accounts
  alias HeyiAm.Shares

  @gone_tokens MapSet.new(~w(deleted expired removed))

  def show_in_project(conn, %{
        "username" => username,
        "project" => project_slug,
        "session" => session_slug
      }) do
    with %{} = user <- Accounts.get_user_by_username(username),
         %{} = share <- load_share_by_slug_or_token(user.id, project_slug, session_slug),
         html when is_binary(html) and html != "" <- share.rendered_html do
      display_name =
        (share.user && (share.user.display_name || share.user.username)) || username

      render(conn, :rendered,
        rendered_html: html,
        template_name: share.template || "editorial",
        page_title: share.title,
        og_title: "#{share.title} — #{display_name}",
        og_description: og_description(share),
        og_url:
          HeyiAmPublicWeb.Endpoint.url() <>
            "/#{username}/#{project_slug}/#{session_slug}"
      )
    else
      _ ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmPublicWeb.ErrorHTML)
        |> render(:"404")
    end
  end

  def show(conn, %{"token" => token}) do
    if MapSet.member?(@gone_tokens, token) do
      conn
      |> put_status(:gone)
      |> put_view(HeyiAmPublicWeb.ShareHTML)
      |> render(:gone, token: token)
    else
      case Shares.get_published_share_by_token(token) do
        nil ->
          conn
          |> put_status(:not_found)
          |> put_view(HeyiAmPublicWeb.ErrorHTML)
          |> render(:"404")

        %{rendered_html: html} = share when is_binary(html) and html != "" ->
          username = (share.user && share.user.username) || "anonymous"

          display_name =
            (share.user && (share.user.display_name || username)) || "anonymous"

          render(conn, :rendered,
            rendered_html: html,
            template_name: share.template || "editorial",
            page_title: share.title,
            og_title: "#{share.title} — #{display_name}",
            og_description: og_description(share),
            og_url: HeyiAmPublicWeb.Endpoint.url() <> "/s/#{share.token}"
          )

        _share ->
          conn
          |> put_status(:not_found)
          |> put_view(HeyiAmPublicWeb.ErrorHTML)
          |> render(:"404")
      end
    end
  end

  # -- Private --

  defp load_share_by_slug_or_token(user_id, project_slug, session_slug) do
    Shares.get_published_share_by_project_slug(user_id, project_slug, session_slug) ||
      Shares.get_published_share_by_token(session_slug)
  end

  defp og_description(share) do
    if share.dev_take && share.dev_take != "" do
      String.slice(share.dev_take, 0, 160)
    else
      duration = share.duration_minutes || 0
      turns = share.turns || 0
      loc = share.loc_changed || 0
      skills = share.skills |> Enum.take(3) |> Enum.join(", ")
      summary = "#{duration}min, #{turns} turns, #{loc} lines changed"
      if skills != "", do: summary <> " — #{skills}", else: summary
    end
  end

end
