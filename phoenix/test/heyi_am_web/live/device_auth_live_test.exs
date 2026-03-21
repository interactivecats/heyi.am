defmodule HeyiAmWeb.DeviceAuthLiveTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  setup :register_and_log_in_user

  describe "mount" do
    test "renders authorization form", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/device")
      assert html =~ "Authorize Device"
      assert html =~ "XXXX-XXXX"
    end
  end

  describe "two-step authorization" do
    test "shows confirmation step after valid code lookup", %{conn: conn} do
      {_raw, dc} = HeyiAm.Accounts.create_device_code()

      {:ok, view, _html} = live(conn, ~p"/device")

      html =
        view
        |> element("form")
        |> render_submit(%{user_code: dc.user_code})

      assert html =~ "requesting access to your account"
      assert html =~ "Authorize Device"
      assert html =~ "Cancel"
    end

    test "confirm_authorize completes authorization", %{conn: conn} do
      {_raw, dc} = HeyiAm.Accounts.create_device_code()

      {:ok, view, _html} = live(conn, ~p"/device")

      # Step 1: lookup
      view
      |> element("form")
      |> render_submit(%{user_code: dc.user_code})

      # Step 2: confirm
      html = render_click(view, "confirm_authorize")

      assert html =~ "Device Authorized"
      assert html =~ "close this tab"
    end

    test "cancel returns to code entry", %{conn: conn} do
      {_raw, dc} = HeyiAm.Accounts.create_device_code()

      {:ok, view, _html} = live(conn, ~p"/device")

      view
      |> element("form")
      |> render_submit(%{user_code: dc.user_code})

      html = render_click(view, "cancel")

      assert html =~ "XXXX-XXXX"
      refute html =~ "requesting access"
    end

    test "shows error for invalid code", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/device")

      html =
        view
        |> element("form")
        |> render_submit(%{user_code: "ZZZZ-ZZZZ"})

      assert html =~ "Code not found or expired"
    end

    test "auto-fills from URL code param and skips to confirmation", %{conn: conn} do
      {_raw, dc} = HeyiAm.Accounts.create_device_code()

      {:ok, _view, html} = live(conn, "/device?code=#{dc.user_code}")

      assert html =~ "requesting access to your account"
      assert html =~ "Authorize Device"
    end

    test "handles invalid URL code param gracefully", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/device?code=INVALID")

      assert html =~ "Code not found or expired"
    end

    test "handles lowercase input", %{conn: conn} do
      {_raw, dc} = HeyiAm.Accounts.create_device_code()

      {:ok, view, _html} = live(conn, ~p"/device")

      html =
        view
        |> element("form")
        |> render_submit(%{user_code: String.downcase(dc.user_code)})

      assert html =~ "requesting access to your account"
    end

    test "locks out after too many failed attempts", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/device")

      for _ <- 1..5 do
        view
        |> element("form")
        |> render_submit(%{user_code: "ZZZZ-ZZZZ"})
      end

      html =
        view
        |> element("form")
        |> render_submit(%{user_code: "ZZZZ-ZZZZ"})

      assert html =~ "Too many failed attempts"
    end
  end

  describe "unauthenticated" do
    test "redirects to login" do
      conn = build_conn()
      assert {:error, {:redirect, %{to: "/users/log-in"}}} = live(conn, ~p"/device")
    end
  end
end
