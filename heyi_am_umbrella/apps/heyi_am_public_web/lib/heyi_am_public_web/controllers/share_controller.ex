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

  def transcript(conn, %{"token" => token}) do
    case Shares.get_published_share_by_token(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmPublicWeb.ErrorHTML)
        |> render(:"404")

      share ->
        total_turns = share.turns || 0
        {transcript_lines, skipped_turns} = fetch_transcript(share, total_turns)

        render(conn, :transcript,
          session: build_transcript_session(share),
          transcript: transcript_lines,
          skipped_turns: skipped_turns,
          page_title: "Transcript — #{share.title}",
          portfolio_layout: "editorial"
        )
    end
  end

  # -- Private --

  defp load_share_by_slug_or_token(user_id, project_slug, session_slug) do
    Shares.get_published_share_by_project_slug(user_id, project_slug, session_slug) ||
      Shares.get_published_share_by_token(session_slug)
  end

  defp build_transcript_session(share) do
    username = (share.user && share.user.username) || "anonymous"
    display_name = (share.user && (share.user.display_name || username)) || "Anonymous"
    project_title = if(share.project, do: share.project.title, else: share.project_name)
    project_slug = if(share.project, do: share.project.slug, else: nil)

    %{
      token: share.token,
      title: share.title,
      duration_minutes: share.duration_minutes || 0,
      turns: share.turns || 0,
      files_changed: share.files_changed || 0,
      loc_changed: share.loc_changed || 0,
      recorded_at: share.recorded_at,
      user: %{username: username, display_name: display_name},
      project: %{title: project_title, slug: project_slug}
    }
  end

  defp og_description(share) do
    if share.dev_take && share.dev_take != "" do
      String.slice(share.dev_take, 0, 160)
    else
      duration = share.duration_minutes || 0
      turns = share.turns || 0
      loc = share.loc_changed || 0
      skills = share.skills |> Enum.take(3) |> Enum.join(", ")
      summary = "#{duration}min, #{turns} turns, #{loc} LOC"
      if skills != "", do: summary <> " — #{skills}", else: summary
    end
  end

  defp fetch_transcript(share, total_turns) do
    case fetch_log_from_s3(share.log_storage_key) do
      {:ok, lines} -> {lines, 0}
      :error -> {[], total_turns}
    end
  end

  defp fetch_log_from_s3(nil), do: :error

  defp fetch_log_from_s3(key) do
    with {:ok, url} <- HeyiAm.ObjectStorage.presign_get(key),
         {:ok, %{status: 200, body: body}} <- Req.get(url),
         {:ok, lines} when is_list(lines) <- Jason.decode(body) do
      turns =
        lines
        |> Enum.with_index(1)
        |> Enum.map(fn {line, idx} ->
          {role, text} = classify_log_line(line)

          %{
            "role" => role,
            "id" => "Turn #{idx}",
            "text" => clean_ai_tags(text),
            "timestamp" => nil
          }
        end)
        |> Enum.reject(fn turn -> turn["text"] == "" end)

      {:ok, turns}
    else
      _ -> :error
    end
  end

  defp classify_log_line("> " <> rest), do: {"dev", rest}
  defp classify_log_line("[AI] " <> rest), do: {"ai", rest}
  defp classify_log_line("[TOOL] " <> rest), do: {"ai", "[Tool] " <> rest}
  defp classify_log_line(line), do: {"ai", line}

  @doc false
  def clean_ai_tags(text) do
    text
    |> String.replace(~r/<antml_[a-z_]+>[\s\S]*?<\/antml_[a-z_]+>/, "")
    |> String.replace(~r/<system-reminder>[\s\S]*?<\/system-reminder>/, "")
    |> String.replace(~r/<teammate-message[^>]*>[\s\S]*?<\/teammate-message>/, "")
    |> String.replace(~r/<function_calls>[\s\S]*?<\/function_calls>/, "")
    |> String.replace(~r/<fast_mode_info>[\s\S]*?<\/fast_mode_info>/, "")
    |> String.replace(~r/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/, "")
    |> String.replace(~r/\n{3,}/, "\n\n")
    |> String.trim()
  end
end
