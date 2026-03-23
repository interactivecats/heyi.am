defmodule HeyiAm.ProfilesTest do
  use ExUnit.Case, async: true

  alias HeyiAm.Profiles

  defp make_share(attrs) do
    Map.merge(
      %{
        token: "tok_#{:rand.uniform(100_000)}",
        turns: 10,
        duration_minutes: 30,
        tools: ["Read", "Edit", "Bash"],
        skills: ["elixir"],
        files_changed: 5,
        loc_changed: 100,
        agent_summary: nil
      },
      attrs
    )
  end

  defp make_shares(count, attrs \\ %{}) do
    Enum.map(1..count, fn _ -> make_share(attrs) end)
  end

  describe "compute_profile/1" do
    test "returns nil with fewer than 8 sessions" do
      assert Profiles.compute_profile(make_shares(7)) == nil
    end

    test "returns profile with exactly 8 sessions" do
      result = Profiles.compute_profile(make_shares(8))

      assert result.sufficient_data == true
      assert result.session_count == 8
      assert length(result.dimensions) >= 4
      assert Enum.all?(result.dimensions, &Map.has_key?(&1, :score))
      assert Enum.all?(result.dimensions, &Map.has_key?(&1, :description))
      assert Enum.all?(result.dimensions, &Map.has_key?(&1, :key))
    end

    test "scores are not all 0 with realistic data" do
      result = Profiles.compute_profile(make_shares(8))
      scores = Enum.map(result.dimensions, & &1.score)
      assert Enum.any?(scores, &(&1 > 0))
    end

    test "scores are not all 100 with realistic data" do
      result = Profiles.compute_profile(make_shares(8))
      scores = Enum.map(result.dimensions, & &1.score)
      assert Enum.any?(scores, &(&1 < 100))
    end

    test "does not include orchestration dimension when no agent_summary" do
      result = Profiles.compute_profile(make_shares(8))
      keys = Enum.map(result.dimensions, & &1.key)
      refute :orchestration in keys
    end

    test "includes orchestration dimension when 5+ orchestrated sessions" do
      shares = make_shares(8, %{agent_summary: %{"agents" => ["agent1", "agent2"]}})
      result = Profiles.compute_profile(shares)
      keys = Enum.map(result.dimensions, & &1.key)
      assert :orchestration in keys
    end

    test "handles nil fields without crashing" do
      shares = make_shares(8, %{turns: nil, duration_minutes: nil, tools: nil, agent_summary: nil})
      result = Profiles.compute_profile(shares)
      assert result.sufficient_data == true
    end
  end

  describe "task_scoping/1" do
    test "returns 100 for very short sessions with few turns" do
      shares = make_shares(3, %{turns: 2, duration_minutes: 5})
      assert Profiles.task_scoping(shares) == 100
    end

    test "returns 0 for very long sessions with many turns" do
      shares = make_shares(3, %{turns: 25, duration_minutes: 150})
      assert Profiles.task_scoping(shares) == 0
    end

    test "returns mid-range for moderate sessions" do
      shares = make_shares(3, %{turns: 12, duration_minutes: 75})
      score = Profiles.task_scoping(shares)
      assert score > 0 and score < 100
    end
  end

  describe "active_redirection/1" do
    test "returns 100 for high turns-per-minute" do
      shares = make_shares(3, %{turns: 30, duration_minutes: 5})
      assert Profiles.active_redirection(shares) == 100
    end

    test "returns 0 for low turns-per-minute" do
      shares = make_shares(3, %{turns: 1, duration_minutes: 60})
      assert Profiles.active_redirection(shares) == 0
    end

    test "returns mid-range for moderate ratio" do
      shares = make_shares(3, %{turns: 10, duration_minutes: 6})
      score = Profiles.active_redirection(shares)
      assert score > 0 and score < 100
    end
  end

  describe "verification/1" do
    test "returns 100 when all sessions have test tools" do
      shares = make_shares(3, %{tools: ["Bash", "Read"]})
      assert Profiles.verification(shares) == 100
    end

    test "returns 0 when no sessions have test tools" do
      shares = make_shares(3, %{tools: ["Read", "Edit"]})
      assert Profiles.verification(shares) == 0
    end

    test "returns proportional score for mixed sessions" do
      shares = [
        make_share(%{tools: ["Bash", "Read"]}),
        make_share(%{tools: ["Read", "Edit"]}),
        make_share(%{tools: ["Read", "Edit"]}),
        make_share(%{tools: ["Bash", "Edit"]})
      ]
      assert Profiles.verification(shares) == 50
    end
  end

  describe "tool_orchestration/1" do
    test "returns 100 for sessions with many distinct tools" do
      tools = Enum.map(1..10, fn i -> "Tool#{i}" end)
      shares = make_shares(3, %{tools: tools})
      assert Profiles.tool_orchestration(shares) == 100
    end

    test "returns 0 for sessions with 1 tool" do
      shares = make_shares(3, %{tools: ["Read"]})
      assert Profiles.tool_orchestration(shares) == 0
    end

    test "returns mid-range for moderate tool diversity" do
      tools = Enum.map(1..5, fn i -> "Tool#{i}" end)
      shares = make_shares(3, %{tools: tools})
      score = Profiles.tool_orchestration(shares)
      assert score > 0 and score < 100
    end
  end

  describe "orchestration/1" do
    test "returns nil when no sessions have agent_summary" do
      shares = make_shares(3, %{agent_summary: nil})
      assert Profiles.orchestration(shares) == nil
    end

    test "returns nil when fewer than 5 orchestrated sessions" do
      shares = [
        make_share(%{agent_summary: %{"agents" => ["a1"]}}),
        make_share(%{agent_summary: %{"agents" => ["a1"]}}),
        make_share(%{agent_summary: nil})
      ]
      assert Profiles.orchestration(shares) == nil
    end

    test "returns score when 5+ orchestrated sessions" do
      shares = make_shares(5, %{agent_summary: %{"agents" => ["a1", "a2", "a3"]}})
      score = Profiles.orchestration(shares)
      assert is_integer(score)
      assert score >= 0 and score <= 100
    end

    test "returns 100 for many agents" do
      agents = Enum.map(1..10, fn i -> "agent#{i}" end)
      shares = make_shares(5, %{agent_summary: %{"agents" => agents}})
      assert Profiles.orchestration(shares) == 100
    end

    test "returns 0 for exactly 1 agent per session" do
      shares = make_shares(5, %{agent_summary: %{"agents" => ["a1"]}})
      assert Profiles.orchestration(shares) == 0
    end

    test "handles atom keys in agent_summary" do
      shares = make_shares(5, %{agent_summary: %{agents: ["a1", "a2", "a3"]}})
      score = Profiles.orchestration(shares)
      assert is_integer(score)
      assert score >= 0 and score <= 100
    end
  end
end
