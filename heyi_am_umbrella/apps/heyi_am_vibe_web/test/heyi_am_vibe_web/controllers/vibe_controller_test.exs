defmodule HeyiAmVibeWeb.VibeControllerTest do
  use HeyiAmVibeWeb.ConnCase

  alias HeyiAm.Vibes

  @valid_vibe_attrs %{
    "archetype_id" => "night-owl",
    "modifier_id" => "codes-at-3am",
    "headline" => "The Night Owl who codes at 3am",
    "narrative" => "You write your best code after midnight.",
    "stats" => %{"expletives" => 42, "please_rate" => 0.73},
    "sources" => ["cursor"],
    "session_count" => 5,
    "total_turns" => 847
  }

  defp create_vibe(_context) do
    {:ok, vibe} = Vibes.create_vibe(@valid_vibe_attrs)
    %{vibe: vibe}
  end

  describe "GET / (index)" do
    test "renders the gallery index page", %{conn: conn} do
      conn = get(conn, ~p"/")
      assert html_response(conn, 200) =~ "HOW DO YOU VIBE?"
    end

    test "shows recent vibes when they exist", %{conn: conn} do
      {:ok, _vibe} = Vibes.create_vibe(@valid_vibe_attrs)
      conn = get(conn, ~p"/")
      assert html_response(conn, 200) =~ "recent vibes"
    end
  end

  describe "GET /:short_id (show)" do
    setup [:create_vibe]

    test "renders a vibe", %{conn: conn, vibe: vibe} do
      conn = get(conn, ~p"/#{vibe.short_id}")
      response = html_response(conn, 200)
      assert response =~ vibe.headline
      assert response =~ "howdoyouvibe.com"
    end

    test "returns 404 for unknown short_id", %{conn: conn} do
      conn = get(conn, ~p"/nonexist")
      assert html_response(conn, 404)
    end
  end

  describe "GET /archetypes/:id" do
    test "renders an archetype page", %{conn: conn} do
      conn = get(conn, ~p"/archetypes/night-owl")
      response = html_response(conn, 200)
      assert response =~ "The Night Owl"
    end

    test "returns 404 for unknown archetype", %{conn: conn} do
      conn = get(conn, ~p"/archetypes/unknown-type")
      assert html_response(conn, 404)
    end
  end

  describe "GET /:short_id/card.png" do
    setup [:create_vibe]

    test "returns card image", %{conn: conn, vibe: vibe} do
      conn = get(conn, ~p"/#{vibe.short_id}/card.png")
      assert response(conn, 200)
      content_type = get_resp_header(conn, "content-type") |> hd()
      assert content_type =~ "image/png" or content_type =~ "image/svg+xml"
      assert get_resp_header(conn, "cache-control") |> hd() =~ "immutable"
    end

    test "returns 404 for unknown vibe card", %{conn: conn} do
      conn = get(conn, ~p"/nonexist/card.png")
      assert json_response(conn, 404) == %{"error" => "not found"}
    end
  end

  describe "GET /:short_id (show) anonymized" do
    setup [:create_vibe]

    test "returns 410 for anonymized vibe", %{conn: conn, vibe: vibe} do
      {:ok, _} = Vibes.delete_vibe(vibe.short_id, vibe.delete_code)
      conn = get(conn, ~p"/#{vibe.short_id}")
      response = html_response(conn, 410)
      assert response =~ "removed"
      assert response =~ "npx howdoyouvibe"
    end
  end

  describe "GET /:short_id/delete (confirm)" do
    setup [:create_vibe]

    test "shows confirmation page with correct code", %{conn: conn, vibe: vibe} do
      conn = get(conn, ~p"/#{vibe.short_id}/delete?code=#{vibe.delete_code}")
      response = html_response(conn, 200)
      assert response =~ "Delete your vibe?"
      assert response =~ "Yes, delete my vibe"
    end

    test "rejects with wrong code", %{conn: conn, vibe: vibe} do
      conn = get(conn, ~p"/#{vibe.short_id}/delete?code=WRONG-CODE-1234")
      assert html_response(conn, 403)
    end

    test "returns 410 for already anonymized vibe", %{conn: conn, vibe: vibe} do
      {:ok, _} = Vibes.delete_vibe(vibe.short_id, vibe.delete_code)
      conn = get(conn, ~p"/#{vibe.short_id}/delete?code=USED")
      assert html_response(conn, 410)
    end
  end

  describe "DELETE /:short_id" do
    setup [:create_vibe]

    test "anonymizes vibe with correct code and redirects", %{conn: conn, vibe: vibe} do
      conn = delete(conn, ~p"/#{vibe.short_id}?code=#{vibe.delete_code}")
      assert redirected_to(conn) == ~p"/?deleted=true"
      anon = Vibes.get_vibe_by_short_id(vibe.short_id)
      assert anon.anonymized_at
    end

    test "rejects delete with wrong code", %{conn: conn, vibe: vibe} do
      conn = delete(conn, ~p"/#{vibe.short_id}?code=wrongcode")
      assert html_response(conn, 403)
      assert Vibes.get_vibe_by_short_id(vibe.short_id)
    end

    test "returns 404 for unknown vibe", %{conn: conn} do
      conn = delete(conn, ~p"/nonexist?code=abc")
      assert html_response(conn, 404)
    end

    test "returns 410 for already anonymized vibe", %{conn: conn, vibe: vibe} do
      {:ok, _} = Vibes.delete_vibe(vibe.short_id, vibe.delete_code)
      conn = delete(conn, ~p"/#{vibe.short_id}?code=USED")
      assert html_response(conn, 410)
    end
  end
end
