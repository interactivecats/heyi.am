defmodule HeyiAmAppWeb.SecurityTest do
  @moduledoc """
  Security invariant tests for the app_web application.
  Verifies structural isolation guarantees.
  """
  use HeyiAmAppWeb.ConnCase, async: true

  describe "route isolation" do
    test "app endpoint does NOT serve /:username portfolio routes", %{conn: conn} do
      conn = get(conn, "/someuser")
      # Should be 404 — no catch-all /:username route on this app
      assert conn.status in [404, 302]
    end

    test "app endpoint does NOT serve /s/:token routes", %{conn: conn} do
      conn = get(conn, "/s/some-token")
      assert conn.status in [404, 302]
    end

    test "app endpoint DOES serve auth pages", %{conn: conn} do
      conn = get(conn, ~p"/users/log-in")
      assert conn.status == 200
    end

    test "app endpoint DOES serve API routes", %{conn: conn} do
      conn = post(conn, ~p"/api/device/code")
      assert conn.status == 200
    end
  end

  describe "no raw() calls" do
    test "no raw() calls in any app_web template" do
      app_web_path =
        Path.join([
          File.cwd!(),
          "lib",
          "heyi_am_app_web"
        ])

      if File.dir?(app_web_path) do
        heex_files =
          Path.wildcard(Path.join(app_web_path, "**/*.heex"))

        ex_files =
          Path.wildcard(Path.join(app_web_path, "**/*.ex"))

        all_files = heex_files ++ ex_files

        violations =
          Enum.filter(all_files, fn file ->
            content = File.read!(file)
            # Match raw() calls but not "raw" in comments or strings
            String.contains?(content, "raw(") and not String.contains?(content, "# raw(")
          end)

        assert violations == [],
               "Found raw() calls in app_web files: #{inspect(violations)}"
      end
    end
  end

  describe "session cookie" do
    test "auth pages have session plug active", %{conn: conn} do
      conn = get(conn, ~p"/users/log-in")
      assert conn.status == 200

      # Verify the session plug is wired up by checking we can fetch session
      assert conn.private[:plug_session] != nil,
             "Session plug must be active on app_web auth pages"
    end
  end
end
