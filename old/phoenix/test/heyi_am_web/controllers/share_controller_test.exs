defmodule HeyiAmWeb.ShareControllerTest do
  use HeyiAmWeb.ConnCase, async: true

  alias HeyiAmWeb.ShareController
  alias HeyiAm.Shares

  # Build a minimal share struct with defaults matching the schema
  defp build_share(attrs) do
    defaults = %{
      token: "tok-#{System.unique_integer([:positive])}",
      delete_token: "del-#{System.unique_integer([:positive])}",
      title: "Test Share",
      summary: nil,
      turn_count: nil
    }

    struct(HeyiAm.Shares.Share, Map.merge(defaults, attrs))
  end

  describe "build_share_assigns/1" do
    test "computes tool_call_count from toolUsage map" do
      share = build_share(%{
        summary: %{
          "toolUsage" => %{
            "Read" => %{"count" => 10},
            "Write" => %{"count" => 5}
          }
        }
      })

      assigns = ShareController.build_share_assigns(share)
      assert assigns.tool_call_count == 15
    end

    test "returns top_tools sorted by count descending, limited to 5" do
      tool_usage = %{
        "Read" => %{"count" => 50},
        "Write" => %{"count" => 40},
        "Edit" => %{"count" => 30},
        "Bash" => %{"count" => 20},
        "Grep" => %{"count" => 10},
        "Glob" => %{"count" => 5},
        "Agent" => %{"count" => 1}
      }

      share = build_share(%{summary: %{"toolUsage" => tool_usage}})
      assigns = ShareController.build_share_assigns(share)

      assert length(assigns.top_tools) == 5

      counts = Enum.map(assigns.top_tools, fn {_, v} -> v["count"] end)
      assert counts == [50, 40, 30, 20, 10]
    end

    test "beats filter: only step/correction/insight/win types pass through" do
      beats = [
        %{"type" => "step", "title" => "Step 1", "description" => "desc1"},
        %{"type" => "correction", "title" => "Fix", "description" => "desc2"},
        %{"type" => "insight", "title" => "Insight", "description" => "desc3"},
        %{"type" => "win", "title" => "Win", "description" => "desc4"},
        %{"type" => "note", "title" => "Note", "description" => "should be filtered"},
        %{"type" => "context", "title" => "Ctx", "description" => "should be filtered"}
      ]

      share = build_share(%{summary: %{"beats" => beats}})
      assigns = ShareController.build_share_assigns(share)

      assert length(assigns.steps) == 4
      types = Enum.map(assigns.steps, & &1["type"])
      assert types == ["step", "correction", "insight", "win"]
    end

    test "beats capped at 7 steps" do
      beats =
        for i <- 1..10 do
          %{"type" => "step", "title" => "Step #{i}", "description" => "desc #{i}"}
        end

      share = build_share(%{summary: %{"beats" => beats}})
      assigns = ShareController.build_share_assigns(share)

      assert length(assigns.steps) == 7
    end

    test "beats map fields correctly: title, body from description, insight from directionNote" do
      beats = [
        %{
          "type" => "step",
          "title" => "My Title",
          "description" => "My Description",
          "directionNote" => "My Insight"
        }
      ]

      share = build_share(%{summary: %{"beats" => beats}})
      assigns = ShareController.build_share_assigns(share)

      [step] = assigns.steps
      assert step["title"] == "My Title"
      assert step["body"] == "My Description"
      assert step["insight"] == "My Insight"
      assert step["type"] == "step"
    end

    test "falls back to executionPath when beats is empty" do
      execution_path = [%{"title" => "From executionPath"}]

      share = build_share(%{
        summary: %{
          "beats" => [],
          "executionPath" => execution_path
        }
      })

      assigns = ShareController.build_share_assigns(share)
      assert assigns.steps == execution_path
    end

    test "falls back to tutorialSteps when beats and executionPath are empty/nil" do
      tutorial_steps = [%{"title" => "From tutorialSteps"}]

      share = build_share(%{
        summary: %{
          "beats" => nil,
          "executionPath" => nil,
          "tutorialSteps" => tutorial_steps
        }
      })

      assigns = ShareController.build_share_assigns(share)
      assert assigns.steps == tutorial_steps
    end

    test "falls back to tutorialSteps when executionPath is also nil" do
      tutorial_steps = [%{"title" => "Tutorial fallback"}]

      share = build_share(%{
        summary: %{
          "tutorialSteps" => tutorial_steps
        }
      })

      assigns = ShareController.build_share_assigns(share)
      assert assigns.steps == tutorial_steps
    end

    test "total_turns falls back to share.turn_count when summary has no totalTurns" do
      share = build_share(%{
        summary: %{},
        turn_count: 42
      })

      assigns = ShareController.build_share_assigns(share)
      assert assigns.total_turns == 42
    end

    test "total_turns uses summary totalTurns when present" do
      share = build_share(%{
        summary: %{"totalTurns" => 99},
        turn_count: 42
      })

      assigns = ShareController.build_share_assigns(share)
      assert assigns.total_turns == 99
    end

    test "handles nil summary gracefully with safe defaults" do
      share = build_share(%{summary: nil, turn_count: 5})
      assigns = ShareController.build_share_assigns(share)

      assert assigns.tool_call_count == 0
      assert assigns.top_tools == []
      assert assigns.steps == []
      assert assigns.highlights == []
      assert assigns.prompts == []
      assert assigns.files_changed == []
      assert assigns.total_turns == 5
      assert assigns.colors == ~w(violet rose teal amber sky)
    end

    test "handles empty summary map" do
      share = build_share(%{summary: %{}, turn_count: nil})
      assigns = ShareController.build_share_assigns(share)

      assert assigns.tool_call_count == 0
      assert assigns.top_tools == []
      assert assigns.steps == []
      assert assigns.total_turns == nil
    end

    test "max_count scenario: tool counts all 0 does not crash" do
      share = build_share(%{
        summary: %{
          "toolUsage" => %{
            "Read" => %{"count" => 0},
            "Write" => %{"count" => 0}
          }
        }
      })

      assigns = ShareController.build_share_assigns(share)
      assert assigns.tool_call_count == 0
      # Should not raise division by zero or crash
    end
  end

  describe "GET /s/:token/transcript" do
    test "renders transcript page for a share with prompts", %{conn: conn} do
      {:ok, share, :created} =
        Shares.upsert_share(%{
          title: "Test Transcript Session",
          summary: %{
            "prompts" => [
              %{"text" => "Refactor the auth module", "tools" => ["Read", "Edit"]},
              %{"text" => "Now add tests", "tools" => ["Write"]}
            ],
            "beats" => [
              %{"type" => "correction", "title" => "Changed approach", "description" => "Switched to JWT"},
              %{"type" => "insight", "title" => "Key insight", "description" => "Redis was faster"}
            ]
          }
        })

      conn = get(conn, "/s/#{share.token}/transcript")
      response = html_response(conn, 200)

      assert response =~ "Full Session: Test Transcript Session"
      assert response =~ "TRANSCRIPT"
      assert response =~ "Refactor the auth module"
      assert response =~ "Now add tests"
      assert response =~ "Back to session"
    end

    test "renders empty state when no prompts", %{conn: conn} do
      {:ok, share, :created} =
        Shares.upsert_share(%{
          title: "Empty Session",
          summary: %{"prompts" => []}
        })

      conn = get(conn, "/s/#{share.token}/transcript")
      response = html_response(conn, 200)

      assert response =~ "No transcript data available"
    end

    test "returns 404 for unknown token", %{conn: conn} do
      conn = get(conn, "/s/nonexistent-token/transcript")
      assert html_response(conn, 404)
    end
  end
end
