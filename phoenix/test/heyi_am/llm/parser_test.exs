defmodule HeyiAm.LLM.ParserTest do
  use ExUnit.Case, async: true

  alias HeyiAm.LLM.Parser

  @valid_json Jason.encode!(%{
    title: "Fixed auth middleware",
    context: "Sessions were expiring silently",
    developerTake: "The race condition was the hard part.",
    skills: ["Elixir", "Phoenix"],
    questions: [
      %{text: "Why not GenServer?", suggestedAnswer: "Overkill."},
      %{text: "How catch race?", suggestedAnswer: "Logging."},
      %{text: "Handle clustering?", suggestedAnswer: "Not yet."}
    ],
    executionSteps: [
      %{stepNumber: 1, title: "Found the bug", body: "Tokens expired mid-request."},
      %{stepNumber: 2, title: "Added guard", body: "Check-then-refresh."}
    ]
  })

  describe "parse_result/1" do
    test "parses valid JSON" do
      assert {:ok, result} = Parser.parse_result(@valid_json)
      assert result["title"] == "Fixed auth middleware"
      assert result["skills"] == ["Elixir", "Phoenix"]
      assert length(result["questions"]) == 3
      assert length(result["executionSteps"]) == 2
    end

    test "extracts JSON from markdown code fence" do
      wrapped = "```json\n#{@valid_json}\n```"
      assert {:ok, result} = Parser.parse_result(wrapped)
      assert result["title"] == "Fixed auth middleware"
    end

    test "extracts JSON from bare code fence" do
      wrapped = "```\n#{@valid_json}\n```"
      assert {:ok, result} = Parser.parse_result(wrapped)
      assert result["title"] == "Fixed auth middleware"
    end

    test "enforces title max length (80 chars)" do
      long_title = String.duplicate("a", 100)
      json = Jason.encode!(%{title: long_title, context: "", developerTake: "", skills: [], questions: [], executionSteps: []})

      assert {:ok, result} = Parser.parse_result(json)
      assert String.length(result["title"]) <= 80
    end

    test "enforces context max length (200 chars)" do
      long_context = String.duplicate("b", 250)
      json = Jason.encode!(%{title: "", context: long_context, developerTake: "", skills: [], questions: [], executionSteps: []})

      assert {:ok, result} = Parser.parse_result(json)
      assert String.length(result["context"]) <= 200
    end

    test "enforces developerTake max length (300 chars)" do
      long_take = String.duplicate("c", 350)
      json = Jason.encode!(%{title: "", context: "", developerTake: long_take, skills: [], questions: [], executionSteps: []})

      assert {:ok, result} = Parser.parse_result(json)
      assert String.length(result["developerTake"]) <= 300
    end

    test "caps questions at 3" do
      questions = for i <- 1..5, do: %{text: "Q#{i}?", suggestedAnswer: "A#{i}"}
      json = Jason.encode!(%{title: "", context: "", developerTake: "", skills: [], questions: questions, executionSteps: []})

      assert {:ok, result} = Parser.parse_result(json)
      assert length(result["questions"]) == 3
    end

    test "caps execution steps at 7" do
      steps = for i <- 1..10, do: %{stepNumber: i, title: "Step #{i}", body: "Body #{i}"}
      json = Jason.encode!(%{title: "", context: "", developerTake: "", skills: [], questions: [], executionSteps: steps})

      assert {:ok, result} = Parser.parse_result(json)
      assert length(result["executionSteps"]) == 7
    end

    test "returns error for invalid JSON" do
      assert {:error, {:invalid_json, _}} = Parser.parse_result("not json at all")
    end

    test "returns error for non-object JSON" do
      assert {:error, :not_a_json_object} = Parser.parse_result("[1, 2, 3]")
    end
  end

  describe "strip_banned/1" do
    test "removes banned words" do
      assert Parser.strip_banned("We leverage the robust system") == "We the system"
    end

    test "is case insensitive" do
      assert Parser.strip_banned("SEAMLESS integration") == "integration"
    end

    test "normalizes whitespace after removal" do
      assert Parser.strip_banned("very  robust  and  seamless") == "very and"
    end
  end

  describe "find_banned_words/1" do
    test "finds banned words in text" do
      assert Parser.find_banned_words("We leverage robust tools") == ["leverage", "robust"]
    end

    test "returns empty list for clean text" do
      assert Parser.find_banned_words("We use strong tools") == []
    end
  end
end
