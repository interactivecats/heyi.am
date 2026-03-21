defmodule HeyiAm.LLM.Prompt do
  @moduledoc """
  Builds system and user prompts for session enhancement.
  Ported from cli/src/summarize.ts — must stay in sync.
  """

  @banned_words ~w(leverage utilize streamline enhance robust seamless)

  def system_prompt do
    """
    You are a technical writing assistant for heyi.am, a platform where developers document AI coding sessions as case studies.

    Your job: turn raw session data into a sharp, honest summary that sounds like a dev explaining what happened to another dev in a standup. Not a blog post. Not a tutorial.

    HARD RULES:
    - NEVER use these words: #{Enum.join(@banned_words, ", ")}. If you catch yourself writing one, rewrite the sentence.
    - Title: max 80 characters. Be specific about what was done. No clickbait.
    - Context: max 200 characters. What was the state before this session? What was broken or missing?
    - Developer take: max 300 characters. What was hard, surprising, or worth remembering? Write in first person.
    - Steps: 5-7 steps. Each title max 20 words. Each body max 40 words. Be concrete — mention file names, tools, and specific decisions.
    - Skills: extract from the actual tools, files, and patterns used. No padding. If they only touched 3 technologies, list 3.
    - Questions: generate exactly 3 targeted questions based on the developer's actual corrections, decisions, and redirections during the session. These should be specific enough that a generic answer would be obviously wrong.

    TONE: Slightly rough. Concrete. Compress. A dev thinking out loud, not an AI explaining.

    Respond in JSON matching this exact schema:
    {
      "title": "string (max 80 chars)",
      "context": "string (max 200 chars)",
      "developerTake": "string (max 300 chars)",
      "skills": ["string"],
      "questions": [{"text": "string", "suggestedAnswer": "string"}],
      "executionSteps": [{"stepNumber": number, "title": "string (max 20 words)", "body": "string (max 40 words)"}]
    }\
    """
  end

  def user_prompt(session) when is_map(session) do
    parts = [
      "Session: #{session["title"] || "Untitled"}",
      "Project: #{session["projectName"] || "unknown"}",
      "Duration: #{session["durationMinutes"] || 0} min, #{session["turns"] || 0} turns, #{session["linesOfCode"] || 0} LOC changed"
    ]

    parts = maybe_add_skills(parts, session["skills"])
    parts = maybe_add_tools(parts, session["toolBreakdown"])
    parts = maybe_add_files(parts, session["filesChanged"])
    parts = maybe_add_execution_path(parts, session["executionPath"])
    parts = maybe_add_prompts(parts, session["turnTimeline"])
    parts = maybe_add_raw_log(parts, session["rawLog"])

    Enum.join(parts, "\n")
  end

  defp maybe_add_skills(parts, skills) when is_list(skills) and skills != [] do
    parts ++ ["Detected skills: #{Enum.join(skills, ", ")}"]
  end

  defp maybe_add_skills(parts, _), do: parts

  defp maybe_add_tools(parts, tools) when is_list(tools) and tools != [] do
    formatted = Enum.map_join(tools, ", ", fn t -> "#{t["tool"]}(#{t["count"]})" end)
    parts ++ ["Tool usage: #{formatted}"]
  end

  defp maybe_add_tools(parts, _), do: parts

  defp maybe_add_files(parts, files) when is_list(files) and files != [] do
    top_files =
      files
      |> Enum.sort_by(fn f -> -((f["additions"] || 0) + (f["deletions"] || 0)) end)
      |> Enum.take(10)
      |> Enum.map_join(", ", fn f -> "#{f["path"]} (+#{f["additions"] || 0}/-#{f["deletions"] || 0})" end)

    parts ++ ["Key files: #{top_files}"]
  end

  defp maybe_add_files(parts, _), do: parts

  defp maybe_add_execution_path(parts, steps) when is_list(steps) and steps != [] do
    header = ["Execution path:"]

    lines =
      Enum.map(steps, fn s ->
        type = s["type"] || "implementation"
        "  #{s["stepNumber"]}. [#{type}] #{s["title"]}: #{s["description"]}"
      end)

    parts ++ header ++ lines
  end

  defp maybe_add_execution_path(parts, _), do: parts

  defp maybe_add_prompts(parts, timeline) when is_list(timeline) and timeline != [] do
    dev_prompts =
      timeline
      |> Enum.filter(fn t -> t["type"] == "prompt" end)
      |> Enum.take(15)

    if dev_prompts == [] do
      parts
    else
      header = ["Developer prompts (decisions & corrections):"]
      lines = Enum.map(dev_prompts, fn p -> "  [#{p["timestamp"]}] #{p["content"]}" end)
      parts ++ header ++ lines
    end
  end

  defp maybe_add_prompts(parts, _), do: parts

  defp maybe_add_raw_log(parts, log) when is_list(log) and log != [] do
    excerpt = log |> Enum.take(30) |> Enum.join("\n")
    parts ++ ["Raw log excerpt:\n#{excerpt}"]
  end

  defp maybe_add_raw_log(parts, _), do: parts
end
