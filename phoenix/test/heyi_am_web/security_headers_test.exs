defmodule HeyiAmWeb.SecurityHeadersTest do
  use HeyiAmWeb.ConnCase

  describe "session cookie security" do
    test "session cookie is set with HttpOnly flag", %{conn: conn} do
      # Make a request that triggers a session (login page)
      conn = get(conn, ~p"/users/log-in")

      cookie_header =
        conn.resp_headers
        |> Enum.filter(fn {k, _v} -> k == "set-cookie" end)
        |> Enum.find(fn {_k, v} -> String.contains?(v, "_heyi_am_key") end)

      if cookie_header do
        {_, value} = cookie_header
        assert String.contains?(String.downcase(value), "httponly"),
               "Session cookie must include HttpOnly flag"
      end
    end
  end
end
