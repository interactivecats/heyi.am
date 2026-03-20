defmodule HeyiAmWeb.ShareController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Shares
  alias HeyiAm.Repo

  plug :put_layout, html: false

  @colors ~w(violet rose teal amber sky)

  def show(conn, %{"token" => token}) do
    case Shares.get_by_token(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> render(:not_found)

      share ->
        share = Repo.preload(share, :user)
        assigns = build_share_assigns(share)

        og_image_url = share.hero_image_url || get_in(share.summary || %{}, ["ogImageUrl"])
        canonical_url = "#{HeyiAmWeb.Endpoint.url()}/s/#{share.token}"
        og_description = share.context || share.one_line_summary || share.title

        template =
          if share.user,
            do: share.user.portfolio_layout || "editorial",
            else: "editorial"

        accent =
          if share.user,
            do: share.user.portfolio_accent || "violet",
            else: "violet"

        conn
        |> put_resp_header("referrer-policy", "no-referrer")
        |> put_resp_header("x-content-type-options", "nosniff")
        |> put_resp_header("cache-control", "public, max-age=60, stale-while-revalidate=300")
        |> assign(:page_title, "#{share.title} -- heyi.am")
        |> assign(:og_title, "#{share.title} -- heyi.am")
        |> assign(:og_description, og_description)
        |> assign(:og_url, canonical_url)
        |> assign(:og_image, og_image_url)
        |> render(:show, [{:share, share}, {:template, template}, {:accent, accent} | Enum.to_list(assigns)])
    end
  end

  def transcript(conn, %{"token" => token}) do
    case Shares.get_by_token(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> render(:not_found)

      share ->
        share = Repo.preload(share, :user)
        assigns = build_share_assigns(share)

        template =
          if share.user,
            do: share.user.portfolio_layout || "editorial",
            else: "editorial"

        accent =
          if share.user,
            do: share.user.portfolio_accent || "violet",
            else: "violet"

        decisions =
          (assigns.steps || [])
          |> Enum.filter(fn s -> s["type"] in ["correction", "insight"] end)

        conn
        |> assign(:page_title, "Transcript: #{share.title} -- heyi.am")
        |> render(:transcript,
          share: share,
          template: template,
          accent: accent,
          prompts: assigns.prompts,
          decisions: decisions
        )
    end
  end

  @doc """
  Normalize summary JSONB into clean assigns for the share template.
  Migrated from HeyiAm.Renderer.build_assigns/1.
  """
  def build_share_assigns(share) do
    summary = share.summary || %{}
    tool_usage = Map.get(summary, "toolUsage", %{})
    highlights = Map.get(summary, "highlights", [])
    beats = Map.get(summary, "beats", [])
    prompts = Map.get(summary, "prompts", [])
    files_changed = Map.get(summary, "filesChanged", [])

    tool_call_count =
      tool_usage
      |> Enum.reduce(0, fn {_, v}, acc -> acc + Map.get(v, "count", 0) end)

    steps =
      case beats do
        beats when is_list(beats) and length(beats) > 0 ->
          beats
          |> Enum.filter(fn b -> Map.get(b, "type") in ["step", "correction", "insight", "win"] end)
          |> Enum.take(7)
          |> Enum.map(fn b ->
            %{
              "title" => Map.get(b, "title", ""),
              "body" => Map.get(b, "description", ""),
              "insight" => Map.get(b, "directionNote", ""),
              "type" => Map.get(b, "type", "step")
            }
          end)

        _ ->
          Map.get(summary, "executionPath", nil) || Map.get(summary, "tutorialSteps", [])
      end

    total_turns = Map.get(summary, "totalTurns", nil) || share.turn_count

    top_tools =
      tool_usage
      |> Enum.sort_by(fn {_, v} -> -Map.get(v, "count", 0) end)
      |> Enum.take(5)

    %{
      steps: steps,
      highlights: highlights,
      tool_usage: tool_usage,
      top_tools: top_tools,
      total_turns: total_turns,
      tool_call_count: tool_call_count,
      prompts: prompts,
      files_changed: files_changed,
      colors: @colors
    }
  end
end
