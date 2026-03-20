defmodule HeyiAmWeb.E2ETest do
  @moduledoc """
  End-to-end integration tests that exercise the full user flows
  through real database, controllers, and LiveView.
  """

  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  alias HeyiAm.Accounts
  alias HeyiAm.AccountsFixtures
  alias HeyiAm.Portfolios
  alias HeyiAm.Projects
  alias HeyiAm.Repo
  alias HeyiAm.Shares
  alias HeyiAm.Shares.Share

  # -- Helpers ----------------------------------------------------------------

  defp create_user_with_username(username_prefix) do
    user = AccountsFixtures.user_fixture()
    username = "#{username_prefix}#{System.unique_integer([:positive])}"

    {:ok, user} =
      user
      |> Ecto.Changeset.change(username: username, display_name: "Test Dev")
      |> Repo.update()

    user
  end

  # Generate an Ed25519 keypair, returning {machine_token, signing_fun}.
  # The machine_token follows the hai_<base64url(pubkey)> format.
  # The signing_fun accepts a binary body and returns a base64url signature.
  defp generate_machine_credentials do
    {pub, priv} = :crypto.generate_key(:eddsa, :ed25519)
    machine_token = "hai_" <> Base.url_encode64(pub, padding: false)

    sign_fn = fn body ->
      sig = :public_key.sign(body, :none, {:ed_pri, :ed25519, pub, priv})
      Base.url_encode64(sig, padding: false)
    end

    {machine_token, sign_fn}
  end

  defp publish_share_with_signature(conn, machine_token, sign_fn, params) do
    body = Jason.encode!(params)
    signature = sign_fn.(body)

    conn
    |> put_req_header("content-type", "application/json")
    |> put_req_header("x-machine-token", machine_token)
    |> put_req_header("x-signature", signature)
    |> post(~p"/api/share", body)
  end

  # -- Flow 1: Device auth -> publish -> portfolio ----------------------------

  describe "Flow 1: device auth -> publish -> portfolio" do
    test "full device authorization through publish and portfolio visibility", %{conn: conn} do
      # Step 1: Create a user with username
      user = create_user_with_username("flow1")
      {machine_token, sign_fn} = generate_machine_credentials()

      # Step 2: POST /api/device/authorize -> get device_code + user_code
      conn_auth = post(conn, ~p"/api/device/authorize")
      auth_resp = json_response(conn_auth, 200)
      assert is_binary(auth_resp["device_code"])
      assert is_binary(auth_resp["user_code"])

      # Step 3: Simulate authorization (call context function directly)
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, authorized_da} = Accounts.authorize_device(da, user)
      assert authorized_da.status == "authorized"

      # Step 4: POST /api/device/token -> get API token
      conn_token = post(build_conn(), ~p"/api/device/token", %{device_code: da.device_code})
      token_resp = json_response(conn_token, 200)
      assert token_resp["status"] == "authorized"
      api_token = token_resp["token"]
      assert is_binary(api_token)

      # Verify the token resolves to the correct user
      found_user = Accounts.get_user_by_api_token(api_token)
      assert found_user.id == user.id

      # Step 5: Publish an anonymous share first, then link machine_token to user.
      # The system resolves user_id from machine_token via existing linked shares,
      # so we publish anonymously, link the token, then publish again.
      anon_share_params = %{
        "title" => "Spike the auth flow",
        "project_name" => "heyi-am",
        "skills" => ["Elixir"],
        "session_id" => "anon-#{System.unique_integer([:positive])}"
      }

      anon_conn = publish_share_with_signature(build_conn(), machine_token, sign_fn, anon_share_params)
      anon_resp = json_response(anon_conn, 201)
      assert anon_resp["linked"] == false

      # Link machine_token to user (this is what happens after device auth completes)
      {:ok, linked_count} = Accounts.link_machine_token(user, machine_token)
      assert linked_count == 1

      # Verify the seed share now has user_id set in the DB
      anon_share = Shares.get_by_token(anon_resp["token"])
      assert anon_share.user_id == user.id,
        "link_machine_token should have set user_id on the seed share"

      # Now publish a second share -- maybe_resolve_user should find the user
      # from the seed share that was linked above.
      share_params = %{
        "title" => "Build the auth flow",
        "project_name" => "heyi-am",
        "skills" => ["Elixir", "Phoenix"],
        "developer_take" => "OAuth is always tricky",
        "duration_minutes" => 45,
        "turn_count" => 32,
        "session_month" => "Mar 2026",
        "session_id" => "sess-#{System.unique_integer([:positive])}"
      }

      share_conn = publish_share_with_signature(build_conn(), machine_token, sign_fn, share_params)
      share_resp = json_response(share_conn, 201)

      assert share_resp["status"] == "created"
      assert is_binary(share_resp["token"])
      assert is_binary(share_resp["delete_token"])

      # Step 6: Verify share has user_id set.
      # Check the DB directly to see if maybe_resolve_user worked.
      share = Shares.get_by_token(share_resp["token"])

      # Verify user_id was resolved during upsert via maybe_resolve_user
      assert share.user_id == user.id,
        "maybe_resolve_user should find the linked seed share; " <>
        "response linked=#{share_resp["linked"]}, DB user_id=#{inspect(share.user_id)}"

      # Step 7: Verify share has project_id set (project auto-created)
      assert share.project_id != nil
      project = Repo.get(Projects.Project, share.project_id)
      assert project.project_key == "heyi-am"
      assert project.user_id == user.id

      # Step 8: Verify portfolio entry auto-created
      entries = Portfolios.list_all_entries(user.id)
      assert Enum.any?(entries, &(&1.share_id == share.id))

      # Step 9: GET /:username -> verify portfolio page shows the project
      portfolio_conn = get(build_conn(), "/#{user.username}")
      portfolio_body = html_response(portfolio_conn, 200)
      assert portfolio_body =~ user.username

      # Step 10: GET /:username/:project_key -> verify project page shows the session
      project_conn = get(build_conn(), "/#{user.username}/heyi-am")
      project_body = html_response(project_conn, 200)
      assert project_body =~ "Build the auth flow"
      assert project_body =~ "OAuth is always tricky"

      # Step 11: GET /s/:token -> verify session page renders
      share_page_conn = get(build_conn(), "/s/#{share.token}")
      share_body = html_response(share_page_conn, 200)
      assert share_body =~ "Build the auth flow"
    end
  end

  # -- Flow 2: Anonymous publish -> link later --------------------------------

  describe "Flow 2: anonymous publish -> link later" do
    test "anonymous share gets linked to user after machine_token binding", %{conn: _conn} do
      {machine_token, sign_fn} = generate_machine_credentials()

      # Step 1: Publish a share with machine_token but no linked user
      share_params = %{
        "title" => "Prototype the CLI",
        "project_name" => "my-cli",
        "skills" => ["Rust"],
        "developer_take" => "CLI ergonomics matter",
        "duration_minutes" => 60,
        "turn_count" => 20,
        "session_id" => "anon-sess-#{System.unique_integer([:positive])}"
      }

      share_conn = publish_share_with_signature(build_conn(), machine_token, sign_fn, share_params)
      share_resp = json_response(share_conn, 201)

      # Step 2: Verify share created with user_id = nil
      share = Shares.get_by_token(share_resp["token"])
      assert share.user_id == nil

      # Step 3: Verify response includes linked: false
      assert share_resp["linked"] == false
      assert is_binary(share_resp["link_url"])

      # Step 4: Create a user
      user = create_user_with_username("anon")

      # Step 5: Call link_machine_token(user, machine_token)
      {:ok, count} = Accounts.link_machine_token(user, machine_token)
      assert count == 1

      # Step 6: Verify share now has user_id
      share = Shares.get_by_token(share_resp["token"])
      assert share.user_id == user.id

      # Step 7: Verify portfolio entry auto-created
      entries = Portfolios.list_all_entries(user.id)
      assert Enum.any?(entries, &(&1.share_id == share.id))

      # Step 8: Verify project auto-created and linked
      share = Repo.preload(share, :project, force: true)
      assert share.project_id != nil
      project = Repo.get(Projects.Project, share.project_id)
      assert project.user_id == user.id
      assert project.project_key == "my-cli"
    end
  end

  # -- Flow 3: Republish (update existing) ------------------------------------

  describe "Flow 3: republish (update existing)" do
    test "republishing with same machine_token + session_id updates instead of creating", %{conn: _conn} do
      user = create_user_with_username("repub")
      {machine_token, sign_fn} = generate_machine_credentials()

      session_id = "repub-sess-#{System.unique_integer([:positive])}"

      # First publish an anonymous seed share to establish the machine_token,
      # then link it to the user. This mirrors the real CLI onboarding flow.
      seed_params = %{
        "title" => "Seed share",
        "session_id" => "seed-#{System.unique_integer([:positive])}"
      }

      seed_conn = publish_share_with_signature(build_conn(), machine_token, sign_fn, seed_params)
      assert json_response(seed_conn, 201)["linked"] == false

      # Link machine_token to user -- sets user_id on the seed share
      {:ok, 1} = Accounts.link_machine_token(user, machine_token)

      # Step 1: Publish the real share -- maybe_resolve_user finds user via seed share
      original_params = %{
        "title" => "Original title",
        "project_name" => "my-app",
        "skills" => ["Elixir"],
        "developer_take" => "First pass at the feature",
        "duration_minutes" => 30,
        "turn_count" => 15,
        "session_id" => session_id
      }

      conn1 = publish_share_with_signature(build_conn(), machine_token, sign_fn, original_params)
      resp1 = json_response(conn1, 201)
      assert resp1["status"] == "created"
      assert resp1["linked"] == true
      original_token = resp1["token"]

      # Verify portfolio entry was auto-created
      share = Shares.get_by_token(original_token)
      entries_before = Portfolios.list_all_entries(user.id)
      assert Enum.any?(entries_before, &(&1.share_id == share.id))

      # Step 2: Publish again with same machine_token + session_id but different title
      updated_params = %{
        "title" => "Updated title",
        "project_name" => "my-app",
        "skills" => ["Elixir", "Phoenix"],
        "developer_take" => "Refined the approach",
        "duration_minutes" => 45,
        "turn_count" => 25,
        "session_id" => session_id
      }

      conn2 = publish_share_with_signature(build_conn(), machine_token, sign_fn, updated_params)
      resp2 = json_response(conn2, 200)
      assert resp2["status"] == "updated"

      # Step 3: Verify share is updated (not duplicated) - same token
      assert resp2["token"] == original_token

      # Step 4: Verify still one portfolio entry for this share
      entries_after = Portfolios.list_all_entries(user.id)
      share_entries = Enum.filter(entries_after, &(&1.share_id == share.id))
      assert length(share_entries) == 1

      # Step 5: Verify new title appears on public page
      share_page_conn = get(build_conn(), "/s/#{original_token}")
      body = html_response(share_page_conn, 200)
      assert body =~ "Updated title"
      refute body =~ "Original title"
    end
  end

  # -- Flow 4: Portfolio editor -----------------------------------------------

  describe "Flow 4: portfolio editor" do
    setup %{conn: conn} do
      user = create_user_with_username("editor")

      # Create two projects with shares
      {:ok, project1} =
        Projects.find_or_create_project(user.id, "proj-alpha", %{
          display_name: "Project Alpha",
          visible: true
        })

      {:ok, project1} =
        Projects.update_project(project1, %{
          display_name: "Project Alpha",
          visible: true,
          stats_cache: %{
            "skills" => ["Elixir"],
            "share_count" => 1,
            "total_duration_minutes" => 30
          }
        })

      {:ok, project2} =
        Projects.find_or_create_project(user.id, "proj-beta", %{
          display_name: "Project Beta",
          visible: true
        })

      {:ok, project2} =
        Projects.update_project(project2, %{
          display_name: "Project Beta",
          visible: true,
          stats_cache: %{
            "skills" => ["React"],
            "share_count" => 1,
            "total_duration_minutes" => 20
          }
        })

      {:ok, share1} =
        %Share{user_id: user.id, project_id: project1.id}
        |> Share.changeset(%{
          token: "e2e-tok-#{System.unique_integer([:positive])}",
          delete_token: "e2e-del-#{System.unique_integer([:positive])}",
          title: "Alpha session",
          duration_minutes: 30,
          session_month: "Mar 2026"
        })
        |> Repo.insert()

      {:ok, share2} =
        %Share{user_id: user.id, project_id: project2.id}
        |> Share.changeset(%{
          token: "e2e-tok-#{System.unique_integer([:positive])}",
          delete_token: "e2e-del-#{System.unique_integer([:positive])}",
          title: "Beta session",
          duration_minutes: 20,
          session_month: "Mar 2026"
        })
        |> Repo.insert()

      conn = log_in_user(conn, user)

      %{
        conn: conn,
        user: user,
        project1: project1,
        project2: project2,
        share1: share1,
        share2: share2
      }
    end

    test "editor shows both projects", %{conn: conn, user: user} do
      {:ok, view, html} = live(conn, "/#{user.username}/edit")

      assert html =~ "Project Alpha"
      assert html =~ "Project Beta"
      assert has_element?(view, ".pe-project-card")
    end

    test "toggling project visibility hides project from public page", %{
      conn: conn,
      user: user,
      project1: project1
    } do
      {:ok, view, _html} = live(conn, "/#{user.username}/edit")

      # Toggle project1 visibility off
      view
      |> element("[phx-click='toggle_project_visible'][phx-value-id='#{project1.id}']")
      |> render_click()

      updated_project = Repo.get(Projects.Project, project1.id)
      refute updated_project.visible

      # Verify hidden project doesn't appear on public page
      public_conn = get(build_conn(), "/#{user.username}/proj-alpha")
      assert html_response(public_conn, 404)

      # But project2 is still visible
      public_conn2 = get(build_conn(), "/#{user.username}/proj-beta")
      assert html_response(public_conn2, 200) =~ "Project Beta"
    end

    test "toggling session in/out of portfolio affects public page", %{
      conn: conn,
      user: user,
      project1: project1,
      share1: share1
    } do
      {:ok, view, _html} = live(conn, "/#{user.username}/edit")

      # Expand project1 to see sessions
      view
      |> element("[phx-click='toggle_expand'][phx-value-id='#{project1.id}']")
      |> render_click()

      # Toggle share1 into portfolio
      view
      |> element("[phx-click='toggle_in_portfolio'][phx-value-share-id='#{share1.id}']")
      |> render_click()

      entries = Portfolios.list_all_entries(user.id)
      in_portfolio = Enum.any?(entries, &(&1.share_id == share1.id))
      assert in_portfolio

      # Toggle it back out
      view
      |> element("[phx-click='toggle_in_portfolio'][phx-value-share-id='#{share1.id}']")
      |> render_click()

      entries_after = Portfolios.list_all_entries(user.id)
      still_in = Enum.any?(entries_after, &(&1.share_id == share1.id))
      refute still_in
    end

    test "switching template persists the layout choice", %{conn: conn, user: user} do
      {:ok, view, _html} = live(conn, "/#{user.username}/edit")

      view
      |> element("[phx-click='select_template'][phx-value-template='minimal']")
      |> render_click()

      updated_user = Accounts.get_user!(user.id)
      assert updated_user.portfolio_layout == "minimal"

      # Switch to another template
      view
      |> element("[phx-click='select_template'][phx-value-template='terminal']")
      |> render_click()

      updated_user = Accounts.get_user!(user.id)
      assert updated_user.portfolio_layout == "terminal"
    end
  end

  # -- Flow 5: Project page visibility ----------------------------------------

  describe "Flow 5: project page visibility" do
    test "hidden project returns 404, visible project returns 200", %{conn: _conn} do
      user = create_user_with_username("vis")

      # Step 1: Create a project with visible: false
      {:ok, project} =
        Projects.find_or_create_project(user.id, "secret-proj", %{
          display_name: "Secret Project",
          visible: true
        })

      {:ok, _project} =
        Projects.update_project(project, %{visible: false})

      # Step 2: GET /:username/:project_key -> verify 404
      hidden_conn = get(build_conn(), "/#{user.username}/secret-proj")
      assert html_response(hidden_conn, 404)

      # Step 3: Set project visible: true
      project = Repo.get(Projects.Project, project.id)
      {:ok, _project} = Projects.update_project(project, %{visible: true})

      # Step 4: GET /:username/:project_key -> verify 200
      visible_conn = get(build_conn(), "/#{user.username}/secret-proj")
      assert html_response(visible_conn, 200) =~ "Secret Project"
    end
  end

  # -- Flow 6: Delete with token ----------------------------------------------

  describe "Flow 6: delete with token" do
    test "published share can be deleted with delete_token", %{conn: _conn} do
      {machine_token, sign_fn} = generate_machine_credentials()

      # Step 1: Publish a share, get delete_token
      share_params = %{
        "title" => "Ephemeral session",
        "skills" => ["Go"],
        "session_id" => "del-sess-#{System.unique_integer([:positive])}"
      }

      share_conn = publish_share_with_signature(build_conn(), machine_token, sign_fn, share_params)
      share_resp = json_response(share_conn, 201)
      share_token = share_resp["token"]
      delete_token = share_resp["delete_token"]

      # Verify share exists at /s/:token
      show_conn = get(build_conn(), "/s/#{share_token}")
      assert html_response(show_conn, 200) =~ "Ephemeral session"

      # Step 2: DELETE /api/share/:token with correct delete_token
      delete_conn =
        build_conn()
        |> put_req_header("x-delete-token", delete_token)
        |> delete(~p"/api/share/#{share_token}")

      assert json_response(delete_conn, 200)["deleted"] == true

      # Step 3: Verify share no longer accessible at /s/:token
      gone_conn = get(build_conn(), "/s/#{share_token}")
      assert html_response(gone_conn, 404)
    end

    test "delete with wrong token returns 403", %{conn: _conn} do
      {machine_token, sign_fn} = generate_machine_credentials()

      share_params = %{
        "title" => "Protected session",
        "session_id" => "prot-sess-#{System.unique_integer([:positive])}"
      }

      share_conn = publish_share_with_signature(build_conn(), machine_token, sign_fn, share_params)
      share_resp = json_response(share_conn, 201)
      share_token = share_resp["token"]

      # Attempt delete with wrong token
      bad_delete_conn =
        build_conn()
        |> put_req_header("x-delete-token", "wrong-token")
        |> delete(~p"/api/share/#{share_token}")

      assert json_response(bad_delete_conn, 403)["error"] == "Invalid delete token"

      # Share should still be accessible
      still_there_conn = get(build_conn(), "/s/#{share_token}")
      assert html_response(still_there_conn, 200) =~ "Protected session"
    end

    test "delete without token returns 401", %{conn: _conn} do
      {machine_token, sign_fn} = generate_machine_credentials()

      share_params = %{
        "title" => "No-token session",
        "session_id" => "notoken-sess-#{System.unique_integer([:positive])}"
      }

      share_conn = publish_share_with_signature(build_conn(), machine_token, sign_fn, share_params)
      share_resp = json_response(share_conn, 201)

      no_token_conn = delete(build_conn(), ~p"/api/share/#{share_resp["token"]}")
      assert json_response(no_token_conn, 401)["error"] == "Delete token required"
    end
  end
end
