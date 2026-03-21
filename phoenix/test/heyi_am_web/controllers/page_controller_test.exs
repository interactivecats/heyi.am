defmodule HeyiAmWeb.PageControllerTest do
  use HeyiAmWeb.ConnCase

  test "GET / renders 200 with landing page content", %{conn: conn} do
    conn = get(conn, ~p"/")
    response = html_response(conn, 200)

    # Hero
    assert response =~ "The End of AI Fluff."
    assert response =~ "The Start of Provable Thinking."
    assert response =~ "heyiam open"

    # Feature cards
    assert response =~ "CLI Ingestion"
    assert response =~ "AI Enhancement"
    assert response =~ "Cryptographic Sealing"

    # Example sessions
    assert response =~ "Example Sessions"
    assert response =~ "Sarah Chen"

    # AI Collaboration Profile
    assert response =~ "Task Scoping"
    assert response =~ "Verification"

    # Dual audience
    assert response =~ "For Developers"
    assert response =~ "For Hiring Managers"

    # Bottom CTA
    assert response =~ "Publish your first session"
    assert response =~ "npm i -g heyiam"
  end

  test "GET / contains auth links", %{conn: conn} do
    conn = get(conn, ~p"/")
    response = html_response(conn, 200)

    assert response =~ ~p"/users/log-in"
    assert response =~ ~p"/users/register"
  end
end
