defmodule HeyiAmWeb.ShareController do
  use HeyiAmWeb, :controller

  import HeyiAmWeb.Helpers, only: [format_loc: 1, slugify: 1]

  alias HeyiAm.Accounts
  alias HeyiAm.Shares

  @gone_tokens MapSet.new(~w(deleted expired removed))

  defp load_share(token) do
    Shares.get_published_share_by_token(token)
  end

  defp build_session(share) do
    base =
      share
      |> Map.from_struct()
      |> Map.put(:loc_changed, format_loc(share.loc_changed))
      |> Map.put(:user, %{
        username: (share.user && share.user.username) || "anonymous",
        display_name: (share.user && (share.user.display_name || share.user.username)) || "Anonymous"
      })
      |> Map.put(:project, %{
        title: share.project_name,
        slug: slugify(share.project_name)
      })
      # Default nil numeric/list fields so templates don't crash on arithmetic/length
      |> Map.update(:files_changed, 0, &(&1 || 0))
      |> Map.update(:turns, 0, &(&1 || 0))
      |> Map.update(:duration_minutes, 0, &(&1 || 0))
      |> Map.update(:skills, [], &(&1 || []))
      |> Map.update(:tools, [], &(&1 || []))

    # Fetch detail data from S3 and normalize keys to match template expectations.
    # CLI uploads session.json with camelCase keys; templates use snake_case with
    # legacy field names. This function bridges the two.
    detail = fetch_session_detail(share.session_storage_key)

    base
    |> Map.put(:beats, detail["beats"])
    |> Map.put(:qa_pairs, detail["qa_pairs"])
    |> Map.put(:highlights, detail["highlights"])
    |> Map.put(:tool_breakdown, detail["tool_breakdown"])
    |> Map.put(:top_files, detail["top_files"])
    |> Map.put(:transcript_excerpt, detail["transcript_excerpt"])
    |> Map.put(:turn_timeline, detail["turn_timeline"])
    |> Map.put(:agent_summary, detail["agent_summary"])
  end

  @doc false
  def normalize_session_detail(data) when is_map(data) do
    %{
      "beats" => normalize_beats(data["executionPath"] || data["beats"] || []),
      "qa_pairs" => data["qaPairs"] || data["qa_pairs"] || [],
      "highlights" => data["highlights"] || [],
      "tool_breakdown" => normalize_tool_breakdown(data["toolBreakdown"] || data["tool_breakdown"] || []),
      "top_files" => normalize_top_files(data["topFiles"] || data["top_files"] || []),
      "transcript_excerpt" => data["transcriptExcerpt"] || data["transcript_excerpt"] || [],
      "turn_timeline" => normalize_turn_timeline(data["turnTimeline"] || data["turn_timeline"] || []),
      "agent_summary" => data["agentSummary"] || data["agent_summary"]
    }
  end
  def normalize_session_detail(_), do: empty_detail()

  defp empty_detail do
    %{
      "beats" => [],
      "qa_pairs" => [],
      "highlights" => [],
      "tool_breakdown" => [],
      "top_files" => [],
      "transcript_excerpt" => [],
      "turn_timeline" => [],
      "agent_summary" => nil
    }
  end

  # CLI uses {title, description}; template expects {label, description}
  defp normalize_beats(steps) when is_list(steps) do
    Enum.map(steps, fn step ->
      %{
        "label" => step["title"] || step["label"] || "",
        "description" => step["description"] || step["body"] || ""
      }
    end)
  end
  defp normalize_beats(_), do: []

  # CLI uses {tool, count}; template expects {name, count}
  defp normalize_tool_breakdown(tools) when is_list(tools) do
    Enum.map(tools, fn tool ->
      %{
        "name" => tool["tool"] || tool["name"] || "",
        "count" => tool["count"] || 0
      }
    end)
  end
  defp normalize_tool_breakdown(_), do: []

  # CLI uses {path, additions, deletions}; template expects {path, touches}
  defp normalize_top_files(files) when is_list(files) do
    Enum.map(files, fn file ->
      touches = file["touches"] || (file["additions"] || 0) + (file["deletions"] || 0)
      %{
        "path" => file["path"] || "",
        "touches" => max(touches, 1)
      }
    end)
  end
  defp normalize_top_files(_), do: []

  # CLI uses {timestamp, type, content, tools}; template expects {turn, prompt, tools}
  defp normalize_turn_timeline(turns) when is_list(turns) do
    turns
    |> Enum.with_index(1)
    |> Enum.map(fn {turn, idx} ->
      %{
        "turn" => turn["turn"] || idx,
        "prompt" => turn["content"] || turn["prompt"] || "",
        "tools" => turn["tools"] || []
      }
    end)
  end
  defp normalize_turn_timeline(_), do: []

  defp fetch_session_detail(nil), do: empty_detail()
  defp fetch_session_detail(key) do
    case HeyiAm.ObjectStorage.get_object(key) do
      {:ok, body} ->
        case Jason.decode(body) do
          {:ok, data} when is_map(data) -> normalize_session_detail(data)
          _ -> empty_detail()
        end
      _ -> empty_detail()
    end
  end

  def show_in_project(conn, %{"username" => username, "project" => project_slug, "session" => session_slug}) do
    with %{} = user <- Accounts.get_user_by_username(username),
         %{} = share <- load_share_by_slug_or_token(user.id, project_slug, session_slug) do
      session = build_session(share)

      render(conn, :show,
        session: session,
        page_title: session.title,
        portfolio_layout: "editorial",
        breadcrumb: %{username: username, project_slug: project_slug, project_title: share.project_name}
      )
    else
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")
    end
  end

  # Try slug match first (project-aware), fall back to token for backward compat
  defp load_share_by_slug_or_token(user_id, project_slug, session_slug) do
    Shares.get_published_share_by_project_slug(user_id, project_slug, session_slug) ||
      Shares.get_published_share_by_token(session_slug)
  end

  def show(conn, %{"token" => token}) do
    if MapSet.member?(@gone_tokens, token) do
      conn
      |> put_status(:gone)
      |> put_view(HeyiAmWeb.ShareHTML)
      |> render(:gone, token: token)
    else
      case load_share(token) do
        nil ->
          conn
          |> put_status(:not_found)
          |> put_view(HeyiAmWeb.ErrorHTML)
          |> render(:"404")

        share ->
          session = build_session(share)

          render(conn, :show,
            session: session,
            page_title: session.title,
            portfolio_layout: "editorial"
          )
      end
    end
  end

  def transcript(conn, %{"token" => token}) do
    case load_share(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      share ->
        session = build_session(share)
        total_turns = share.turns || 0

        # Try fetching the full log from S3, fall back to the DB excerpt
        {transcript_lines, skipped_turns} = fetch_transcript(share, total_turns)

        render(conn, :transcript,
          session: session,
          transcript: transcript_lines,
          skipped_turns: skipped_turns,
          page_title: "Transcript — #{session.title}",
          portfolio_layout: "editorial"
        )
    end
  end

  # Attempt to load the full transcript log from object storage.
  # Falls back to the transcript_excerpt stored in the DB.
  defp fetch_transcript(share, total_turns) do
    case fetch_log_from_s3(share.log_storage_key) do
      {:ok, full_log} ->
        {full_log, 0}

      :error ->
        {[], total_turns}
    end
  end

  defp fetch_log_from_s3(nil), do: :error
  defp fetch_log_from_s3(key) do
    with {:ok, url} <- HeyiAm.ObjectStorage.presign_get(key),
         {:ok, %{status: 200, body: body}} <- Req.get(url) do
      case Jason.decode(body) do
        {:ok, lines} when is_list(lines) ->
          # log.json is a flat string array like ["> prompt", "[AI] ...", "[TOOL] ..."]
          # Convert to the map format the transcript template expects
          {:ok, build_transcript_turns(lines)}

        _ ->
          :error
      end
    else
      _ -> :error
    end
  end

  defp build_transcript_turns(lines) do
    lines
    |> Enum.with_index(1)
    |> Enum.map(fn {line, idx} ->
      {role, text} = classify_log_line(line)
      %{"role" => role, "id" => "Turn #{idx}", "text" => text, "timestamp" => nil}
    end)
  end

  defp classify_log_line("> " <> rest), do: {"dev", rest}
  defp classify_log_line("[AI] " <> rest), do: {"ai", rest}
  defp classify_log_line("[TOOL] " <> rest), do: {"ai", "[Tool] " <> rest}
  defp classify_log_line(line), do: {"ai", line}

  def verify(conn, %{"token" => token}) do
    case load_share(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      share ->
        session = build_session(share)

        content_hash = HeyiAm.Signature.content_hash(share)
        signed = HeyiAm.Signature.signed?(share)
        verified = HeyiAm.Signature.verify(share) == :ok

        signature_status =
          cond do
            verified -> "verified"
            signed -> "invalid"
            true -> "unverified"
          end

        verification = %{
          token: token,
          hash: content_hash,
          signature: share.signature,
          public_key: share.public_key,
          signature_status: signature_status,
          recorded_at: share.recorded_at,
          verified_at: share.verified_at
        }

        render(conn, :verify,
          session: session,
          verification: verification,
          page_title: "Verify — #{session.title}"
        )
    end
  end
end
