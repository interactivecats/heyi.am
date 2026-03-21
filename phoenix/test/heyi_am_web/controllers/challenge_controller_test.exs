defmodule HeyiAmWeb.ChallengeControllerTest do
  use HeyiAmWeb.ConnCase, async: true

  import HeyiAm.AccountsFixtures
  import HeyiAm.ChallengesFixtures
  import HeyiAm.SharesFixtures

  describe "GET /challenges/new (authenticated)" do
    setup :register_and_log_in_user

    test "renders the create challenge form", %{conn: conn} do
      conn = get(conn, ~p"/challenges/new")
      html = html_response(conn, 200)
      assert html =~ "Create a Challenge"
      assert html =~ "Problem Statement"
      assert html =~ "challenge[title]"
    end
  end

  describe "GET /challenges/new (unauthenticated)" do
    test "redirects to login", %{conn: conn} do
      conn = get(conn, ~p"/challenges/new")
      assert redirected_to(conn) =~ "/users/log-in"
    end
  end

  describe "POST /challenges (authenticated)" do
    setup :register_and_log_in_user

    test "creates a challenge and redirects", %{conn: conn} do
      attrs = %{
        "title" => "Build a Rate Limiter",
        "problem_statement" => "Implement a distributed token bucket."
      }

      conn = post(conn, ~p"/challenges", challenge: attrs)
      assert %{slug: slug} = redirected_params(conn)
      assert redirected_to(conn) == "/challenges/#{slug}"
    end

    test "re-renders form on invalid data", %{conn: conn} do
      conn = post(conn, ~p"/challenges", challenge: %{"title" => "", "problem_statement" => ""})
      html = html_response(conn, 200)
      assert html =~ "Create a Challenge"
    end
  end

  describe "GET /challenges/:slug (public)" do
    setup :register_and_log_in_user

    test "renders the challenge landing page", %{conn: conn, user: user} do
      challenge = challenge_fixture(user)
      conn = get(conn, ~p"/challenges/#{challenge.slug}")
      html = html_response(conn, 200)
      assert html =~ challenge.title
      assert html =~ "ACTIVE"
    end

    test "hides problem statement for private challenge without code", %{conn: conn, user: user} do
      challenge = challenge_fixture(user, %{access_code: "secret123"})
      conn = get(conn, ~p"/challenges/#{challenge.slug}")
      html = html_response(conn, 200)
      assert html =~ "requires an access code"
      assert html =~ "Unlock Challenge"
      refute html =~ "Begin Challenge"
    end

    test "shows problem statement for public challenge", %{conn: conn, user: user} do
      challenge = challenge_fixture(user)
      conn = get(conn, ~p"/challenges/#{challenge.slug}")
      html = html_response(conn, 200)
      assert html =~ challenge.problem_statement
      assert html =~ "Begin Challenge"
    end

    test "shows draft notice for draft challenges", %{conn: conn, user: user} do
      challenge = challenge_fixture(user, %{status: "draft"})
      conn = get(conn, ~p"/challenges/#{challenge.slug}")
      html = html_response(conn, 200)
      assert html =~ "not yet active"
    end

    test "shows closed notice for closed challenges", %{conn: conn, user: user} do
      challenge = challenge_fixture(user, %{status: "active"})
      {:ok, closed} = HeyiAm.Challenges.close_challenge(challenge)
      conn = get(conn, ~p"/challenges/#{closed.slug}")
      html = html_response(conn, 200)
      assert html =~ "no longer accepting"
    end

    test "raises for nonexistent slug", %{conn: conn} do
      assert_raise Ecto.NoResultsError, fn ->
        get(conn, ~p"/challenges/nonexistent")
      end
    end
  end

  describe "POST /challenges/:slug/unlock (access code)" do
    setup :register_and_log_in_user

    test "redirects to challenge on correct code", %{conn: conn, user: user} do
      challenge = challenge_fixture(user, %{access_code: "secret123"})
      conn = post(conn, ~p"/challenges/#{challenge.slug}/unlock", access_code: "secret123")
      assert redirected_to(conn) == "/challenges/#{challenge.slug}"
    end

    test "re-renders with error on wrong code", %{conn: conn, user: user} do
      challenge = challenge_fixture(user, %{access_code: "secret123"})
      conn = post(conn, ~p"/challenges/#{challenge.slug}/unlock", access_code: "wrong")
      html = html_response(conn, 200)
      assert html =~ "Invalid access code"
    end
  end

  describe "POST /challenges with evaluation criteria" do
    setup :register_and_log_in_user

    test "parses criteria_text into evaluation_criteria", %{conn: conn} do
      attrs = %{
        "title" => "Criteria Test",
        "problem_statement" => "Test problem.",
        "criteria_text" => "Code quality\nTest coverage\nPerformance"
      }

      conn = post(conn, ~p"/challenges", challenge: attrs)
      assert %{slug: slug} = redirected_params(conn)

      challenge = HeyiAm.Challenges.get_challenge_by_slug!(slug)
      assert length(challenge.evaluation_criteria) == 3
      assert Enum.at(challenge.evaluation_criteria, 0)["name"] == "Code quality"
    end
  end

  describe "GET /challenges/:slug/progress (public)" do
    setup :register_and_log_in_user

    test "renders the in-progress page with CLI command", %{conn: conn, user: user} do
      challenge = challenge_fixture(user)
      conn = get(conn, ~p"/challenges/#{challenge.slug}/progress")
      html = html_response(conn, 200)
      assert html =~ "In Progress"
      assert html =~ "heyiam publish --challenge #{challenge.slug}"
    end
  end

  describe "GET /challenges/:slug/submitted (public)" do
    setup :register_and_log_in_user

    test "renders the submitted confirmation page", %{conn: conn, user: user} do
      challenge = challenge_fixture(user)
      conn = get(conn, ~p"/challenges/#{challenge.slug}/submitted")
      html = html_response(conn, 200)
      assert html =~ "Sealed"
      assert html =~ "Submitted"
    end

    test "shows real hash when response exists", %{conn: conn, user: user} do
      challenge = challenge_fixture(user)
      _share = share_fixture(%{challenge_id: challenge.id, title: "My Response"})
      conn = get(conn, ~p"/challenges/#{challenge.slug}/submitted")
      html = html_response(conn, 200)
      assert html =~ "sha256:"
      refute html =~ "Pending verification"
    end

    test "shows fallback when no response exists", %{conn: conn, user: user} do
      challenge = challenge_fixture(user)
      conn = get(conn, ~p"/challenges/#{challenge.slug}/submitted")
      html = html_response(conn, 200)
      assert html =~ "Awaiting response..."
    end
  end

  describe "GET /challenges/:slug/compare (authenticated, creator only)" do
    setup :register_and_log_in_user

    test "renders comparison view for creator", %{conn: conn, user: user} do
      challenge = challenge_fixture(user)
      _share = share_fixture(%{challenge_id: challenge.id, title: "Test Response"})

      conn = get(conn, ~p"/challenges/#{challenge.slug}/compare")
      html = html_response(conn, 200)
      assert html =~ "Responses"
      assert html =~ challenge.title
      assert html =~ "Unbiased View"
      assert html =~ "Evaluation Protocol"
      assert html =~ "Test Response"
    end

    test "redirects non-creator", %{conn: conn} do
      other_user = user_fixture()
      challenge = challenge_fixture(other_user)
      conn = get(conn, ~p"/challenges/#{challenge.slug}/compare")
      assert redirected_to(conn) == "/"
      assert Phoenix.Flash.get(conn.assigns.flash, :error) =~ "do not have access"
    end
  end

  describe "GET /challenges/:slug/compare (unauthenticated)" do
    test "redirects to login", %{conn: conn} do
      conn = get(conn, ~p"/challenges/abc/compare")
      assert redirected_to(conn) =~ "/users/log-in"
    end
  end

  describe "GET /challenges/:slug/responses/:token (deep dive)" do
    setup :register_and_log_in_user

    test "renders the deep dive page for creator", %{conn: conn, user: user} do
      challenge = challenge_fixture(user)
      share = share_fixture(%{challenge_id: challenge.id, title: "My Rate Limiter", dev_take: "Used token bucket."})

      conn = get(conn, ~p"/challenges/#{challenge.slug}/responses/#{share.token}")
      html = html_response(conn, 200)
      assert html =~ "My Rate Limiter"
      assert html =~ challenge.title
      assert html =~ "Developer Take"
    end

    test "renders expanded content with skills and Q&A", %{conn: conn, user: user} do
      challenge = challenge_fixture(user)

      share =
        share_fixture(%{
          challenge_id: challenge.id,
          title: "Deep Dive Test",
          dev_take: "My approach was thorough.",
          skills: ["Elixir", "Testing"],
          qa_pairs: [%{"question" => "Why?", "answer" => "Because."}]
        })

      conn = get(conn, ~p"/challenges/#{challenge.slug}/responses/#{share.token}")
      html = html_response(conn, 200)
      assert html =~ "Deep Dive Test"
      assert html =~ "Applied Skills"
      assert html =~ "Elixir"
      assert html =~ "Session Questions"
      assert html =~ "Because."
    end

    test "redirects non-creator", %{conn: conn} do
      other_user = user_fixture()
      challenge = challenge_fixture(other_user)
      share = share_fixture(%{challenge_id: challenge.id})

      conn = get(conn, ~p"/challenges/#{challenge.slug}/responses/#{share.token}")
      assert redirected_to(conn) == "/"
    end
  end
end
