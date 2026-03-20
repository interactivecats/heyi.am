defmodule HeyiAm.ProfilesTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAm.Profiles
  alias HeyiAm.Shares.Share
  alias HeyiAm.Accounts.User

  import HeyiAm.AccountsFixtures

  defp create_share(user, attrs \\ %{}) do
    defaults = %{
      token: "tok_#{System.unique_integer([:positive])}",
      delete_token: "del_#{System.unique_integer([:positive])}",
      title: "Test Share"
    }

    share_attrs = Map.merge(defaults, attrs)

    %Share{user_id: user.id}
    |> Share.changeset(share_attrs)
    |> Repo.insert!()
  end

  describe "compute_profile/1" do
    test "returns default profile when user has no shares" do
      user = user_fixture()
      profile = Profiles.compute_profile(user.id)

      assert profile["session_count"] == 0
      assert profile["task_scoping"]["label"] == "unknown"
      assert profile["active_redirection"]["label"] == "unknown"
      assert profile["verification"]["label"] == "unknown"
      assert profile["tool_orchestration"]["label"] == "unknown"
      assert profile["date_range"] == nil
    end

    test "computes task scoping with tight label" do
      user = user_fixture()
      create_share(user, %{step_count: 3, duration_minutes: 15})
      create_share(user, %{step_count: 5, duration_minutes: 20})

      profile = Profiles.compute_profile(user.id)

      assert profile["task_scoping"]["avg_steps"] == 4.0
      assert profile["task_scoping"]["avg_duration"] == 18
      assert profile["task_scoping"]["label"] == "tight"
    end

    test "computes task scoping with focused label" do
      user = user_fixture()
      create_share(user, %{step_count: 6, duration_minutes: 30})
      create_share(user, %{step_count: 8, duration_minutes: 40})

      profile = Profiles.compute_profile(user.id)

      assert profile["task_scoping"]["avg_steps"] == 7.0
      assert profile["task_scoping"]["label"] == "focused"
    end

    test "computes task scoping with broad label" do
      user = user_fixture()
      create_share(user, %{step_count: 10, duration_minutes: 60})
      create_share(user, %{step_count: 12, duration_minutes: 90})

      profile = Profiles.compute_profile(user.id)

      assert profile["task_scoping"]["avg_steps"] == 11.0
      assert profile["task_scoping"]["label"] == "broad"
    end

    test "computes active redirection with high label" do
      user = user_fixture()
      # ratio = 6/3 = 2.0
      create_share(user, %{turn_count: 6, step_count: 3})
      # ratio = 9/3 = 3.0
      create_share(user, %{turn_count: 9, step_count: 3})

      profile = Profiles.compute_profile(user.id)

      # avg_ratio = (2.0 + 3.0) / 2 = 2.5
      assert profile["active_redirection"]["avg_ratio"] == 2.5
      assert profile["active_redirection"]["label"] == "high"
    end

    test "computes active redirection with moderate label" do
      user = user_fixture()
      # ratio = 20/4 = 5.0
      create_share(user, %{turn_count: 20, step_count: 4})

      profile = Profiles.compute_profile(user.id)

      assert profile["active_redirection"]["avg_ratio"] == 5.0
      assert profile["active_redirection"]["label"] == "moderate"
    end

    test "computes active redirection with developing label" do
      user = user_fixture()
      # ratio = 35/5 = 7.0
      create_share(user, %{turn_count: 35, step_count: 5})

      profile = Profiles.compute_profile(user.id)

      assert profile["active_redirection"]["avg_ratio"] == 7.0
      assert profile["active_redirection"]["label"] == "developing"
    end

    test "computes verification rate as consistent" do
      user = user_fixture()

      create_share(user, %{
        summary: %{"toolUsage" => %{"Bash" => %{"count" => 5}, "Read" => %{"count" => 3}}}
      })

      create_share(user, %{
        summary: %{"toolUsage" => %{"Bash" => %{"count" => 2}}}
      })

      profile = Profiles.compute_profile(user.id)

      assert profile["verification"]["rate"] == 1.0
      assert profile["verification"]["label"] == "consistent"
    end

    test "computes verification rate as partial" do
      user = user_fixture()

      create_share(user, %{
        summary: %{"toolUsage" => %{"Bash" => %{"count" => 5}}}
      })

      create_share(user, %{
        summary: %{"toolUsage" => %{"Read" => %{"count" => 3}}}
      })

      profile = Profiles.compute_profile(user.id)

      assert profile["verification"]["rate"] == 0.5
      assert profile["verification"]["label"] == "partial"
    end

    test "computes verification rate as rare" do
      user = user_fixture()

      create_share(user, %{
        summary: %{"toolUsage" => %{"Read" => %{"count" => 3}}}
      })

      create_share(user, %{
        summary: %{"toolUsage" => %{"Edit" => %{"count" => 2}}}
      })

      profile = Profiles.compute_profile(user.id)

      assert profile["verification"]["rate"] == 0.0
      assert profile["verification"]["label"] == "rare"
    end

    test "computes tool orchestration with strong label" do
      user = user_fixture()

      create_share(user, %{
        summary: %{
          "toolUsage" => %{
            "Bash" => %{"count" => 1},
            "Read" => %{"count" => 2},
            "Edit" => %{"count" => 3},
            "Grep" => %{"count" => 1},
            "Glob" => %{"count" => 1},
            "Write" => %{"count" => 1},
            "WebSearch" => %{"count" => 1}
          }
        }
      })

      profile = Profiles.compute_profile(user.id)

      assert profile["tool_orchestration"]["avg_diversity"] == 7.0
      assert profile["tool_orchestration"]["label"] == "strong"
    end

    test "computes tool orchestration with moderate label" do
      user = user_fixture()

      create_share(user, %{
        summary: %{
          "toolUsage" => %{
            "Bash" => %{"count" => 1},
            "Read" => %{"count" => 2},
            "Edit" => %{"count" => 3}
          }
        }
      })

      profile = Profiles.compute_profile(user.id)

      assert profile["tool_orchestration"]["avg_diversity"] == 3.0
      assert profile["tool_orchestration"]["label"] == "moderate"
    end

    test "computes tool orchestration with limited label" do
      user = user_fixture()

      create_share(user, %{
        summary: %{
          "toolUsage" => %{"Bash" => %{"count" => 5}}
        }
      })

      profile = Profiles.compute_profile(user.id)

      assert profile["tool_orchestration"]["avg_diversity"] == 1.0
      assert profile["tool_orchestration"]["label"] == "limited"
    end

    test "computes date range from session_month" do
      user = user_fixture()
      create_share(user, %{session_month: "2026-03"})
      create_share(user, %{session_month: "2026-06"})

      profile = Profiles.compute_profile(user.id)

      assert profile["date_range"] == "Mar 2026-Jun 2026"
    end

    test "computes single-month date range" do
      user = user_fixture()
      create_share(user, %{session_month: "2026-03"})

      profile = Profiles.compute_profile(user.id)

      assert profile["date_range"] == "Mar 2026"
    end

    test "skips nil step_count and duration_minutes gracefully" do
      user = user_fixture()
      create_share(user, %{step_count: nil, duration_minutes: nil})
      create_share(user, %{step_count: 6, duration_minutes: 30})

      profile = Profiles.compute_profile(user.id)

      assert profile["task_scoping"]["avg_steps"] == 6.0
      assert profile["task_scoping"]["avg_duration"] == 30
    end

    test "skips shares with nil turn_count or step_count for redirection" do
      user = user_fixture()
      create_share(user, %{turn_count: nil, step_count: 5})
      create_share(user, %{turn_count: 10, step_count: nil})
      create_share(user, %{turn_count: 10, step_count: 0})
      create_share(user, %{turn_count: 6, step_count: 2})

      profile = Profiles.compute_profile(user.id)

      # Only the last share contributes: ratio = 6/2 = 3.0
      assert profile["active_redirection"]["avg_ratio"] == 3.0
    end

    test "handles shares with no summary for verification and orchestration" do
      user = user_fixture()
      create_share(user, %{summary: nil})
      create_share(user, %{summary: %{"other" => "data"}})

      profile = Profiles.compute_profile(user.id)

      assert profile["verification"]["rate"] == nil
      assert profile["verification"]["label"] == "unknown"
      assert profile["tool_orchestration"]["avg_diversity"] == nil
      assert profile["tool_orchestration"]["label"] == "unknown"
    end

    test "session_count reflects total shares" do
      user = user_fixture()
      for _ <- 1..5, do: create_share(user)

      profile = Profiles.compute_profile(user.id)
      assert profile["session_count"] == 5
    end
  end

  describe "scope_label/1" do
    test "boundary at exactly 5" do
      assert Profiles.scope_label(5) == "tight"
      assert Profiles.scope_label(5.0) == "tight"
    end

    test "boundary at exactly 8" do
      assert Profiles.scope_label(8) == "focused"
      assert Profiles.scope_label(8.0) == "focused"
    end

    test "above 8" do
      assert Profiles.scope_label(8.1) == "broad"
    end

    test "nil returns unknown" do
      assert Profiles.scope_label(nil) == "unknown"
    end
  end

  describe "redirection_label/1" do
    test "boundary at exactly 3" do
      assert Profiles.redirection_label(3) == "high"
      assert Profiles.redirection_label(3.0) == "high"
    end

    test "boundary at exactly 6" do
      assert Profiles.redirection_label(6) == "moderate"
      assert Profiles.redirection_label(6.0) == "moderate"
    end

    test "above 6" do
      assert Profiles.redirection_label(6.1) == "developing"
    end

    test "nil returns unknown" do
      assert Profiles.redirection_label(nil) == "unknown"
    end
  end

  describe "verification_label/1" do
    test "boundary at exactly 0.8" do
      assert Profiles.verification_label(0.8) == "consistent"
    end

    test "boundary at exactly 0.5" do
      assert Profiles.verification_label(0.5) == "partial"
    end

    test "below 0.5" do
      assert Profiles.verification_label(0.49) == "rare"
    end

    test "nil returns unknown" do
      assert Profiles.verification_label(nil) == "unknown"
    end
  end

  describe "orchestration_label/1" do
    test "boundary at exactly 6" do
      assert Profiles.orchestration_label(6) == "strong"
      assert Profiles.orchestration_label(6.0) == "strong"
    end

    test "boundary at exactly 3" do
      assert Profiles.orchestration_label(3) == "moderate"
      assert Profiles.orchestration_label(3.0) == "moderate"
    end

    test "below 3" do
      assert Profiles.orchestration_label(2.9) == "limited"
    end

    test "nil returns unknown" do
      assert Profiles.orchestration_label(nil) == "unknown"
    end
  end

  describe "meets_threshold?/1" do
    test "returns false when user has fewer than 8 shares" do
      user = user_fixture()
      for _ <- 1..7, do: create_share(user)

      refute Profiles.meets_threshold?(user.id)
    end

    test "returns true when user has exactly 8 shares" do
      user = user_fixture()
      for _ <- 1..8, do: create_share(user)

      assert Profiles.meets_threshold?(user.id)
    end

    test "returns true when user has more than 8 shares" do
      user = user_fixture()
      for _ <- 1..10, do: create_share(user)

      assert Profiles.meets_threshold?(user.id)
    end

    test "returns false when user has no shares" do
      user = user_fixture()
      refute Profiles.meets_threshold?(user.id)
    end
  end

  describe "refresh_profile/1" do
    test "updates user.profile_data in the database" do
      user = user_fixture()

      create_share(user, %{
        step_count: 4,
        duration_minutes: 20,
        turn_count: 8,
        session_month: "2026-03",
        summary: %{
          "toolUsage" => %{
            "Bash" => %{"count" => 5},
            "Read" => %{"count" => 3},
            "Edit" => %{"count" => 2}
          }
        }
      })

      {:ok, profile} = Profiles.refresh_profile(user.id)

      assert profile["session_count"] == 1
      assert profile["task_scoping"]["label"] == "tight"

      # Verify it was persisted
      updated_user = Repo.get!(User, user.id)
      assert updated_user.profile_data["session_count"] == 1
      assert updated_user.profile_data["task_scoping"]["label"] == "tight"
    end

    test "is idempotent -- running twice produces same result" do
      user = user_fixture()
      create_share(user, %{step_count: 5, duration_minutes: 20})

      {:ok, profile1} = Profiles.refresh_profile(user.id)
      {:ok, profile2} = Profiles.refresh_profile(user.id)

      assert profile1 == profile2
    end

    test "stores default profile when user has no shares" do
      user = user_fixture()

      {:ok, profile} = Profiles.refresh_profile(user.id)

      assert profile["session_count"] == 0

      updated_user = Repo.get!(User, user.id)
      assert updated_user.profile_data["session_count"] == 0
    end
  end
end
