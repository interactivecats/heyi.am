defmodule HeyiAm.LLM.SamplerTest do
  use ExUnit.Case, async: true

  alias HeyiAm.LLM.Sampler

  # ── Helpers ──────────────────────────────────────────────────

  defp make_turn(type, content, timestamp \\ "00:00:00") do
    %{"type" => type, "content" => content, "timestamp" => timestamp}
  end

  defp make_timeline(n) do
    Enum.map(0..(n - 1), fn i ->
      type =
        case rem(i, 4) do
          0 -> "prompt"
          1 -> "tool"
          2 -> "response"
          _ -> "error"
        end

      make_turn(type, "turn #{i} content", "00:#{String.pad_leading("#{i}", 2, "0")}:00")
    end)
  end

  defp make_session(n, opts \\ []) do
    timeline = Keyword.get(opts, :timeline, make_timeline(n))
    raw_log = Keyword.get(opts, :raw_log, Enum.map(0..(n - 1), fn i -> "line #{i}" end))

    %{
      "title" => "Test session",
      "projectName" => "test-project",
      "durationMinutes" => 30,
      "turns" => n,
      "linesOfCode" => 100,
      "turnTimeline" => timeline,
      "rawLog" => raw_log
    }
  end

  # ── score_turn/3 ─────────────────────────────────────────────

  describe "score_turn/3" do
    test "scores prompt type +1" do
      turn = make_turn("prompt", "do something")
      score = Sampler.score_turn(turn, [turn], 0)
      assert score >= 1
    end

    test "scores error type +1" do
      turn = make_turn("error", "compilation failed")
      score = Sampler.score_turn(turn, [turn], 0)
      assert score >= 1
    end

    test "scores self-correction keywords +1 for 'wait'" do
      turns = [
        make_turn("response", "ok done"),
        make_turn("prompt", "wait, that is wrong")
      ]

      score = Sampler.score_turn(Enum.at(turns, 1), turns, 1)
      # prompt (+1) + self-correction (+1)
      assert score >= 2
    end

    test "scores self-correction keywords +1 for 'actually'" do
      turn = make_turn("response", "actually let me reconsider that")
      score = Sampler.score_turn(turn, [turn], 0)
      assert score >= 1
    end

    test "scores self-correction keywords +1 for 'no,'" do
      turn = make_turn("prompt", "no, that approach is wrong")
      score = Sampler.score_turn(turn, [turn], 0)
      assert score >= 1
    end

    test "scores content length > 200 chars +1" do
      long_content = String.duplicate("x", 201)
      turn = make_turn("response", long_content)
      score = Sampler.score_turn(turn, [turn], 0)
      assert score >= 1
    end

    test "does not score content length <= 200 for verbosity" do
      turn = make_turn("response", String.duplicate("x", 200))
      score = Sampler.score_turn(turn, [turn], 0)
      # Should not get the length bonus at exactly 200
      assert score < 2
    end

    test "scores recovery after error +1" do
      turns = [
        make_turn("error", "crash"),
        make_turn("prompt", "fix it")
      ]

      score = Sampler.score_turn(Enum.at(turns, 1), turns, 1)
      # prompt (+1) + previous was error (+1)
      assert score >= 2
    end

    test "max possible score is 5" do
      prev = make_turn("error", "crash")
      turn = make_turn("prompt", "actually wait no, that is wrong #{String.duplicate("x", 201)}")
      score = Sampler.score_turn(turn, [prev, turn], 1)
      assert score <= 5
    end

    test "returns 0 for low-signal response turn" do
      turn = make_turn("response", "ok")
      score = Sampler.score_turn(turn, [turn], 0)
      assert score == 0
    end
  end

  # ── sample_session/1 short sessions ──────────────────────────

  describe "sample_session/1 short sessions" do
    test "N=30 passes through unchanged, sampled: false" do
      session = make_session(30)
      result = Sampler.sample_session(session)

      assert result["_sampling_meta"]["sampled"] == false
      assert result["_sampling_meta"]["totalTurns"] == 30
      assert result["_sampling_meta"]["selectedTurns"] == 30
      assert length(result["turnTimeline"]) == 30
      assert length(result["rawLog"]) == 30
    end

    test "N=50 passes through unchanged (boundary)" do
      session = make_session(50)
      result = Sampler.sample_session(session)

      assert result["_sampling_meta"]["sampled"] == false
      assert length(result["turnTimeline"]) == 50
    end

    test "N=51 triggers sampling" do
      session = make_session(51)
      result = Sampler.sample_session(session)

      assert result["_sampling_meta"]["sampled"] == true
    end
  end

  # ── sample_session/1 long sessions ───────────────────────────

  describe "sample_session/1 long sessions" do
    test "N=500 returns sampled: true with correct total" do
      session = make_session(500)
      result = Sampler.sample_session(session)

      assert result["_sampling_meta"]["sampled"] == true
      assert result["_sampling_meta"]["totalTurns"] == 500
    end

    test "N=500 selected turns cover all three thirds" do
      session = make_session(500)
      result = Sampler.sample_session(session)

      positions =
        result["turnTimeline"]
        |> Enum.map(fn t ->
          case Regex.run(~r/\[T(\d+)\/500\]/, t["content"]) do
            [_, n] -> String.to_integer(n)
            _ -> nil
          end
        end)
        |> Enum.reject(&is_nil/1)

      third = div(500, 3)
      from_beginning = Enum.filter(positions, fn p -> p <= third end)
      from_middle = Enum.filter(positions, fn p -> p > third and p <= 2 * third end)
      from_end = Enum.filter(positions, fn p -> p > 2 * third end)

      assert length(from_beginning) > 0
      assert length(from_middle) > 0
      assert length(from_end) > 0
    end

    test "selected turns are returned in chronological order" do
      session = make_session(200)
      result = Sampler.sample_session(session)

      positions =
        result["turnTimeline"]
        |> Enum.map(fn t ->
          case Regex.run(~r/\[T(\d+)\/200\]/, t["content"]) do
            [_, n] -> String.to_integer(n)
            _ -> 0
          end
        end)

      pairs = Enum.zip(positions, tl(positions))
      assert Enum.all?(pairs, fn {a, b} -> a <= b end)
    end

    test "annotations use T{n}/{total} format in turnTimeline" do
      session = make_session(100)
      result = Sampler.sample_session(session)

      assert result["_sampling_meta"]["sampled"] == true

      for turn <- result["turnTimeline"] do
        assert turn["content"] =~ ~r/\[T\d+\/100\]/
      end
    end

    test "annotations use T{n}/{total} format in rawLog" do
      session = make_session(100)
      result = Sampler.sample_session(session)

      for line <- result["rawLog"] do
        assert line =~ ~r/\[T\d+\/100\]/
      end
    end

    test "high-signal turns are prioritized within a third" do
      # Build 200-turn session where turns 60-70 have max signal
      timeline =
        Enum.map(0..199, fn i ->
          if i >= 60 and i < 70 do
            # prompt + self-correction + long = 3 points minimum
            make_turn(
              "prompt",
              "actually wait no, this approach is wrong #{String.duplicate("x", 201)}"
            )
          else
            make_turn("response", "turn #{i}")
          end
        end)

      session = make_session(200, timeline: timeline, raw_log: [])
      result = Sampler.sample_session(session)

      positions =
        result["turnTimeline"]
        |> Enum.map(fn t ->
          case Regex.run(~r/\[T(\d+)\/200\]/, t["content"]) do
            [_, n] -> String.to_integer(n)
            _ -> nil
          end
        end)
        |> Enum.reject(&is_nil/1)

      # Turns 61-70 (1-indexed) should appear in middle third selection
      high_signal_selected = Enum.filter(positions, fn p -> p >= 61 and p <= 70 end)
      assert length(high_signal_selected) > 0
    end
  end

  # ── edge cases ────────────────────────────────────────────────

  describe "sample_session/1 edge cases" do
    test "handles empty turnTimeline" do
      session = %{
        "title" => "Empty",
        "projectName" => "test",
        "turnTimeline" => [],
        "rawLog" => []
      }

      result = Sampler.sample_session(session)
      assert result["_sampling_meta"]["sampled"] == false
      assert result["turnTimeline"] == []
    end

    test "handles missing turnTimeline key" do
      session = %{"title" => "No timeline", "projectName" => "test"}
      result = Sampler.sample_session(session)
      assert result["_sampling_meta"]["sampled"] == false
    end

    test "handles non-list turnTimeline gracefully" do
      session = %{
        "title" => "Bad data",
        "projectName" => "test",
        "turnTimeline" => "not a list",
        "rawLog" => []
      }

      result = Sampler.sample_session(session)
      assert result["_sampling_meta"]["sampled"] == false
    end

    test "preserves other session fields when sampling" do
      session = make_session(500)
      session = Map.put(session, "skills", ["Elixir", "Phoenix"])
      session = Map.put(session, "filesChanged", [%{"path" => "lib/foo.ex", "additions" => 10, "deletions" => 5}])

      result = Sampler.sample_session(session)

      assert result["skills"] == ["Elixir", "Phoenix"]
      assert length(result["filesChanged"]) == 1
      assert result["_sampling_meta"]["sampled"] == true
    end
  end
end
