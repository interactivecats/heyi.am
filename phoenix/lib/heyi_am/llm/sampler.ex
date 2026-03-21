defmodule HeyiAm.LLM.Sampler do
  @moduledoc """
  Signal-weighted stratified sampling for LLM session analysis.

  Long sessions are divided into beginning/middle/end thirds. Within each
  third, turns are scored by signal strength (developer prompts, errors,
  self-corrections, verbosity, recovery steps). The top-N highest-signal
  turns are selected from each third and re-sorted chronologically before
  being passed to the LLM prompt.

  Sessions with 50 or fewer turns pass through unchanged.
  """

  @pass_through_threshold 50
  @self_correction_pattern ~r/\?|actually|wait|no,|wrong/i

  # {prompt_slots, log_slots} per third: beginning, middle, end
  @third_slots [{4, 10}, {8, 16}, {8, 14}]

  @doc """
  Samples a session map (with string keys as sent from the CLI).

  Returns the map with `"turnTimeline"` and `"rawLog"` replaced by sampled
  versions when the session exceeds the threshold. Adds `"_sampling_meta"`
  key with sampling information.

  Sessions with <= #{@pass_through_threshold} turns are returned unchanged
  (with `_sampling_meta.sampled: false`).
  """
  @spec sample_session(map()) :: map()
  def sample_session(session) when is_map(session) do
    timeline = Map.get(session, "turnTimeline", [])
    raw_log = Map.get(session, "rawLog", [])

    timeline = if is_list(timeline), do: timeline, else: []
    raw_log = if is_list(raw_log), do: raw_log, else: []

    total = length(timeline)

    if total <= @pass_through_threshold do
      Map.put(session, "_sampling_meta", %{
        "sampled" => false,
        "totalTurns" => total,
        "selectedTurns" => total
      })
    else
      sample_and_annotate(session, timeline, raw_log, total)
    end
  end

  defp sample_and_annotate(session, timeline, raw_log, total) do
    scores = score_all_turns(timeline)

    third_size = div(total, 3)

    thirds = [
      {0, third_size},
      {third_size, 2 * third_size},
      {2 * third_size, total}
    ]

    selected_turns =
      thirds
      |> Enum.with_index()
      |> Enum.flat_map(fn {{start_idx, end_idx}, t_idx} ->
        {prompt_slots, _log_slots} = Enum.at(@third_slots, t_idx)

        slice = Enum.slice(timeline, start_idx, end_idx - start_idx)
        slice_scores = Enum.slice(scores, start_idx, end_idx - start_idx)

        slice
        |> Enum.with_index()
        |> Enum.zip(slice_scores)
        |> Enum.map(fn {{turn, local_idx}, score} ->
          {turn, start_idx + local_idx, score}
        end)
        |> select_top_n(prompt_slots)
      end)
      |> Enum.sort_by(fn {_turn, orig_idx, _score} -> orig_idx end)
      |> Enum.map(fn {turn, orig_idx, _score} ->
        annotate_turn(turn, orig_idx + 1, total)
      end)

    # Sample raw log using the same thirds approach
    log_total = length(raw_log)
    sampled_log = sample_log(raw_log, log_total, total)

    selected_count = length(selected_turns)

    session
    |> Map.put("turnTimeline", selected_turns)
    |> Map.put("rawLog", sampled_log)
    |> Map.put("_sampling_meta", %{
      "sampled" => true,
      "totalTurns" => total,
      "selectedTurns" => selected_count
    })
  end

  defp sample_log(raw_log, log_total, turn_total) do
    if log_total == 0 do
      []
    else
      log_third_size = div(log_total, 3)

      log_thirds = [
        {0, log_third_size},
        {log_third_size, 2 * log_third_size},
        {2 * log_third_size, log_total}
      ]

      log_thirds
      |> Enum.with_index()
      |> Enum.flat_map(fn {{start_idx, end_idx}, t_idx} ->
        {_prompt_slots, log_slots} = Enum.at(@third_slots, t_idx)

        slice = Enum.slice(raw_log, start_idx, end_idx - start_idx)

        # Score log lines by length as rough signal proxy
        slice
        |> Enum.with_index()
        |> Enum.map(fn {line, local_idx} ->
          {line, start_idx + local_idx, String.length(to_string(line))}
        end)
        |> select_top_n(log_slots)
      end)
      |> Enum.sort_by(fn {_line, orig_idx, _score} -> orig_idx end)
      |> Enum.map(fn {line, orig_idx, _score} ->
        "[T#{orig_idx + 1}/#{turn_total}] #{line}"
      end)
    end
  end

  # Score all turns, returning a list of integer scores in the same order.
  defp score_all_turns(timeline) do
    timeline
    |> Enum.with_index()
    |> Enum.map(fn {turn, idx} ->
      score_turn(turn, timeline, idx)
    end)
  end

  @doc """
  Scores a single turn. Returns 0-5 based on signal strength:
  - +1 if type == "prompt"
  - +1 if type == "error"
  - +1 if content matches self-correction pattern
  - +1 if content length > 200 chars
  - +1 if previous turn was an error
  """
  @spec score_turn(map(), list(), non_neg_integer()) :: 0..5
  def score_turn(turn, all_turns, idx) when is_map(turn) and is_list(all_turns) do
    content = to_string(Map.get(turn, "content", ""))
    type = Map.get(turn, "type", "")

    score = 0
    score = if type == "prompt", do: score + 1, else: score
    score = if type == "error", do: score + 1, else: score
    score = if Regex.match?(@self_correction_pattern, content), do: score + 1, else: score
    score = if String.length(content) > 200, do: score + 1, else: score

    score =
      if idx > 0 do
        prev = Enum.at(all_turns, idx - 1)
        if is_map(prev) and Map.get(prev, "type") == "error", do: score + 1, else: score
      else
        score
      end

    score
  end

  # Select top N items from a list of {item, orig_idx, score} triples.
  # Tiebreak: lower original index wins (earlier in session).
  defp select_top_n(scored_items, n) do
    scored_items
    |> Enum.sort_by(fn {_item, orig_idx, score} -> {-score, orig_idx} end)
    |> Enum.take(n)
  end

  defp annotate_turn(turn, position, total) when is_map(turn) do
    content = Map.get(turn, "content", "")
    Map.put(turn, "content", "[T#{position}/#{total}] #{content}")
  end
end
