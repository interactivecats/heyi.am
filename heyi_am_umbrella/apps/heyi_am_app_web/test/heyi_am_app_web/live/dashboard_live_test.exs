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

  describe "update_status" do
    test "changes session status", %{conn: conn} do
      user = make_user()
      share = share_fixture(%{user_id: user.id, status: "draft", title: "Status Test"})

      {:ok, lv, _html} =
        conn
        |> log_in_user(user)
        |> live(~p"/dashboard")

      html =
        lv
        |> element("#share-#{share.id} form")
        |> render_change(%{"status" => "listed", "share-id" => to_string(share.id)})

      assert html =~ "Published"

      updated = Shares.get_share_by_token!(share.token)
      assert updated.status == "listed"
    end

    test "cannot update another user's session", %{conn: conn} do
      user1 = make_user()
      user2 = make_user()
      share = share_fixture(%{user_id: user1.id, status: "draft"})

      {:ok, lv, _html} =
        conn
        |> log_in_user(user2)
        |> live(~p"/dashboard")

      assert render_hook(lv, "update_status", %{"share-id" => to_string(share.id), "status" => "listed"}) =~
               "Session not found"

      unchanged = Shares.get_share_by_token!(share.token)
      assert unchanged.status == "draft"
    end
  end

  describe "delete_session" do
    test "deletes a session", %{conn: conn} do
      user = make_user()
      share = share_fixture(%{user_id: user.id, title: "To Delete"})

      {:ok, lv, _html} =
        conn
        |> log_in_user(user)
        |> live(~p"/dashboard")

      html = render_click(lv, "delete_session", %{"share-id" => to_string(share.id)})

      assert html =~ "Session deleted"
      refute Shares.get_share_by_token(share.token)
    end

    test "cannot delete another user's session", %{conn: conn} do
      user1 = make_user()
      user2 = make_user()
      share = share_fixture(%{user_id: user1.id})

      {:ok, lv, _html} =
        conn
        |> log_in_user(user2)
        |> live(~p"/dashboard")

      assert render_click(lv, "delete_session", %{"share-id" => to_string(share.id)}) =~
               "Session not found"

      assert Shares.get_share_by_token(share.token)
    end
  end
end
