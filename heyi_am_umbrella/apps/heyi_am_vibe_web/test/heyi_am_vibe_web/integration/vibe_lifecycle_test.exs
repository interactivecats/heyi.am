defmodule HeyiAmVibeWeb.Integration.VibeLifecycleTest do
  use HeyiAmVibeWeb.ConnCase

  @valid_attrs %{
    "archetype_id" => "architect",
    "modifier_id" => "reads-5x-more",
    "headline" => "The Architect who reads 5x more than writes",
    "narrative" => "You read everything before touching a line.",
    "stats" => %{"read_write_ratio" => 5.2, "corrections" => 3},
    "sources" => ["claude"],
    "session_count" => 12,
    "total_turns" => 1500
  }

  test "full vibe lifecycle: create via API, view in gallery, delete", %{conn: conn} do
    # 1. Create via API
    conn = post(conn, ~p"/api/vibes", @valid_attrs)
    create_response = json_response(conn, 201)
    short_id = create_response["short_id"]
    assert short_id

    # Extract delete code from URL
    delete_url = create_response["delete_url"]
    [_, code] = String.split(delete_url, "code=")

    # 2. View in gallery index
    conn = build_conn()
    conn = get(conn, ~p"/")
    assert html_response(conn, 200) =~ "The Architect"

    # 3. View individual vibe
    conn = build_conn()
    conn = get(conn, "/#{short_id}")
    response = html_response(conn, 200)
    assert response =~ "The Architect who reads 5x more than writes"
    assert response =~ "You read everything before touching a line."

    # 4. View card image
    conn = build_conn()
    conn = get(conn, "/#{short_id}/card.png")
    assert response(conn, 200)
    assert get_resp_header(conn, "content-type") |> hd() =~ "image/svg+xml"

    # 5. Delete with code
    conn = build_conn()
    conn = delete(conn, "/#{short_id}?code=#{code}")
    assert redirected_to(conn) == "/?deleted=true"

    # 6. Verify it's gone
    conn = build_conn()
    conn = get(conn, "/#{short_id}")
    assert html_response(conn, 404)
  end
end
