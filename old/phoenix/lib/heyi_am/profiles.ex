defmodule HeyiAm.Profiles do
  @moduledoc "Computes and manages AI collaboration profiles from session data."

  import Ecto.Query
  alias HeyiAm.Repo
  alias HeyiAm.Shares.Share
  alias HeyiAm.Accounts.User

  @minimum_shares 8

  @doc """
  Compute an AI collaboration profile from all of a user's shares.

  Returns a map with dimension data or an empty default when the user has no shares.
  """
  def compute_profile(user_id) do
    shares =
      from(s in Share, where: s.user_id == ^user_id)
      |> Repo.all()

    if shares == [] do
      default_profile()
    else
      %{
        "task_scoping" => compute_task_scoping(shares),
        "active_redirection" => compute_active_redirection(shares),
        "verification" => compute_verification(shares),
        "tool_orchestration" => compute_tool_orchestration(shares),
        "session_count" => length(shares),
        "date_range" => compute_date_range(shares)
      }
    end
  end

  @doc "Check whether the user has enough shares for public profile display."
  def meets_threshold?(user_id) do
    count =
      from(s in Share, where: s.user_id == ^user_id, select: count())
      |> Repo.one()

    count >= @minimum_shares
  end

  @doc """
  Recompute profile from shares and cache the result in user.profile_data.

  This operation is idempotent -- calling it multiple times produces the same result.
  """
  def refresh_profile(user_id) do
    profile = compute_profile(user_id)

    from(u in User, where: u.id == ^user_id)
    |> Repo.update_all(set: [profile_data: profile, updated_at: DateTime.utc_now(:second)])

    {:ok, profile}
  end

  # -- Task Scoping --

  defp compute_task_scoping(shares) do
    steps = shares |> Enum.map(& &1.step_count) |> Enum.reject(&is_nil/1)
    durations = shares |> Enum.map(& &1.duration_minutes) |> Enum.reject(&is_nil/1)

    avg_steps = safe_average(steps)
    avg_duration = safe_average(durations)

    %{
      "avg_steps" => round_to(avg_steps, 1),
      "avg_duration" => round_to(avg_duration, 0),
      "label" => scope_label(avg_steps)
    }
  end

  @doc "Convert average step count to a human-readable label."
  def scope_label(nil), do: "unknown"
  def scope_label(avg_steps) when avg_steps <= 5, do: "tight"
  def scope_label(avg_steps) when avg_steps <= 8, do: "focused"
  def scope_label(_avg_steps), do: "broad"

  # -- Active Redirection --

  defp compute_active_redirection(shares) do
    ratios =
      shares
      |> Enum.filter(fn s ->
        s.turn_count != nil and s.step_count != nil and s.step_count > 0
      end)
      |> Enum.map(fn s -> s.turn_count / s.step_count end)

    avg_ratio = safe_average(ratios)

    %{
      "avg_ratio" => round_to(avg_ratio, 1),
      "label" => redirection_label(avg_ratio)
    }
  end

  @doc "Convert average turn/step ratio to a human-readable label."
  def redirection_label(nil), do: "unknown"
  def redirection_label(avg_ratio) when avg_ratio <= 3, do: "high"
  def redirection_label(avg_ratio) when avg_ratio <= 6, do: "moderate"
  def redirection_label(_avg_ratio), do: "developing"

  # -- Verification --

  defp compute_verification(shares) do
    shares_with_summary = Enum.filter(shares, &has_tool_usage?/1)

    rate =
      if shares_with_summary == [] do
        nil
      else
        bash_count =
          Enum.count(shares_with_summary, fn s ->
            tool_usage = get_in(s.summary, ["toolUsage"]) || %{}
            Map.has_key?(tool_usage, "Bash")
          end)

        bash_count / length(shares_with_summary)
      end

    %{
      "rate" => round_to(rate, 2),
      "label" => verification_label(rate)
    }
  end

  @doc "Convert verification rate to a human-readable label."
  def verification_label(nil), do: "unknown"
  def verification_label(rate) when rate >= 0.8, do: "consistent"
  def verification_label(rate) when rate >= 0.5, do: "partial"
  def verification_label(_rate), do: "rare"

  # -- Tool Orchestration --

  defp compute_tool_orchestration(shares) do
    diversities =
      shares
      |> Enum.filter(&has_tool_usage?/1)
      |> Enum.map(fn s ->
        tool_usage = get_in(s.summary, ["toolUsage"]) || %{}
        map_size(tool_usage)
      end)

    avg_diversity = safe_average(diversities)

    %{
      "avg_diversity" => round_to(avg_diversity, 1),
      "label" => orchestration_label(avg_diversity)
    }
  end

  @doc "Convert average tool diversity to a human-readable label."
  def orchestration_label(nil), do: "unknown"
  def orchestration_label(avg_diversity) when avg_diversity >= 6, do: "strong"
  def orchestration_label(avg_diversity) when avg_diversity >= 3, do: "moderate"
  def orchestration_label(_avg_diversity), do: "limited"

  # -- Date Range --

  defp compute_date_range(shares) do
    months =
      shares
      |> Enum.map(& &1.session_month)
      |> Enum.reject(&is_nil/1)
      |> Enum.sort()

    case months do
      [] -> nil
      [single] -> format_month(single)
      list -> "#{format_month(List.first(list))}-#{format_month(List.last(list))}"
    end
  end

  defp format_month(month_str) when is_binary(month_str) do
    case String.split(month_str, "-") do
      [year, month_num] ->
        month_name =
          case month_num do
            "01" -> "Jan"
            "02" -> "Feb"
            "03" -> "Mar"
            "04" -> "Apr"
            "05" -> "May"
            "06" -> "Jun"
            "07" -> "Jul"
            "08" -> "Aug"
            "09" -> "Sep"
            "10" -> "Oct"
            "11" -> "Nov"
            "12" -> "Dec"
            _ -> month_num
          end

        "#{month_name} #{year}"

      _ ->
        month_str
    end
  end

  # -- Helpers --

  defp default_profile do
    %{
      "task_scoping" => %{"avg_steps" => nil, "avg_duration" => nil, "label" => "unknown"},
      "active_redirection" => %{"avg_ratio" => nil, "label" => "unknown"},
      "verification" => %{"rate" => nil, "label" => "unknown"},
      "tool_orchestration" => %{"avg_diversity" => nil, "label" => "unknown"},
      "session_count" => 0,
      "date_range" => nil
    }
  end

  defp has_tool_usage?(share) do
    is_map(share.summary) and is_map(get_in(share.summary, ["toolUsage"]))
  end

  defp safe_average([]), do: nil
  defp safe_average(list), do: Enum.sum(list) / length(list)

  defp round_to(nil, _precision), do: nil
  defp round_to(value, 0), do: round(value)

  defp round_to(value, precision) do
    Float.round(value / 1, precision)
  end
end
