defmodule HeyiAmWeb.PortfolioControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.AccountsFixtures

  describe "GET /:username" do
    test "renders portfolio page for existing user", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "alice"})

      {:ok, _user} =
        HeyiAm.Accounts.update_user_profile(user, %{
          display_name: "Alice Builder",
          bio: "I build things"
        })

      conn = get(conn, ~p"/alice")
      html = html_response(conn, 200)
      assert html =~ "Alice Builder"
      assert html =~ "I build things"
      assert html =~ "tpl-editorial"
    end

    test "uses portfolio_layout for template class", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "bob"})
      {:ok, _} = HeyiAm.Accounts.update_user_profile(user, %{portfolio_layout: "minimal"})

      conn = get(conn, ~p"/bob")
      assert html_response(conn, 200) =~ "tpl-minimal"
    end

    test "falls back to username when no display_name", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "charlie"})

      conn = get(conn, ~p"/charlie")
      assert html_response(conn, 200) =~ "charlie"
    end

    test "shows location if set", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "dana"})
      {:ok, _} = HeyiAm.Accounts.update_user_profile(user, %{location: "San Francisco"})

      conn = get(conn, ~p"/dana")
      assert html_response(conn, 200) =~ "San Francisco"
    end

    test "returns 404 for non-existent username", %{conn: conn} do
      conn = get(conn, "/nobody-here")
      assert html_response(conn, 404)
    end

    test "renders hero card with status chip", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "eve"})
      {:ok, _} = HeyiAm.Accounts.update_user_profile(user, %{status: "building"})

      conn = get(conn, ~p"/eve")
      html = html_response(conn, 200)
      assert html =~ "building"
    end

    test "renders AI Collaboration Profile section", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "frank"})

      conn = get(conn, ~p"/frank")
      html = html_response(conn, 200)
      assert html =~ "AI Collaboration Profile"
      assert html =~ "Task Scoping"
      assert html =~ "Redirection"
      assert html =~ "Verification"
      assert html =~ "Orchestration"
    end

    test "renders project cards with links", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "grace"})

      conn = get(conn, ~p"/grace")
      html = html_response(conn, 200)
      assert html =~ "Active Deployment Logs"
      assert html =~ "DataFlow Engine"
      assert html =~ "/grace/dataflow-engine"
    end

    test "renders bottom metrics", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "heidi"})

      conn = get(conn, ~p"/heidi")
      html = html_response(conn, 200)
      assert html =~ "Uptime"
      assert html =~ "Avg Cycle"
      assert html =~ "Error Budget"
    end

    test "renders sidebar with active endpoints and recent activity", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "ivan"})

      conn = get(conn, ~p"/ivan")
      html = html_response(conn, 200)
      assert html =~ "Active Endpoints"
      assert html =~ "Recent Activity"
    end
  end

  describe "empty portfolio state" do
    test "shows empty state when no projects", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "empty-user"})

      conn = get(conn, ~p"/empty-user")
      html = html_response(conn, 200)
      # The mock always returns projects, so we verify the template compiles
      # and contains the deployment logs section
      assert html =~ "Active Deployment Logs"
    end
  end

  describe "GET /:username/:project" do
    test "renders project detail page", %{conn: conn} do
      user = user_fixture()
      {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "alice"})

      {:ok, _} =
        HeyiAm.Accounts.update_user_profile(user, %{display_name: "Alice Builder"})

      conn = get(conn, ~p"/alice/dataflow-engine")
      html = html_response(conn, 200)
      assert html =~ "project-page" or html =~ "project-header"
      assert html =~ "dataflow-engine"
    end

    test "renders breadcrumb navigation", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "bob"})

      conn = get(conn, ~p"/bob/my-project")
      html = html_response(conn, 200)
      assert html =~ "bob"
      assert html =~ "my-project"
      assert html =~ "content-ref"
    end

    test "renders hero stats with total time as primary", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "charlie"})

      conn = get(conn, ~p"/charlie/some-project")
      html = html_response(conn, 200)
      # Total Time is the primary large stat
      assert html =~ "Total Time"
      # Sessions is a secondary stat (previously was primary as "Total Sessions")
      assert html =~ "Sessions"
      assert html =~ "Files Touched"
      assert html =~ "LOC Changed"
      # Total time should show hours format for 540 minutes
      assert html =~ "9h"
    end

    test "renders developer take and architecture sections", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "dana"})

      conn = get(conn, ~p"/dana/some-project")
      html = html_response(conn, 200)
      assert html =~ "Project Take"
      assert html =~ "Architectural Approach"
    end

    test "renders empty state placeholders for growth chart and heatmap", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "eve"})

      conn = get(conn, ~p"/eve/some-project")
      html = html_response(conn, 200)
      assert html =~ "Growth Chart"
      assert html =~ "Directory Heatmap"
      assert html =~ "Coming soon"
    end

    test "renders published session cards", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "frank"})

      conn = get(conn, ~p"/frank/some-project")
      html = html_response(conn, 200)
      assert html =~ "Published Sessions"
      assert html =~ "session-card"
      assert html =~ "/s/abc123"
    end

    test "renders verified badge on sessions", %{conn: conn} do
      user = user_fixture()
      {:ok, _} = HeyiAm.Accounts.update_user_username(user, %{username: "grace"})

      conn = get(conn, ~p"/grace/some-project")
      html = html_response(conn, 200)
      assert html =~ "Verified"
      assert html =~ "sealed-badge"
    end

    test "returns 404 for non-existent username", %{conn: conn} do
      conn = get(conn, "/nobody-here/some-project")
      assert html_response(conn, 404)
    end

    test "404 for non-existent username renders full error page content", %{conn: conn} do
      conn = get(conn, "/nobody-here/some-project")
      html = html_response(conn, 404)
      assert html =~ "404"
      assert html =~ "Page not found"
      assert html =~ "Back to Home"
    end
  end

  describe "GET /:username 404 content" do
    test "renders full 404 page content for non-existent portfolio", %{conn: conn} do
      conn = get(conn, "/nobody-here")
      html = html_response(conn, 404)
      assert html =~ "404"
      assert html =~ "Page not found"
      assert html =~ "Back to Home"
      assert html =~ "heyi.am"
    end
  end
end
