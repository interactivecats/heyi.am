defmodule HeyiAm.ProjectsTest do
  use ExUnit.Case, async: true

  alias HeyiAm.Projects

  defp make_share(attrs) do
    Map.merge(
      %{
        token: "tok_#{:rand.uniform(100_000)}",
        loc_changed: 50,
        recorded_at: ~U[2026-01-15 10:00:00Z],
        top_files: ["lib/app.ex", "lib/router.ex"],
        duration_minutes: 30,
        turns: 10,
        files_changed: 2
      },
      attrs
    )
  end

  describe "compute_cumulative_loc/1" do
    test "returns empty list for no shares" do
      assert Projects.compute_cumulative_loc([]) == []
    end

    test "returns single entry for one share" do
      share = make_share(%{loc_changed: 100, recorded_at: ~U[2026-01-15 10:00:00Z], title: "Auth rewrite"})
      assert [%{date: ~D[2026-01-15], loc: 100, loc_delta: 100, title: "Auth rewrite"}] =
               Projects.compute_cumulative_loc([share])
    end

    test "accumulates LOC sorted by date" do
      shares = [
        make_share(%{loc_changed: 30, recorded_at: ~U[2026-01-17 10:00:00Z], title: "C"}),
        make_share(%{loc_changed: 20, recorded_at: ~U[2026-01-15 10:00:00Z], title: "A"}),
        make_share(%{loc_changed: 50, recorded_at: ~U[2026-01-16 10:00:00Z], title: "B"})
      ]

      result = Projects.compute_cumulative_loc(shares)

      assert [
               %{date: ~D[2026-01-15], loc: 20, loc_delta: 20, title: "A"},
               %{date: ~D[2026-01-16], loc: 70, loc_delta: 50, title: "B"},
               %{date: ~D[2026-01-17], loc: 100, loc_delta: 30, title: "C"}
             ] = result
    end

    test "handles nil loc_changed as 0" do
      share = make_share(%{loc_changed: nil, recorded_at: ~U[2026-01-15 10:00:00Z]})
      assert [%{loc: 0, loc_delta: 0}] = Projects.compute_cumulative_loc([share])
    end
  end

  describe "compute_file_heatmap/1" do
    test "returns empty map for no shares" do
      assert Projects.compute_file_heatmap([]) == %{}
    end

    test "groups files by directory with trailing slash" do
      share = make_share(%{token: "tok_a", top_files: ["lib/app.ex", "lib/router.ex", "test/app_test.exs"]})
      result = Projects.compute_file_heatmap([share])

      assert result == %{
               "lib/" => %{"tok_a" => 2},
               "test/" => %{"tok_a" => 1}
             }
    end

    test "groups by two levels for deeper paths" do
      share = make_share(%{token: "tok_a", top_files: [
        "lib/heyi_am/accounts.ex",
        "lib/heyi_am/shares.ex",
        "lib/heyi_am_web/router.ex"
      ]})
      result = Projects.compute_file_heatmap([share])

      assert result == %{
               "lib/heyi_am/" => %{"tok_a" => 2},
               "lib/heyi_am_web/" => %{"tok_a" => 1}
             }
    end

    test "handles map entries with path key" do
      share = make_share(%{token: "tok_a", top_files: [
        %{"path" => "lib/app.ex", "additions" => 10, "deletions" => 2},
        %{"path" => "test/app_test.exs", "additions" => 5, "deletions" => 0}
      ]})
      result = Projects.compute_file_heatmap([share])

      assert result == %{
               "lib/" => %{"tok_a" => 1},
               "test/" => %{"tok_a" => 1}
             }
    end

    test "aggregates across multiple sessions" do
      shares = [
        make_share(%{token: "tok_a", top_files: ["lib/app.ex", "lib/router.ex"]}),
        make_share(%{token: "tok_b", top_files: ["lib/app.ex", "test/foo_test.exs"]})
      ]

      result = Projects.compute_file_heatmap(shares)

      assert result["lib/"]["tok_a"] == 2
      assert result["lib/"]["tok_b"] == 1
      assert result["test/"]["tok_b"] == 1
    end

    test "handles shares with no top_files" do
      share = make_share(%{token: "tok_a", top_files: nil})
      assert Projects.compute_file_heatmap([share]) == %{}
    end
  end

  describe "compute_session_overlap/1" do
    test "returns empty for fewer than 2 shares" do
      assert Projects.compute_session_overlap([]) == []
      assert Projects.compute_session_overlap([make_share(%{})]) == []
    end

    test "detects overlapping files between sessions" do
      shares = [
        make_share(%{token: "aaa", top_files: ["lib/app.ex", "lib/router.ex"]}),
        make_share(%{token: "bbb", top_files: ["lib/app.ex", "test/foo_test.exs"]})
      ]

      result = Projects.compute_session_overlap(shares)

      assert [{t1, t2, shared}] = result
      assert t1 < t2
      assert "lib/app.ex" in shared
      assert length(shared) == 1
    end

    test "returns empty when no files overlap" do
      shares = [
        make_share(%{token: "aaa", top_files: ["lib/app.ex"]}),
        make_share(%{token: "bbb", top_files: ["test/foo_test.exs"]})
      ]

      assert Projects.compute_session_overlap(shares) == []
    end

    test "handles multiple overlapping pairs" do
      shares = [
        make_share(%{token: "aaa", top_files: ["lib/app.ex"]}),
        make_share(%{token: "bbb", top_files: ["lib/app.ex"]}),
        make_share(%{token: "ccc", top_files: ["lib/app.ex"]})
      ]

      result = Projects.compute_session_overlap(shares)
      assert length(result) == 3
    end
  end

  describe "compute_top_files/1" do
    test "returns empty list for no shares" do
      assert Projects.compute_top_files([]) == []
    end

    test "aggregates file stats across sessions" do
      shares = [
        make_share(%{token: "tok_a", top_files: [
          %{"path" => "lib/app.ex", "additions" => 50, "deletions" => 10},
          %{"path" => "lib/router.ex", "additions" => 20, "deletions" => 0}
        ]}),
        make_share(%{token: "tok_b", top_files: [
          %{"path" => "lib/app.ex", "additions" => 30, "deletions" => 5}
        ]})
      ]

      result = Projects.compute_top_files(shares)

      app = Enum.find(result, &(&1.path == "lib/app.ex"))
      assert app.edits == 2
      assert app.loc == 95
      assert app.sessions == 2

      router = Enum.find(result, &(&1.path == "lib/router.ex"))
      assert router.edits == 1
      assert router.loc == 20
      assert router.sessions == 1
    end

    test "sorts by edit count descending" do
      shares = [
        make_share(%{token: "tok_a", top_files: [
          %{"path" => "a.ex", "additions" => 10, "deletions" => 0},
          %{"path" => "a.ex", "additions" => 10, "deletions" => 0},
          %{"path" => "b.ex", "additions" => 100, "deletions" => 0}
        ]})
      ]

      result = Projects.compute_top_files(shares)
      assert [%{path: "a.ex", edits: 2}, %{path: "b.ex", edits: 1}] = result
    end

    test "handles plain string entries with zero loc" do
      shares = [make_share(%{token: "tok_a", top_files: ["lib/app.ex", "lib/router.ex"]})]
      result = Projects.compute_top_files(shares)

      assert length(result) == 2
      assert Enum.all?(result, &(&1.loc == 0))
    end
  end

  describe "compute_project_stats/1" do
    test "returns zero stats for no shares" do
      result = Projects.compute_project_stats([])

      assert result == %{
               total_sessions: 0,
               total_loc: 0,
               total_duration: 0,
               total_turns: 0,
               unique_files: 0,
               date_range: nil
             }
    end

    test "computes aggregates for multiple shares" do
      shares = [
        make_share(%{
          loc_changed: 100,
          duration_minutes: 30,
          turns: 10,
          top_files: ["lib/app.ex", "lib/router.ex"],
          recorded_at: ~U[2026-01-15 10:00:00Z]
        }),
        make_share(%{
          loc_changed: 200,
          duration_minutes: 45,
          turns: 20,
          top_files: ["lib/app.ex", "test/foo_test.exs"],
          recorded_at: ~U[2026-01-20 10:00:00Z]
        })
      ]

      result = Projects.compute_project_stats(shares)

      assert result.total_sessions == 2
      assert result.total_loc == 300
      assert result.total_duration == 75
      assert result.total_turns == 30
      assert result.unique_files == 3
      assert result.date_range == {~D[2026-01-15], ~D[2026-01-20]}
    end

    test "computes stats for a single share" do
      share = make_share(%{
        loc_changed: 50,
        duration_minutes: 15,
        turns: 5,
        top_files: ["lib/app.ex"],
        recorded_at: ~U[2026-02-01 12:00:00Z]
      })

      result = Projects.compute_project_stats([share])

      assert result.total_sessions == 1
      assert result.total_loc == 50
      assert result.unique_files == 1
      assert result.date_range == {~D[2026-02-01], ~D[2026-02-01]}
    end
  end
end
