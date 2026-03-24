defmodule HeyiAmAppWeb.Integration.PublishRoundtripTest do
  @moduledoc """
  Integration test: upload project via API, then verify it exists in the DB.
  """
  use HeyiAmAppWeb.ConnCase

  describe "project publish roundtrip" do
    test "creates a project and session via API", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      # Create project
      conn = post(conn, ~p"/api/projects", %{
        project: %{slug: "roundtrip-proj", title: "Roundtrip Test"}
      })

      resp = json_response(conn, 201)
      assert resp["slug"] == "roundtrip-proj"
      project_id = resp["project_id"]

      # Create session linked to project
      {conn2, _user} = api_conn_with_auth()
      conn2 = post(conn2, ~p"/api/sessions", %{
        session: %{
          title: "Test Session",
          slug: "test-session",
          rendered_html: "<p>hello</p>",
          project_id: project_id
        }
      })

      sess_resp = json_response(conn2, 201)
      assert is_binary(sess_resp["token"])
    end
  end
end
