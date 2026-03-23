defmodule HeyiAmWeb.VibeControllerTest do
  use HeyiAmWeb.ConnCase

  import HeyiAm.VibesFixtures

  describe "GET /v" do
    test "renders index page", %{conn: conn} do
      conn = get(conn, "/v")
      assert html_response(conn, 200) =~ "HOW DO YOU VIBE?"
    end

    test "shows recent vibes", %{conn: conn} do
      _vibe = vibe_fixture(%{"archetype_id" => "night-owl"})
      conn = get(conn, "/v")
      assert html_response(conn, 200) =~ "Night Owl"
    end
  end

  describe "GET /v/:short_id" do
    test "renders share page with OG tags", %{conn: conn} do
      vibe = vibe_fixture()
      conn = get(conn, "/v/#{vibe.short_id}")
      body = html_response(conn, 200)
      assert body =~ "Night Owl"
      assert body =~ vibe.narrative
      assert body =~ "og:title"
    end

    test "returns 404 for unknown short_id", %{conn: conn} do
      conn = get(conn, "/v/zzzzzzz")
      assert html_response(conn, 404)
    end
  end

  describe "GET /v/archetypes/:id" do
    test "renders archetype page", %{conn: conn} do
      conn = get(conn, "/v/archetypes/night-owl")
      body = html_response(conn, 200)
      assert body =~ "The Night Owl"
      assert body =~ "Codes when the world sleeps"
    end

    test "returns 404 for unknown archetype", %{conn: conn} do
      conn = get(conn, "/v/archetypes/not-real")
      assert html_response(conn, 404)
    end
  end

  describe "GET /v/:short_id/card.png" do
    test "returns SVG for valid vibe", %{conn: conn} do
      vibe = vibe_fixture()
      conn = get(conn, "/v/#{vibe.short_id}/card.png")
      assert response_content_type(conn, :xml) =~ "svg"
      assert response(conn, 200) =~ "<svg"
      assert response(conn, 200) =~ "Night Owl"
    end

    test "returns 404 for unknown vibe", %{conn: conn} do
      conn = get(conn, "/v/zzzzzzz/card.png")
      assert json_response(conn, 404)
    end
  end
end
