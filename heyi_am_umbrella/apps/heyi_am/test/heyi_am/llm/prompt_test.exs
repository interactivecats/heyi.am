defmodule HeyiAm.LLM.PromptTest do
  use ExUnit.Case, async: true

  alias HeyiAm.LLM.Prompt

  describe "system_prompt/0" do
    test "includes banned words list" do
      prompt = Prompt.system_prompt()
      assert prompt =~ "leverage"
      assert prompt =~ "seamless"
    end

    test "includes JSON schema" do
      prompt = Prompt.system_prompt()
      assert prompt =~ "\"title\""
      assert prompt =~ "\"executionSteps\""
      assert prompt =~ "\"developerTake\""
    end

    test "includes character limits" do
      prompt = Prompt.system_prompt()
      assert prompt =~ "max 80 characters"
      assert prompt =~ "max 200 characters"
      assert prompt =~ "max 300 characters"
    end
  end

  describe "user_prompt/1" do
    test "includes basic session info" do
      session = %{
        "title" => "Fix auth bug",
        "projectName" => "heyi-am",
        "durationMinutes" => 30,
        "turns" => 42,
        "linesOfCode" => 150
      }

      prompt = Prompt.user_prompt(session)
      assert prompt =~ "Session: Fix auth bug"
      assert prompt =~ "Project: heyi-am"
      assert prompt =~ "30 min, 42 turns, 150 LOC"
    end

    test "includes skills when present" do
      session = %{
        "title" => "Test",
        "projectName" => "test",
        "skills" => ["Elixir", "Phoenix"]
      }

      prompt = Prompt.user_prompt(session)
      assert prompt =~ "Detected skills: Elixir, Phoenix"
    end

    test "includes tool breakdown" do
      session = %{
        "title" => "Test",
        "projectName" => "test",
        "toolBreakdown" => [
          %{"tool" => "Read", "count" => 15},
          %{"tool" => "Edit", "count" => 8}
        ]
      }

      prompt = Prompt.user_prompt(session)
      assert prompt =~ "Read(15)"
      assert prompt =~ "Edit(8)"
    end

    test "includes top 10 files by change size" do
      files = for i <- 1..15 do
        %{"path" => "file#{i}.ex", "additions" => i * 10, "deletions" => i}
      end

      session = %{"title" => "Test", "projectName" => "test", "filesChanged" => files}
      prompt = Prompt.user_prompt(session)

      # Should include file15 (most changes) but not file1
      assert prompt =~ "file15.ex"
      refute prompt =~ "file1.ex (+10/"
    end

    test "includes developer prompts from timeline" do
      session = %{
        "title" => "Test",
        "projectName" => "test",
        "turnTimeline" => [
          %{"type" => "prompt", "timestamp" => "00:05", "content" => "Fix the auth bug"},
          %{"type" => "response", "timestamp" => "00:06", "content" => "Done"},
          %{"type" => "prompt", "timestamp" => "00:10", "content" => "No, use a plug instead"}
        ]
      }

      prompt = Prompt.user_prompt(session)
      assert prompt =~ "Fix the auth bug"
      assert prompt =~ "No, use a plug instead"
      refute prompt =~ "Done"
    end

    test "includes raw log lines" do
      # The sampler controls log truncation for long sessions; prompt.ex renders
      # whatever the sampler provides. For short/pass-through sessions, all lines
      # are present. Here we verify lines are included at all.
      log = for i <- 1..10, do: "log line #{i}"
      session = %{"title" => "Test", "projectName" => "test", "rawLog" => log}
      prompt = Prompt.user_prompt(session)

      assert prompt =~ "log line 1"
      assert prompt =~ "log line 10"
    end

    test "handles missing optional fields gracefully" do
      session = %{"title" => "Minimal", "projectName" => "test"}
      prompt = Prompt.user_prompt(session)

      assert prompt =~ "Session: Minimal"
      refute prompt =~ "Detected skills"
      refute prompt =~ "Tool usage"
    end
  end
end
