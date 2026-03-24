defmodule HeyiAmAppWeb.DeviceAuthLiveTest do
  use HeyiAmAppWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  import HeyiAm.AccountsFixtures

  setup %{conn: conn} do
    user = user_fixture()
    %{conn: log_in_user(conn, user), user: user}
  end

  describe "mount" do
    test "renders device auth page", %{conn: conn} do
      {:ok, _view, html} = live(conn, ~p"/device")
      assert html =~ "Authorize Device"
    end
  end
end
