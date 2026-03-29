defmodule HeyiAm.Vibes.Meta do
  @moduledoc """
  Shared archetype and modifier metadata. Single source of truth
  for display names, taglines, and modifier phrases used by both
  the web controllers and API controllers.
  """

  @archetype_meta %{
    "night-owl" => %{name: "The Night Owl", tagline: "Codes when the world sleeps."},
    "backseat-driver" => %{name: "The Backseat Driver", tagline: "Knows when the AI is wrong."},
    "delegator" => %{name: "The Delegator", tagline: "Points and lets the AI run."},
    "cowboy" => %{name: "The Cowboy", tagline: "Writes first, reads later."},
    "overthinker" => %{name: "The Overthinker", tagline: "Every prompt is a paragraph."},
    "speed-runner" => %{name: "The Speed Runner", tagline: "In and out. No wasted time."},
    "debugger" => %{name: "The Debugger", tagline: "Tests, fails, fixes, repeats."},
    "diplomat" => %{name: "The Diplomat", tagline: "Thanks the AI, trusts the AI."},
    "architect" => %{name: "The Architect", tagline: "Reads 5x more than writes."},
    "pair-programmer" => %{name: "The Pair Programmer", tagline: "Treats the AI like a colleague."},
    "marathon-runner" => %{name: "The Marathon Runner", tagline: "Sessions that never end."},
    "scientist" => %{name: "The Scientist", tagline: "Hypothesize, test, repeat."},
    "puppeteer" => %{name: "The Puppeteer", tagline: "Pulls every string."},
    "weekend-warrior" => %{name: "The Weekend Warrior", tagline: "Saves the real coding for Saturday."},
    "orchestrator" => %{name: "The Orchestrator", tagline: "Spawns agents like they're threads."},
    "minimalist" => %{name: "The Minimalist", tagline: "Says less. Gets more."},
    "secret-spiller" => %{name: "The Secret Spiller", tagline: "Accidentally shares everything."},
    "vibe-coder" => %{name: "The Vibe Coder", tagline: "Vibes with the machine."}
  }

  @modifier_phrases %{
    "says-please" => "who says please",
    "codes-at-3am" => "who codes at 3am",
    "reads-5x-more" => "who reads 5x more than writes",
    "never-tests" => "who never tests",
    "cusses-under-pressure" => "who cusses under pressure",
    "writes-essays" => "who writes essays for prompts",
    "lets-ai-cook" => "who lets the AI cook",
    "asks-more-than-tells" => "who asks more than tells",
    "scope-creeps" => "who scope-creeps every session",
    "ships-on-weekends" => "who ships on weekends",
    "spawns-agents" => "who spawns agents for everything",
    "plans-first" => "who plans before coding",
    "interrupts-often" => "who interrupts mid-thought",
    "marathon-sessions" => "who codes for hours straight",
    "one-word-prompts" => "who speaks in commands",
    "leaks-secrets" => "who leaks secrets to the AI"
  }

  def archetype_meta, do: @archetype_meta

  def archetype_names do
    Map.new(@archetype_meta, fn {id, %{name: name}} -> {id, name} end)
  end

  def modifier_phrases, do: @modifier_phrases
end
