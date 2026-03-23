defmodule HeyiAm.Profiles do
  @moduledoc """
  Computes AI collaboration profile from aggregated session data.

  All functions are pure computations — they accept lists of Share structs
  (or maps with the same keys) and return computed results. No database queries.

  Expected share fields: :turns, :duration_minutes, :tools (list of strings),
  :agent_summary (map with "agents" list, or nil).
  """

  @min_sessions 8

  @doc """
  Computes the full AI collaboration profile from a user's shares.

  Returns nil if fewer than #{@min_sessions} sessions are provided.
  """
  @spec compute_profile([map()]) :: map() | nil
  def compute_profile(shares) when length(shares) < @min_sessions, do: nil

  def compute_profile(shares) do
    ts = task_scoping(shares)
    ar = active_redirection(shares)
    vr = verification(shares)
    to = tool_orchestration(shares)

    dimensions =
      [
        %{name: "Task Scoping", key: :task_scoping, score: ts, description: task_scoping_description(ts)},
        %{name: "Active Redirection", key: :active_redirection, score: ar, description: redirection_description(ar)},
        %{name: "Verification", key: :verification, score: vr, description: verification_description(vr)},
        %{name: "Tool Orchestration", key: :tool_orchestration, score: to, description: tool_orchestration_description(to)}
      ]
      |> maybe_add_orchestration(shares)

    %{
      sufficient_data: true,
      session_count: length(shares),
      dimensions: dimensions
    }
  end

  @doc """
  Task scoping score (0-100). Fewer turns + shorter duration = tighter scoping.

  Normalize: <5 turns & <30min = 100, >20 turns & >120min = 0, linear between.
  """
  @spec task_scoping([map()]) :: non_neg_integer()
  def task_scoping(shares) do
    avg_turns = avg(shares, fn s -> Map.get(s, :turns) || 0 end)
    avg_duration = avg(shares, fn s -> Map.get(s, :duration_minutes) || 0 end)

    turn_score = normalize(avg_turns, 5.0, 20.0, :inverse)
    duration_score = normalize(avg_duration, 30.0, 120.0, :inverse)

    round((turn_score + duration_score) / 2)
  end

  @doc """
  Active redirection score (0-100). Higher turns-per-minute = more dev steering.

  Normalize: ratio >3 turns/min = 100, ratio <0.5 = 0.
  """
  @spec active_redirection([map()]) :: non_neg_integer()
  def active_redirection(shares) do
    ratios =
      Enum.map(shares, fn share ->
        turns = Map.get(share, :turns) || 0
        duration = max(Map.get(share, :duration_minutes) || 1, 1)
        turns / duration
      end)

    avg_ratio = Enum.sum(ratios) / max(length(ratios), 1)
    round(normalize(avg_ratio, 0.5, 3.0, :direct))
  end

  @doc """
  Verification score (0-100). Percentage of sessions using test/run tools.
  """
  @spec verification([map()]) :: non_neg_integer()
  def verification(shares) do
    test_sessions =
      Enum.count(shares, fn share ->
        tools = Map.get(share, :tools) || []
        Enum.any?(tools, &test_tool_name?/1)
      end)

    round(test_sessions / max(length(shares), 1) * 100)
  end

  @doc """
  Tool orchestration score (0-100). Average distinct tools per session.

  Normalize: >8 distinct tools = 100, 1 tool = 0.
  """
  @spec tool_orchestration([map()]) :: non_neg_integer()
  def tool_orchestration(shares) do
    avg_tools = avg(shares, fn s ->
      (Map.get(s, :tools) || [])
      |> Enum.uniq()
      |> length()
    end)

    round(normalize(avg_tools, 1.0, 8.0, :direct))
  end

  @doc """
  Orchestration score (0-100). Only computed if 5+ sessions have agent_summary
  indicating orchestrated sessions.

  Returns nil if fewer than 5 orchestrated sessions exist.
  """
  @spec orchestration([map()]) :: non_neg_integer() | nil
  def orchestration(shares) do
    orchestrated =
      Enum.filter(shares, fn s ->
        summary = Map.get(s, :agent_summary)
        is_map(summary) and (Map.get(summary, "agents") || Map.get(summary, :agents) || []) != []
      end)

    if length(orchestrated) < 5 do
      nil
    else
      avg_agents =
        avg(orchestrated, fn s ->
          summary = Map.get(s, :agent_summary) || %{}
          agents = Map.get(summary, "agents") || Map.get(summary, :agents) || []
          length(agents)
        end)

      # Normalize: 1 agent = 0, 5+ agents = 100
      round(normalize(avg_agents, 1.0, 5.0, :direct))
    end
  end

  # -- Private helpers --

  defp avg([], _fun), do: 0.0

  defp avg(list, fun) do
    Enum.sum(Enum.map(list, fun)) / length(list)
  end

  defp normalize(value, low, high, direction) do
    clamped = max(min(value, high), low)

    ratio = (clamped - low) / (high - low)

    score =
      case direction do
        :direct -> ratio * 100
        :inverse -> (1.0 - ratio) * 100
      end

    max(min(score, 100.0), 0.0)
  end

  defp test_tool_name?(name) when is_binary(name) do
    downcased = String.downcase(name)
    String.contains?(downcased, "test") or downcased == "bash"
  end

  defp test_tool_name?(_), do: false

  defp maybe_add_orchestration(dimensions, shares) do
    case orchestration(shares) do
      nil -> dimensions
      score ->
        dimensions ++
          [
            %{
              name: "Orchestration",
              key: :orchestration,
              score: score,
              description: orchestration_description(score)
            }
          ]
    end
  end

  # -- Description templates --

  defp task_scoping_description(score) when score >= 70,
    do: "Tends to scope sessions tightly with focused, well-defined tasks"

  defp task_scoping_description(score) when score >= 40,
    do: "Balances between focused tasks and broader exploratory sessions"

  defp task_scoping_description(_score),
    do: "Prefers longer, open-ended sessions with broader scope"

  defp redirection_description(score) when score >= 70,
    do: "Frequently steers AI direction with active guidance throughout sessions"

  defp redirection_description(score) when score >= 40,
    do: "Provides moderate steering, balancing guidance with AI autonomy"

  defp redirection_description(_score),
    do: "Tends to let AI work autonomously with less frequent redirection"

  defp verification_description(score) when score >= 70,
    do: "Consistently verifies AI output through testing and validation"

  defp verification_description(score) when score >= 40,
    do: "Verifies AI output in some sessions but not consistently"

  defp verification_description(_score),
    do: "Rarely includes explicit verification steps in sessions"

  defp tool_orchestration_description(score) when score >= 70,
    do: "Uses a wide variety of tools across sessions"

  defp tool_orchestration_description(score) when score >= 40,
    do: "Uses a moderate set of tools with some variety"

  defp tool_orchestration_description(_score),
    do: "Tends to rely on a small set of tools"

  defp orchestration_description(score) when score >= 70,
    do: "Frequently delegates to sub-agents with complex orchestration patterns"

  defp orchestration_description(score) when score >= 40,
    do: "Uses sub-agent delegation in some sessions"

  defp orchestration_description(_score),
    do: "Occasionally uses sub-agent delegation"
end
