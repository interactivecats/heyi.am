defmodule HeyiAm.VibesFixtures do
  alias HeyiAm.Vibes

  def valid_vibe_attributes(overrides \\ %{}) do
    Map.merge(
      %{
        "archetype_id" => "night-owl",
        "modifier_id" => "cusses-under-pressure",
        "narrative" => "You coded past midnight more often than not.",
        "stats" => %{
          "expletives" => 14,
          "corrections" => 23,
          "please_rate" => 0.42,
          "avg_prompt_words" => 47,
          "late_night_rate" => 0.62,
          "question_rate" => 0.31,
          "read_write_ratio" => 4.2,
          "apologies" => 7,
          "test_runs" => 12,
          "failed_tests" => 4,
          "longest_tool_chain" => 8,
          "override_success_rate" => 0.75,
          "longest_autopilot" => 23,
          "first_blood_min" => 4,
          "scope_creep" => 2
        },
        "sources" => ["claude", "cursor"],
        "session_count" => 23,
        "total_turns" => 847
      },
      overrides
    )
  end

  def vibe_fixture(overrides \\ %{}) do
    {:ok, vibe} =
      overrides
      |> valid_vibe_attributes()
      |> Vibes.create_vibe()

    vibe
  end
end
