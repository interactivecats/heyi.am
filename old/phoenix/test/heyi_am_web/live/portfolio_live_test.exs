defmodule HeyiAmWeb.PortfolioLiveTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  alias HeyiAm.AccountsFixtures
  alias HeyiAm.Accounts
  alias HeyiAm.Projects
  alias HeyiAm.Repo
  alias HeyiAm.Shares.Share

  defp create_user_with_username(_context \\ %{}) do
    user = AccountsFixtures.user_fixture()
    username = "editor#{System.unique_integer([:positive])}"

    {:ok, user} =
      user
      |> Ecto.Changeset.change(username: username, display_name: "Test User", bio: "A test bio")
      |> Repo.update()

    %{user: user}
  end

  defp create_project_with_shares(%{user: user}) do
    {:ok, project} =
      Projects.find_or_create_project(user.id, "test-project", %{
        display_name: "Test Project",
        visible: true
      })

    {:ok, project} =
      Projects.update_project(project, %{
        display_name: "Test Project",
        visible: true,
        stats_cache: %{
          "skills" => ["Elixir", "React"],
          "share_count" => 2,
          "total_duration_minutes" => 60
        }
      })

    {:ok, share1} =
      %Share{user_id: user.id, project_id: project.id}
      |> Share.changeset(%{
        token: "tok-#{System.unique_integer([:positive])}",
        delete_token: "del-#{System.unique_integer([:positive])}",
        title: "Build the editor",
        duration_minutes: 30,
        session_month: "Mar 2026"
      })
      |> Repo.insert()

    {:ok, share2} =
      %Share{user_id: user.id, project_id: project.id}
      |> Share.changeset(%{
        token: "tok-#{System.unique_integer([:positive])}",
        delete_token: "del-#{System.unique_integer([:positive])}",
        title: "Fix session bugs",
        duration_minutes: 30,
        session_month: "Mar 2026"
      })
      |> Repo.insert()

    %{project: project, share1: share1, share2: share2}
  end

  describe "mount" do
    test "redirects when not authorized", %{conn: conn} do
      %{user: user} = create_user_with_username()
      assert {:error, {:redirect, _}} = live(conn, "/#{user.username}/edit")
    end

    test "renders editor for authorized user", %{conn: conn} do
      %{user: user} = create_user_with_username()
      conn = log_in_user(conn, user)

      {:ok, view, html} = live(conn, "/#{user.username}/edit")

      assert html =~ "Editing your portfolio"
      assert html =~ user.username
      assert html =~ "View as visitor"
      assert has_element?(view, ".pe-topbar")
    end
  end

  describe "template picker" do
    setup %{conn: conn} do
      %{user: user} = create_user_with_username()
      conn = log_in_user(conn, user)
      {:ok, view, _html} = live(conn, "/#{user.username}/edit")
      %{view: view, user: user}
    end

    test "renders template buttons in dock", %{view: view} do
      assert has_element?(view, ".pe-dock")
      assert has_element?(view, ".pe-dock__tpl-btn")
    end

    test "selecting a template updates the user record", %{view: view, user: user} do
      view
      |> element("[phx-click='select_template'][phx-value-template='minimal']")
      |> render_click()

      updated_user = Accounts.get_user!(user.id)
      assert updated_user.portfolio_layout == "minimal"
    end

    test "selecting terminal template works", %{view: view, user: user} do
      view
      |> element("[phx-click='select_template'][phx-value-template='terminal']")
      |> render_click()

      updated_user = Accounts.get_user!(user.id)
      assert updated_user.portfolio_layout == "terminal"
    end
  end

  describe "accent color" do
    setup %{conn: conn} do
      %{user: user} = create_user_with_username()
      conn = log_in_user(conn, user)
      {:ok, view, _html} = live(conn, "/#{user.username}/edit")
      %{view: view, user: user}
    end

    test "renders color dots in dock", %{view: view} do
      assert has_element?(view, ".pe-dock__accents")
      assert has_element?(view, ".pe-color-dot")
    end

    test "clicking accent color updates it", %{view: view, user: user} do
      view
      |> element("[phx-click='set_accent'][phx-value-accent='teal']")
      |> render_click()

      updated_user = Accounts.get_user!(user.id)
      assert updated_user.portfolio_accent == "teal"
    end
  end

  describe "project cards" do
    setup %{conn: conn} do
      ctx = create_user_with_username()
      project_ctx = create_project_with_shares(ctx)
      conn = log_in_user(conn, ctx.user)
      {:ok, view, _html} = live(conn, "/#{ctx.user.username}/edit")
      Map.merge(project_ctx, %{view: view, user: ctx.user})
    end

    test "renders project cards", %{view: view} do
      assert has_element?(view, ".pe-project-card")
      assert has_element?(view, ".pe-project-name", "Test Project")
    end

    test "expand/collapse sessions", %{view: view, project: project} do
      refute has_element?(view, ".pe-sessions")

      html =
        view
        |> element("[phx-click='toggle_expand'][phx-value-id='#{project.id}']")
        |> render_click()

      assert html =~ "Build the editor"
      assert html =~ "Fix session bugs"
      assert has_element?(view, ".pe-sessions")
    end

    test "toggle project visibility", %{view: view, project: project} do
      view
      |> element("[phx-click='toggle_project_visible'][phx-value-id='#{project.id}']")
      |> render_click()

      updated_project = Repo.get(Projects.Project, project.id)
      refute updated_project.visible
    end
  end

  describe "session toggles" do
    setup %{conn: conn} do
      ctx = create_user_with_username()
      project_ctx = create_project_with_shares(ctx)
      conn = log_in_user(conn, ctx.user)
      {:ok, view, _html} = live(conn, "/#{ctx.user.username}/edit")

      # Expand the project
      view
      |> element("[phx-click='toggle_expand'][phx-value-id='#{project_ctx.project.id}']")
      |> render_click()

      Map.merge(project_ctx, %{view: view, user: ctx.user})
    end

    test "toggle session in portfolio", %{view: view, share1: share1} do
      view
      |> element("[phx-click='toggle_in_portfolio'][phx-value-share-id='#{share1.id}']")
      |> render_click()

      # Should have added it to portfolio (it starts without being in portfolio)
      entries = HeyiAm.Portfolios.list_all_entries(share1.user_id)
      assert Enum.any?(entries, &(&1.share_id == share1.id))
    end
  end

  describe "profile section" do
    setup %{conn: conn} do
      ctx = create_user_with_username()
      conn = log_in_user(conn, ctx.user)
      {:ok, view, _html} = live(conn, "/#{ctx.user.username}/edit")
      %{view: view, user: ctx.user}
    end

    test "renders inline editable profile fields", %{view: view} do
      assert has_element?(view, "[contenteditable='true']#pe-display-name")
      assert has_element?(view, "[contenteditable='true']#pe-bio")
    end

    test "renders portfolio hero with shared component", %{view: view} do
      assert has_element?(view, ".portfolio-hero")
      assert has_element?(view, ".pe-dock")
    end
  end

  describe "save_inline event" do
    setup %{conn: conn} do
      ctx = create_user_with_username()
      conn = log_in_user(conn, ctx.user)
      {:ok, view, _html} = live(conn, "/#{ctx.user.username}/edit")
      %{view: view, user: ctx.user}
    end

    test "updates display_name", %{view: view, user: user} do
      render_hook(view, "save_inline", %{"field" => "display_name", "value" => "New Name"})

      updated_user = Accounts.get_user!(user.id)
      assert updated_user.display_name == "New Name"
    end

    test "updates bio", %{view: view, user: user} do
      render_hook(view, "save_inline", %{"field" => "bio", "value" => "Updated bio text"})

      updated_user = Accounts.get_user!(user.id)
      assert updated_user.bio == "Updated bio text"
    end

    test "trims whitespace from input", %{view: view, user: user} do
      render_hook(view, "save_inline", %{
        "field" => "display_name",
        "value" => "  Trimmed Name  "
      })

      updated_user = Accounts.get_user!(user.id)
      assert updated_user.display_name == "Trimmed Name"
    end

    test "rejects invalid fields", %{view: view, user: user} do
      render_hook(view, "save_inline", %{"field" => "email", "value" => "hacked@evil.com"})

      updated_user = Accounts.get_user!(user.id)
      assert updated_user.email == user.email
    end
  end

  describe "save_inline safety" do
    setup %{conn: conn} do
      ctx = create_user_with_username()
      conn = log_in_user(conn, ctx.user)
      {:ok, view, _html} = live(conn, "/#{ctx.user.username}/edit")
      %{view: view, user: ctx.user}
    end

    test "stores input as-is, HEEx auto-escapes on render", %{view: view, user: user} do
      render_hook(view, "save_inline", %{
        "field" => "bio",
        "value" => "<div>Hello</div>"
      })

      updated_user = Accounts.get_user!(user.id)
      # Stored as-is — HEEx escapes on output
      assert updated_user.bio == "<div>Hello</div>"
    end
  end
end
