defmodule HeyiAmVibeWeb.VibeController do
  use HeyiAmVibeWeb, :controller

  alias HeyiAm.Vibes
  alias HeyiAm.Vibes.Meta

  @archetype_meta Meta.archetype_meta()
  @modifier_phrases Meta.modifier_phrases()

  def index(conn, _params) do
    count = Vibes.count_vibes()
    distribution = Vibes.archetype_distribution()
    recent = Vibes.list_recent_vibes(limit: 12)

    render(conn, :index,
      count: count,
      distribution: distribution,
      recent: recent,
      archetype_meta: @archetype_meta,
      modifier_phrases: @modifier_phrases,
      page_title: "HOW DO YOU VIBE?"
    )
  end

  def show(conn, %{"short_id" => short_id}) do
    case Vibes.get_vibe_by_short_id(short_id) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmVibeWeb.ErrorHTML)
        |> render(:"404")

      %{anonymized_at: %DateTime{}} ->
        conn
        |> put_status(:gone)
        |> render(:gone, page_title: "Vibe removed")

      vibe ->
        archetype = Map.get(@archetype_meta, vibe.archetype_id, %{name: "The Vibe Coder", tagline: ""})
        modifier = Map.get(@modifier_phrases, vibe.modifier_id, nil)
        headline = vibe.headline || build_headline(archetype.name, modifier)
        base_url = HeyiAmVibeWeb.Endpoint.url()

        {voice, ai, collab} = build_stat_columns(vibe.stats)

        render(conn, :show,
          vibe: vibe,
          archetype: archetype,
          modifier: modifier,
          headline: headline,
          voice_stats: voice,
          ai_stats: ai,
          collab_stats: collab,
          page_title: headline,
          og_title: "I'm #{headline}",
          og_description: vibe.narrative,
          og_image: "#{base_url}/#{vibe.short_id}/card.png",
          og_url: "#{base_url}/#{vibe.short_id}"
        )
    end
  end

  def archetype(conn, %{"id" => id}) do
    meta = Map.get(@archetype_meta, id)

    if is_nil(meta) do
      conn
      |> put_status(:not_found)
      |> put_view(HeyiAmVibeWeb.ErrorHTML)
      |> render(:"404")
    else
      distribution = Vibes.archetype_distribution()
      match_count = Enum.find_value(distribution, 0, fn {aid, c} -> if aid == id, do: c end)

      render(conn, :archetype,
        archetype_id: id,
        archetype: meta,
        match_count: match_count,
        page_title: "#{meta.name} — HOW DO YOU VIBE?"
      )
    end
  end

  def card_image(conn, %{"short_id" => short_id}) do
    case Vibes.get_vibe_by_short_id(short_id) do
      nil ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "not found"})

      vibe ->
        archetype = Map.get(@archetype_meta, vibe.archetype_id, %{name: "The Vibe Coder", tagline: ""})
        modifier = Map.get(@modifier_phrases, vibe.modifier_id, nil)
        headline = vibe.headline || build_headline(archetype.name, modifier)

        {voice, ai, collab} = build_stat_columns(vibe.stats)

        narrative_lines = HeyiAmVibeWeb.VibeHTML.wrap_text(vibe.narrative, 90)
        narrative_line_count = length(narrative_lines)
        # Narrative starts at y=112, each line is 20px, plus 15px padding + 1px divider
        stats_y = 112 + narrative_line_count * 20 + 16

        svg =
          Phoenix.Template.render_to_string(
            HeyiAmVibeWeb.VibeHTML,
            "card_svg",
            "html",
            %{
              headline: headline,
              narrative_lines: narrative_lines,
              stats_y: stats_y,
              voice_stats: voice,
              ai_stats: ai,
              collab_stats: collab,
              sources: Enum.join(vibe.sources || [], ", "),
              session_count: vibe.session_count,
              total_turns: vibe.total_turns
            }
          )

        case svg_to_png(svg) do
          {:ok, png} ->
            conn
            |> put_resp_content_type("image/png")
            |> put_resp_header("cache-control", "public, max-age=86400, immutable")
            |> send_resp(200, png)

          :no_converter ->
            # Fallback to SVG if no PNG converter is installed
            conn
            |> put_resp_content_type("image/svg+xml")
            |> put_resp_header("cache-control", "public, max-age=86400, immutable")
            |> send_resp(200, svg)
        end
    end
  end

  # Convert SVG to PNG using a system tool.
  # Safe from RCE: the SVG is generated from our own template — user data
  # (headline, narrative, stats) is interpolated into XML text nodes, never
  # into command arguments. The tool reads from a temp file, not stdin.
  defp svg_to_png(svg) do
    tmp_svg = Path.join(System.tmp_dir!(), "vibe_card_#{:erlang.unique_integer([:positive])}.svg")
    tmp_png = Path.rootname(tmp_svg) <> ".png"

    try do
      # Strip Phoenix debug attributes and comments that break SVG renderers
      clean_svg =
        svg
        |> String.replace(~r/ data-phx-loc="[^"]*"/, "")
        |> String.replace(~r/<!-- <.*?> -->/s, "")

      File.write!(tmp_svg, clean_svg)

      result =
        cond do
          System.find_executable("rsvg-convert") ->
            System.cmd("rsvg-convert", ["--width", "1200", "--format", "png", "--output", tmp_png, tmp_svg],
              stderr_to_stdout: true)

          System.find_executable("magick") ->
            System.cmd("magick", [tmp_svg, "-resize", "1200x630", tmp_png],
              stderr_to_stdout: true)

          System.find_executable("convert") ->
            System.cmd("convert", [tmp_svg, "-resize", "1200x630", tmp_png],
              stderr_to_stdout: true)

          true ->
            {:skip, 1}
        end

      case result do
        {_, 0} ->
          case File.read(tmp_png) do
            {:ok, png} -> {:ok, png}
            _ -> :no_converter
          end

        _ ->
          :no_converter
      end
    after
      File.rm(tmp_svg)
      File.rm(tmp_png)
    end
  end

  def delete_confirm(conn, %{"short_id" => short_id} = params) do
    code = params["code"] || ""

    case Vibes.get_vibe_by_short_id(short_id) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmVibeWeb.ErrorHTML)
        |> render(:"404")

      %{anonymized_at: %DateTime{}} ->
        conn
        |> put_status(:gone)
        |> render(:gone, page_title: "Vibe removed")

      vibe ->
        if byte_size(code) == byte_size(vibe.delete_code) and
             Plug.Crypto.secure_compare(vibe.delete_code, code) do
          render(conn, :delete_confirm,
            vibe: vibe,
            code: code,
            page_title: "Delete your vibe?"
          )
        else
          conn
          |> put_status(:forbidden)
          |> put_view(HeyiAmVibeWeb.ErrorHTML)
          |> render(:"404")
        end
    end
  end

  def delete(conn, %{"short_id" => short_id} = params) do
    code = params["code"] || ""

    case Vibes.delete_vibe(short_id, code) do
      {:ok, _vibe} ->
        conn
        |> redirect(to: ~p"/?deleted=true")

      {:error, :already_anonymized} ->
        conn
        |> put_status(:gone)
        |> render(:gone, page_title: "Vibe removed")

      {:error, :not_found} ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmVibeWeb.ErrorHTML)
        |> render(:"404")

      {:error, :invalid_code} ->
        conn
        |> put_status(:forbidden)
        |> put_view(HeyiAmVibeWeb.ErrorHTML)
        |> render(:"404")
    end
  end

  defp build_headline(name, nil), do: name
  defp build_headline(name, modifier), do: "#{name} #{modifier}"

  defp format_pct(nil), do: nil
  defp format_pct(val) when is_number(val), do: "#{round(val * 100)}%"

  defp format_ratio(nil), do: nil
  defp format_ratio(val) when is_number(val), do: "#{Float.round(val * 1.0, 1)}:1"

  defp format_num(n) when is_integer(n) and n >= 1000 do
    n |> Integer.to_string() |> String.replace(~r/\B(?=(\d{3})+(?!\d))/, ",")
  end

  defp format_num(n) when is_number(n), do: "#{n}"

  defp build_stat_columns(stats) when is_map(stats) do
    voice =
      [
        stat(stats, "expletives", "Expletives", &format_num/1),
        stat(stats, "avg_prompt_words", "Avg prompt", fn v -> "#{v} words" end),
        stat(stats, "please_rate", "Please rate", &format_pct/1),
        stat(stats, "question_rate", "Questions", &format_pct/1),
        stat(stats, "late_night_rate", "Late night", &format_pct/1),
        stat(stats, "reasoning_rate", "Thinks out loud", &format_pct/1),
        stat(stats, "interruptions", "Interruptions", &format_num/1)
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.take(6)

    ai =
      [
        stat(stats, "read_write_ratio", "Read:write", &format_ratio/1),
        stat(stats, "test_runs", "Test runs", fn v ->
          case stats["failed_tests"] do
            ft when is_number(ft) and ft > 0 -> "#{format_num(v)}, #{round(ft / v * 100)}% fail"
            _ -> format_num(v)
          end
        end),
        stat(stats, "longest_tool_chain", "Longest burst", fn v -> "#{format_num(v)} calls" end),
        stat(stats, "self_corrections", "Self-corrections", &format_num/1),
        stat(stats, "apologies", "AI apologies", &format_num/1),
        stat(stats, "bash_commands", "Bash commands", &format_num/1)
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.take(6)

    collab =
      [
        stat(stats, "corrections", "Corrections", &format_num/1),
        stat(stats, "longest_autopilot", "Longest leash", fn v -> "#{format_num(v)} turns" end),
        stat(stats, "first_blood_min", "First correction", fn v -> "#{v} min" end),
        stat(stats, "redirects_per_hour", "Redirects/hr", &format_num/1),
        stat(stats, "scope_creep", "Scope creep", &format_num/1)
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.take(6)

    {voice, ai, collab}
  end

  defp build_stat_columns(_), do: {[], [], []}

  defp stat(stats, key, label, fmt) do
    case stats[key] do
      v when is_number(v) and v > 0 -> {label, fmt.(v)}
      _ -> nil
    end
  end

end
