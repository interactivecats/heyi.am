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

  test "full vibe lifecycle: create via API, view in gallery, anonymize", %{conn: conn} do
    # 1. Create via API
    conn = post(conn, ~p"/api/vibes", @valid_attrs)
    create_response = json_response(conn, 201)
    short_id = create_response["short_id"]
    delete_code = create_response["delete_code"]
    assert short_id
    assert delete_code =~ ~r/^[A-Z]+-[A-Z]+-\d{4}$/

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

    # 5. View delete confirmation page
    conn = build_conn()
    conn = get(conn, "/#{short_id}/delete?code=#{delete_code}")
    assert html_response(conn, 200) =~ "Delete your vibe?"

    # 6. Anonymize with code
    conn = build_conn()
    conn = delete(conn, "/#{short_id}?code=#{delete_code}")
    assert redirected_to(conn) == "/?deleted=true"

    # 7. Verify it shows gone page (410, not 404)
    conn = build_conn()
    conn = get(conn, "/#{short_id}")
    response = html_response(conn, 410)
    assert response =~ "removed"
    assert response =~ "npx howdoyouvibe"

    # 8. Verify it's excluded from gallery but still in count
    conn = build_conn()
    conn = get(conn, ~p"/")
    response = html_response(conn, 200)
    refute response =~ "The Architect who reads 5x more"
  end
end
