defmodule HeyiAmWeb.VibeApiControllerTest do
  use HeyiAmWeb.ConnCase

  @valid_payload %{
    "archetype_id" => "night-owl",
    "modifier_id" => "cusses-under-pressure",
    "narrative" => "You coded past midnight more often than not.",
    "stats" => %{"please_rate" => 0.42, "late_night_rate" => 0.62},
    "sources" => ["claude"],
    "session_count" => 23,
    "total_turns" => 847
  }

  describe "POST /api/vibes" do
    test "creates a vibe and returns URL", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post("/api/vibes", @valid_payload)

      resp = json_response(conn, 201)
      assert is_binary(resp["short_id"])
      assert String.contains?(resp["url"], "/v/#{resp["short_id"]}")
      assert String.contains?(resp["card_url"], "/v/#{resp["short_id"]}/card.png")
    end

    test "returns 422 with missing required fields", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post("/api/vibes", %{})

      resp = json_response(conn, 422)
      assert resp["error"]["code"] == "VALIDATION_FAILED"
    end

    test "returns 422 with session_count of 0", %{conn: conn} do
      payload = Map.put(@valid_payload, "session_count", 0)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post("/api/vibes", payload)

      assert json_response(conn, 422)["error"]["code"] == "VALIDATION_FAILED"
    end
  end

  describe "POST /api/vibes/narrative" do
    test "returns narrative with valid params", %{conn: conn} do
      # Uses mock provider in test env
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post("/api/vibes/narrative", %{
          "stats" => %{"please_rate" => 0.42},
          "archetype_id" => "night-owl"
        })

      resp = json_response(conn, 200)
      assert is_binary(resp["narrative"])
    end

    test "returns 400 without stats", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post("/api/vibes/narrative", %{"archetype_id" => "night-owl"})

      assert json_response(conn, 400)["error"]["code"] == "INVALID_PARAMS"
    end

    test "returns 400 without archetype_id", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post("/api/vibes/narrative", %{"stats" => %{}})

      assert json_response(conn, 400)["error"]["code"] == "INVALID_PARAMS"
    end
  end
end
