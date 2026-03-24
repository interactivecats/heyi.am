defmodule HeyiAm.LLMTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAm.LLM

  setup do
    user = HeyiAm.AccountsFixtures.user_fixture()
    %{user: user}
  end

  describe "log_usage/1" do
    test "inserts a usage record", %{user: user} do
      assert {:ok, usage} =
               LLM.log_usage(%{
                 user_id: user.id,
                 provider: "gemini",
                 model: "gemini-2.5-flash",
                 input_tokens: 1000,
                 output_tokens: 200,
                 estimated_cost_cents: 1,
                 duration_ms: 3500,
                 status: "success"
               })

      assert usage.user_id == user.id
      assert usage.provider == "gemini"
      assert usage.status == "success"
    end

    test "validates required fields" do
      assert {:error, changeset} = LLM.log_usage(%{})
      errors = errors_on(changeset)
      assert "can't be blank" in errors[:user_id]
      assert "can't be blank" in errors[:provider]
      assert "can't be blank" in errors[:status]
    end

    test "validates status values", %{user: user} do
      assert {:error, changeset} =
               LLM.log_usage(%{
                 user_id: user.id,
                 provider: "gemini",
                 model: "gemini-2.5-flash",
                 status: "invalid"
               })

      assert "is invalid" in errors_on(changeset)[:status]
    end
  end

  describe "monthly_count/1" do
    test "returns 0 for new user", %{user: user} do
      assert LLM.monthly_count(user.id) == 0
    end

    test "counts only successful enhancements", %{user: user} do
      for _ <- 1..3 do
        LLM.log_usage(%{
          user_id: user.id,
          provider: "gemini",
          model: "gemini-2.5-flash",
          status: "success"
        })
      end

      LLM.log_usage(%{
        user_id: user.id,
        provider: "gemini",
        model: "gemini-2.5-flash",
        status: "error",
        error_code: "UPSTREAM_ERROR"
      })

      assert LLM.monthly_count(user.id) == 3
    end

    test "does not count other users", %{user: user} do
      other_user = HeyiAm.AccountsFixtures.user_fixture()

      LLM.log_usage(%{
        user_id: other_user.id,
        provider: "gemini",
        model: "gemini-2.5-flash",
        status: "success"
      })

      assert LLM.monthly_count(user.id) == 0
    end
  end

  describe "within_quota?/1" do
    test "returns true when under quota", %{user: user} do
      assert LLM.within_quota?(user.id)
    end

    test "returns false when at quota", %{user: user} do
      # Default quota is 10
      for _ <- 1..10 do
        LLM.log_usage(%{
          user_id: user.id,
          provider: "gemini",
          model: "gemini-2.5-flash",
          status: "success"
        })
      end

      refute LLM.within_quota?(user.id)
    end
  end

  describe "remaining_quota/1" do
    test "returns full quota for new user", %{user: user} do
      assert LLM.remaining_quota(user.id) == 10
    end

    test "decrements with usage", %{user: user} do
      for _ <- 1..3 do
        LLM.log_usage(%{
          user_id: user.id,
          provider: "gemini",
          model: "gemini-2.5-flash",
          status: "success"
        })
      end

      assert LLM.remaining_quota(user.id) == 7
    end
  end

  describe "enhance/2" do
    @valid_session %{
      "title" => "Fix auth bug",
      "projectName" => "heyi-am",
      "durationMinutes" => 30,
      "turns" => 10,
      "linesOfCode" => 50,
      "skills" => ["Elixir"],
      "toolBreakdown" => [],
      "filesChanged" => [],
      "executionPath" => [],
      "turnTimeline" => [],
      "rawLog" => ["line 1", "line 2"]
    }

    test "returns enhancement result with remaining quota", %{user: user} do
      assert {:ok, result, remaining} = LLM.enhance(user.id, @valid_session)

      assert is_binary(result["title"])
      assert is_binary(result["developerTake"])
      assert is_list(result["skills"])
      assert is_list(result["questions"])
      assert is_list(result["executionSteps"])
      assert remaining == 9
    end

    test "logs successful usage", %{user: user} do
      {:ok, _result, _remaining} = LLM.enhance(user.id, @valid_session)

      assert LLM.monthly_count(user.id) == 1
    end

    test "returns error for missing title", %{user: user} do
      session = Map.delete(@valid_session, "title")

      assert {:error, {:invalid_session, msg}} = LLM.enhance(user.id, session)
      assert msg =~ "title"
    end

    test "returns quota_exceeded when at limit", %{user: user} do
      for _ <- 1..10 do
        LLM.log_usage(%{
          user_id: user.id,
          provider: "gemini",
          model: "gemini-2.5-flash",
          status: "success"
        })
      end

      assert {:error, :quota_exceeded} = LLM.enhance(user.id, @valid_session)
    end

    test "truncates oversized raw log", %{user: user} do
      session = Map.put(@valid_session, "rawLog", for(i <- 1..50, do: "line #{i}"))

      assert {:ok, _result, _remaining} = LLM.enhance(user.id, session)
    end

    test "truncates oversized timeline", %{user: user} do
      timeline = for i <- 1..25, do: %{"type" => "prompt", "timestamp" => "00:#{i}", "content" => "msg #{i}"}
      session = Map.put(@valid_session, "turnTimeline", timeline)

      assert {:ok, _result, _remaining} = LLM.enhance(user.id, session)
    end
  end
end
