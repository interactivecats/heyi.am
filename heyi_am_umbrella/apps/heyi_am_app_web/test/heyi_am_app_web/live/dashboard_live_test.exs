defmodule HeyiAmAppWeb.DashboardLiveTest do
  use HeyiAmAppWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  import HeyiAm.AccountsFixtures
  import HeyiAm.SharesFixtures

  alias HeyiAm.Projects
  alias HeyiAm.Shares

  defp make_user do
    user = user_fixture()
    {:ok, user} = HeyiAm.Accounts.update_user_username(user, %{username: "dash-#{System.unique_integer([:positive])}"})
    user
  end

  describe "mount" do
    test "renders dashboard for logged-in user", %{conn: conn} do
      user = make_user()

      {:ok, _lv, html} =
        conn
        |> log_in_user(user)
        |> live(~p"/dashboard")

      assert html =~ "Dashboard"
    end

    test "redirects if not logged in", %{conn: conn} do
      assert {:error, redirect} = live(conn, ~p"/dashboard")
      assert {:redirect, %{to: path}} = redirect
      assert path == ~p"/users/log-in"
    end

    test "shows projects and sessions", %{conn: conn} do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "dash-proj", title: "Dash Project", user_id: user.id})
      share_fixture(%{user_id: user.id, project_id: project.id, title: "My Test Session", status: "listed"})

      {:ok, _lv, html} =
        conn
        |> log_in_user(user)
        |> live(~p"/dashboard")

      assert html =~ "Dash Project"
      assert html =~ "Sessions"
    end

    test "shows unassigned sessions", %{conn: conn} do
      user = make_user()
      share_fixture(%{user_id: user.id, title: "Orphan Session"})

      {:ok, _lv, html} =
        conn
        |> log_in_user(user)
        |> live(~p"/dashboard")

      assert html =~ "Unassigned Sessions"
      assert html =~ "Orphan Session"
    end

    test "shows empty state when no data", %{conn: conn} do
      user = make_user()

      {:ok, _lv, html} =
        conn
        |> log_in_user(user)
        |> live(~p"/dashboard")

      assert html =~ "npx heyiam"
    end
  end

  describe "update_project_status" do
    test "changes all sessions in a project to the new status", %{conn: conn} do
      user = make_user()
      {:ok, project} = Projects.create_project(%{slug: "vis-proj", title: "Visibility Project", user_id: user.id})
      share1 = share_fixture(%{user_id: user.id, project_id: project.id, status: "draft", title: "Session A"})
      share2 = share_fixture(%{user_id: user.id, project_id: project.id, status: "draft", title: "Session B"})

      {:ok, lv, _html} =
        conn
        |> log_in_user(user)
        |> live(~p"/dashboard")

      render_hook(lv, "update_project_status", %{
        "project-id" => to_string(project.id),
        "status" => "listed"
      })

      assert Shares.get_share_by_token!(share1.token).status == "listed"
      assert Shares.get_share_by_token!(share2.token).status == "listed"
    end

    test "cannot update another user's project", %{conn: conn} do
      user1 = make_user()
      user2 = make_user()
      {:ok, project} = Projects.create_project(%{slug: "other-proj", title: "Other", user_id: user1.id})
      share = share_fixture(%{user_id: user1.id, project_id: project.id, status: "draft"})

      {:ok, lv, _html} =
        conn
        |> log_in_user(user2)
        |> live(~p"/dashboard")

      assert render_hook(lv, "update_project_status", %{
               "project-id" => to_string(project.id),
               "status" => "listed"
             }) =~ "Project not found"

      assert Shares.get_share_by_token!(share.token).status == "draft"
    end
  end
end
