defmodule HeyiAmWeb.E2ERoundtripTest do
  @moduledoc """
  End-to-end round-trip tests: publish via API → view via browser routes.
  Verifies real data flows from POST /api/sessions through to rendered HTML.
  """
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures

  describe "publish → view session" do
    test "POST /api/sessions then GET /s/:token renders published content", %{conn: conn} do
      # Publish a session via the API (authenticated)
      {auth_conn, _user} = api_conn_with_auth()

      publish_conn =
        auth_conn
        |> post(~p"/api/sessions", %{
          session: %{
            title: "E2E: Wiring real database queries",
            dev_take: "Mock data was hiding broken render paths.",
            duration_minutes: 32,
            turns: 45,
            files_changed: 8,
            loc_changed: 1200,
            recorded_at: "2026-03-20T10:00:00Z",
            template: "editorial",
            language: "Elixir",
            skills: ["Elixir", "Phoenix", "Ecto"],
            beats: [
              %{label: "Read controllers", description: "Found all mock attributes"},
              %{label: "Replace with queries", description: "Wired real DB calls"}
            ],
            qa_pairs: [
              %{question: "Why were pages blank?", answer: "Controllers used hardcoded mock data."}
            ],
            highlights: [
              %{type: "insight", title: "Mock data hid bugs", description: "Pages rendered but showed fake content."}
            ],
            transcript_excerpt: [
              %{role: "dev", text: "The pages render but the data is fake."},
              %{role: "ai", text: "Let me trace the data flow."}
            ],
            narrative: "This session replaced mock data with real database queries.",
            project_name: "heyi.am"
          }
        })

      resp = json_response(publish_conn, 201)
      token = resp["token"]
      assert is_binary(token)

      # View the session via browser route
      view_conn = get(conn, "/s/#{token}")
      html = html_response(view_conn, 200)

      # Verify real content appears in rendered HTML
      assert html =~ "E2E: Wiring real database queries"
      assert html =~ "Mock data was hiding broken render paths."
      assert html =~ "32m"
      assert html =~ "1.2k"
      assert html =~ "Elixir"
      assert html =~ "Phoenix"
      assert html =~ "Read controllers"
      assert html =~ "Why were pages blank?"
      assert html =~ "Mock data hid bugs"
      assert html =~ "The pages render but the data is fake."

      # Verify transcript route
      transcript_conn = get(conn, "/s/#{token}/transcript")
      transcript_html = html_response(transcript_conn, 200)
      assert transcript_html =~ "E2E: Wiring real database queries"
      assert transcript_html =~ "The pages render but the data is fake."

      # Verify verification route
      verify_conn = get(conn, "/s/#{token}/verify")
      verify_html = html_response(verify_conn, 200)
      assert verify_html =~ "Session Verification"
      assert verify_html =~ "E2E: Wiring real database queries"
    end
  end

  describe "publish with user → portfolio" do
    test "session published with user_id appears on portfolio page", %{conn: conn} do
      # Create a user
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "e2e-dev"})
      {:ok, _} = HeyiAm.Accounts.update_user_profile(user, %{display_name: "E2E Developer"})

      # Publish a session with user_id (simulating authenticated publish)
      {:ok, share} =
        HeyiAm.Shares.create_share(%{
          token: HeyiAm.Shares.generate_token(),
          title: "E2E portfolio integration",
          dev_take: "Verifying portfolio shows real sessions.",
          duration_minutes: 20,
          turns: 30,
          files_changed: 5,
          loc_changed: 500,
          recorded_at: ~U[2026-03-20 12:00:00Z],
          project_name: "test-project",
          skills: ["Testing"],
          user_id: user.id
        })

      # View portfolio
      portfolio_conn = get(conn, "/e2e-dev")
      portfolio_html = html_response(portfolio_conn, 200)

      assert portfolio_html =~ "E2E Developer"
      assert portfolio_html =~ "test-project"
      assert portfolio_html =~ "/e2e-dev/test-project"

      # View project page
      project_conn = get(conn, "/e2e-dev/test-project")
      project_html = html_response(project_conn, 200)

      assert project_html =~ "E2E portfolio integration"
      assert project_html =~ "/s/#{share.token}"
    end
  end
end
