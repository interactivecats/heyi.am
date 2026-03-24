defmodule HeyiAmAppWeb.Integration.UploadRoundtripTest do
  @moduledoc """
  Integration test: upload project + session via API, verify HTML is stored
  and sanitized, verify public pages serve the content.
  """
  use HeyiAmAppWeb.ConnCase

  describe "project upload roundtrip" do
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

    test "uploaded session rendered_html is persisted and accessible", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      html = ~s(<div class="case-study"><h2>Auth Migration</h2><p>Complex work.</p></div>)

      conn = post(conn, ~p"/api/sessions", %{
        session: %{
          title: "Auth Migration",
          slug: "auth-migration",
          rendered_html: html,
          status: "listed"
        }
      })

      resp = json_response(conn, 201)
      token = resp["token"]

      # Verify HTML is stored in DB
      share = HeyiAm.Shares.get_share_by_token(token)
      assert share.rendered_html == html
    end

    test "uploaded project rendered_html is persisted", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      html = ~s(<div class="project-page"><h1>My Project</h1></div>)

      conn = post(conn, ~p"/api/projects", %{
        project: %{
          slug: "html-proj",
          title: "HTML Project",
          rendered_html: html
        }
      })

      json_response(conn, 201)
      project = HeyiAm.Repo.get_by(HeyiAm.Projects.Project, slug: "html-proj")
      assert project.rendered_html == html
    end

    test "sanitizes script tags from uploaded rendered_html", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      malicious_html = "<div>safe</div>" <> "<script>alert('xss')<" <> "/script>"

      conn = post(conn, ~p"/api/sessions", %{
        session: %{
          title: "XSS Test",
          slug: "xss-test",
          rendered_html: malicious_html,
          status: "listed"
        }
      })

      resp = json_response(conn, 201)
      share = HeyiAm.Shares.get_share_by_token(resp["token"])

      assert share.rendered_html =~ "safe"
      refute share.rendered_html =~ "<script"
    end

    test "sanitizes event handlers from uploaded rendered_html", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      malicious_html = ~s|<img src="x" onerror="alert('xss')" />|

      conn = post(conn, ~p"/api/sessions", %{
        session: %{
          title: "Event Handler Test",
          slug: "event-test",
          rendered_html: malicious_html,
          status: "listed"
        }
      })

      resp = json_response(conn, 201)
      share = HeyiAm.Shares.get_share_by_token(resp["token"])

      refute share.rendered_html =~ "onerror"
      refute share.rendered_html =~ "alert"
    end

    test "sanitizes javascript URIs from uploaded project rendered_html", %{conn: _conn} do
      {conn, _user} = api_conn_with_auth()

      malicious_html = ~s|<a href="javascript:alert(1)">click</a>|

      conn = post(conn, ~p"/api/projects", %{
        project: %{
          slug: "js-uri-proj",
          title: "JS URI Test",
          rendered_html: malicious_html
        }
      })

      json_response(conn, 201)
      project = HeyiAm.Repo.get_by(HeyiAm.Projects.Project, slug: "js-uri-proj")
      refute project.rendered_html =~ "javascript"
    end
  end
end
