defmodule HeyiAm.ProfilesTest do
  use ExUnit.Case, async: true

  alias HeyiAm.Profiles

  defp make_share(attrs) do
    Map.merge(
      %{
        token: "tok_#{:rand.uniform(100_000)}",
        turns: 10,
        duration_minutes: 30,
        beats: [%{}, %{}, %{}],
        tool_breakdown: [
          %{name: "Read", count: 5},
          %{name: "Edit", count: 3},
          %{name: "Bash", count: 2}
        ],
        child_sessions: []
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

    test "does not include orchestration dimension when < 5 orchestrated sessions" do
      result = Profiles.compute_profile(make_shares(8))
      keys = Enum.map(result.dimensions, & &1.key)
      refute :orchestration in keys
    end

    test "includes orchestration dimension when 5+ orchestrated sessions" do
      shares = make_shares(8, %{child_sessions: [%{}, %{}, %{}]})
      result = Profiles.compute_profile(shares)
      keys = Enum.map(result.dimensions, & &1.key)
      assert :orchestration in keys
    end
  end

  describe "task_scoping/1" do
    test "returns 100 for very short sessions with few steps" do
      shares = make_shares(3, %{beats: [%{}], duration_minutes: 5})
      assert Profiles.task_scoping(shares) == 100
    end

    test "returns 0 for very long sessions with many steps" do
      shares = make_shares(3, %{
        beats: Enum.map(1..20, fn _ -> %{} end),
        duration_minutes: 150
      })
      assert Profiles.task_scoping(shares) == 0
    end

    test "returns mid-range for moderate sessions" do
      shares = make_shares(3, %{
        beats: Enum.map(1..10, fn _ -> %{} end),
        duration_minutes: 75
      })
      score = Profiles.task_scoping(shares)
      assert score > 0 and score < 100
    end
  end

  describe "active_redirection/1" do
    test "returns 100 for high turn/step ratio" do
      shares = make_shares(3, %{turns: 30, beats: [%{}]})
      assert Profiles.active_redirection(shares) == 100
    end

    test "returns 0 for low turn/step ratio" do
      shares = make_shares(3, %{turns: 1, beats: Enum.map(1..10, fn _ -> %{} end)})
      assert Profiles.active_redirection(shares) == 0
    end

    test "returns mid-range for moderate ratio" do
      shares = make_shares(3, %{turns: 6, beats: [%{}, %{}, %{}]})
      score = Profiles.active_redirection(shares)
      assert score > 0 and score < 100
    end
  end

  describe "verification/1" do
    test "returns 100 when all sessions have test tools" do
      shares = make_shares(3, %{
        tool_breakdown: [%{name: "Bash", count: 5}, %{name: "test_runner", count: 2}]
      })
      assert Profiles.verification(shares) == 100
    end

    test "returns 0 when no sessions have test tools" do
      shares = make_shares(3, %{
        tool_breakdown: [%{name: "Read", count: 5}, %{name: "Edit", count: 3}]
      })
      assert Profiles.verification(shares) == 0
    end

    test "returns proportional score for mixed sessions" do
      shares = [
        make_share(%{tool_breakdown: [%{name: "Bash", count: 1}]}),
        make_share(%{tool_breakdown: [%{name: "Read", count: 1}]}),
        make_share(%{tool_breakdown: [%{name: "Read", count: 1}]}),
        make_share(%{tool_breakdown: [%{name: "Bash", count: 1}]})
      ]
      assert Profiles.verification(shares) == 50
    end
  end

  describe "tool_orchestration/1" do
    test "returns 100 for sessions with many distinct tools" do
      tools = Enum.map(1..10, fn i -> %{name: "Tool#{i}", count: 1} end)
      shares = make_shares(3, %{tool_breakdown: tools})
      assert Profiles.tool_orchestration(shares) == 100
    end

    test "returns 0 for sessions with 1 tool" do
      shares = make_shares(3, %{tool_breakdown: [%{name: "Read", count: 10}]})
      assert Profiles.tool_orchestration(shares) == 0
    end

    test "returns mid-range for moderate tool diversity" do
      tools = Enum.map(1..5, fn i -> %{name: "Tool#{i}", count: 1} end)
      shares = make_shares(3, %{tool_breakdown: tools})
      score = Profiles.tool_orchestration(shares)
      assert score > 0 and score < 100
    end
  end

  describe "orchestration/1" do
    test "returns nil when fewer than 5 orchestrated sessions" do
      shares = [
        make_share(%{child_sessions: [%{}]}),
        make_share(%{child_sessions: [%{}]}),
        make_share(%{child_sessions: []})
      ]
      assert Profiles.orchestration(shares) == nil
    end

    test "returns score when 5+ orchestrated sessions" do
      shares = make_shares(5, %{child_sessions: [%{}, %{}, %{}]})
      score = Profiles.orchestration(shares)
      assert is_integer(score)
      assert score >= 0 and score <= 100
    end

    test "returns 100 for many child sessions" do
      shares = make_shares(5, %{child_sessions: Enum.map(1..10, fn _ -> %{} end)})
      assert Profiles.orchestration(shares) == 100
    end

    test "returns 0 for exactly 1 child per session" do
      shares = make_shares(5, %{child_sessions: [%{}]})
      assert Profiles.orchestration(shares) == 0
    end
  end
end
