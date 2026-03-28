defmodule HeyiAmVibeWeb.VibeApiControllerTest do
  use HeyiAmVibeWeb.ConnCase

  @valid_attrs %{
    "archetype_id" => "night-owl",
    "modifier_id" => "codes-at-3am",
    "headline" => "The Night Owl who codes at 3am",
    "narrative" => "You write your best code after midnight.",
    "stats" => %{"expletives" => 42, "please_rate" => 0.73},
    "sources" => ["cursor"],
    "session_count" => 5,
    "total_turns" => 847
  }

  describe "POST /api/vibes (create)" do
    test "creates a vibe with valid data", %{conn: conn} do
      conn = post(conn, ~p"/api/vibes", @valid_attrs)
      response = json_response(conn, 201)

      assert response["short_id"]
      assert response["url"] =~ response["short_id"]
      assert response["card_url"] =~ "card.png"
      assert response["delete_url"] =~ "/delete?code="
      assert response["delete_code"] =~ ~r/^[A-Z]+-[A-Z]+-\d{4}$/
    end

    test "returns validation errors for missing fields", %{conn: conn} do
      conn = post(conn, ~p"/api/vibes", %{})
      response = json_response(conn, 422)
      assert response["error"]["code"] == "VALIDATION_FAILED"
      assert is_map(response["error"]["details"])
    end

    test "rate limits after 5 requests per minute", %{conn: conn} do
      # Enable rate limiting for this test
      Application.put_env(:heyi_am_vibe_web, :rate_limiting_enabled, true)

      results =
        for _i <- 1..6 do
          conn = post(conn, ~p"/api/vibes", @valid_attrs)
          conn.status
        end

      assert Enum.count(results, &(&1 == 201)) <= 5
      assert Enum.member?(results, 429)

      Application.put_env(:heyi_am_vibe_web, :rate_limiting_enabled, false)
    end
  end

  describe "POST /api/vibes/narrative" do
    test "returns 400 when stats or archetype_id missing", %{conn: conn} do
      conn = post(conn, ~p"/api/vibes/narrative", %{"stats" => "not_a_map"})
      assert json_response(conn, 400)["error"]["code"] == "INVALID_PARAMS"
    end
  end
end
