defmodule HeyiAm.LLM.Parser do
  @moduledoc """
  Parses and validates LLM JSON responses into enhancement results.
  Ported from cli/src/summarize.ts parseEnhancementResult — must stay in sync.
  """

  @banned_words ~w(leverage utilize streamline enhance robust seamless)
  @banned_pattern ~r/\b(#{Enum.join(@banned_words, "|")})\b/i

  @doc """
  Parses raw LLM text into a validated enhancement result map.
  Returns {:ok, result} or {:error, reason}.
  """
  def parse_result(raw) when is_binary(raw) do
    with {:ok, json_str} <- extract_json(raw),
         {:ok, parsed} <- decode_json(json_str) do
      {:ok, validate_and_clean(parsed)}
    end
  end

  defp extract_json(raw) do
    case Regex.run(~r/```(?:json)?\s*([\s\S]*?)```/, raw) do
      [_, json_str] -> {:ok, String.trim(json_str)}
      nil -> {:ok, String.trim(raw)}
    end
  end

  defp decode_json(str) do
    case Jason.decode(str) do
      {:ok, parsed} when is_map(parsed) -> {:ok, parsed}
      {:ok, _} -> {:error, :not_a_json_object}
      {:error, _} -> {:error, {:invalid_json, String.slice(str, 0, 200)}}
    end
  end

  defp validate_and_clean(parsed) do
    %{
      "title" => parsed |> get_string("title") |> enforce_max_length(80) |> strip_banned(),
      "context" => parsed |> get_string("context") |> enforce_max_length(200) |> strip_banned(),
      "developerTake" => parsed |> get_string("developerTake") |> enforce_max_length(300) |> strip_banned(),
      "skills" => parse_skills(parsed["skills"]),
      "questions" => parse_questions(parsed["questions"]),
      "executionSteps" => parse_steps(parsed["executionSteps"])
    }
  end

  defp get_string(map, key) do
    case map[key] do
      v when is_binary(v) -> v
      _ -> ""
    end
  end

  defp parse_skills(skills) when is_list(skills) do
    Enum.filter(skills, &is_binary/1)
  end

  defp parse_skills(_), do: []

  defp parse_questions(questions) when is_list(questions) do
    questions
    |> Enum.filter(fn q -> is_map(q) and is_binary(q["text"]) and is_binary(q["suggestedAnswer"]) end)
    |> Enum.take(3)
    |> Enum.map(fn q ->
      %{
        "text" => strip_banned(q["text"]),
        "suggestedAnswer" => strip_banned(q["suggestedAnswer"])
      }
    end)
  end

  defp parse_questions(_), do: []

  defp parse_steps(steps) when is_list(steps) do
    steps
    |> Enum.take(7)
    |> Enum.with_index(1)
    |> Enum.map(fn {step, idx} ->
      %{
        "stepNumber" => if(is_integer(step["stepNumber"]), do: step["stepNumber"], else: idx),
        "title" => step |> get_string("title") |> strip_banned() |> enforce_word_limit(20),
        "body" => step |> get_string("body") |> strip_banned() |> enforce_word_limit(40)
      }
    end)
  end

  defp parse_steps(_), do: []

  defp enforce_max_length(str, max) when is_binary(str) do
    if String.length(str) > max do
      String.slice(str, 0, max - 1) <> "…"
    else
      str
    end
  end

  defp enforce_word_limit(str, max_words) do
    words = String.split(str, ~r/\s+/, trim: true)

    if length(words) <= max_words do
      str
    else
      words |> Enum.take(max_words) |> Enum.join(" ") |> Kernel.<>("…")
    end
  end

  @doc """
  Strips banned words from text.
  """
  def strip_banned(text) do
    text
    |> String.replace(@banned_pattern, "")
    |> String.replace(~r/\s{2,}/, " ")
    |> String.trim()
  end

  @doc """
  Returns list of banned words found in text.
  """
  def find_banned_words(text) do
    case Regex.scan(@banned_pattern, text) do
      [] -> []
      matches -> matches |> Enum.map(fn [word | _] -> String.downcase(word) end) |> Enum.uniq()
    end
  end
end
