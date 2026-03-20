defmodule HeyiAmWeb.ShareApiControllerTest do
  use HeyiAmWeb.ConnCase, async: true

  alias HeyiAm.AccountsFixtures
  alias HeyiAm.Accounts.ApiToken
  alias HeyiAm.Repo

  defp create_api_token(user) do
    {changeset, plaintext} = ApiToken.create_changeset(user, %{label: "test"})
    {:ok, _token} = Repo.insert(changeset)
    plaintext
  end

  describe "POST /api/upload-image" do
    test "rejects unauthenticated requests with 401", %{conn: conn} do
      # No Bearer token — current_user will be nil
      upload = %Plug.Upload{
        path: write_tmp_image(),
        filename: "test.png",
        content_type: "image/png"
      }

      conn = post(conn, "/api/upload-image", %{"image" => upload})
      assert json_response(conn, 401)["error"] == "Authentication required"
    end

    test "returns 400 when image param is missing", %{conn: conn} do
      user = AccountsFixtures.user_fixture()
      token = create_api_token(user)

      conn =
        conn
        |> put_req_header("authorization", "Bearer #{token}")
        |> post("/api/upload-image", %{})

      assert json_response(conn, 400)["error"] == "Missing 'image' file in request"
    end

    test "rejects unsupported file types with authenticated user", %{conn: conn} do
      user = AccountsFixtures.user_fixture()
      token = create_api_token(user)

      upload = %Plug.Upload{
        path: write_tmp_image(),
        filename: "test.exe",
        content_type: "application/octet-stream"
      }

      conn =
        conn
        |> put_req_header("authorization", "Bearer #{token}")
        |> post("/api/upload-image", %{"image" => upload})

      assert json_response(conn, 400)["error"] =~ "unsupported type"
    end
  end

  describe "POST /api/share/:token/seal" do
    setup %{conn: conn} do
      user = AccountsFixtures.user_fixture()
      token = create_api_token(user)

      share =
        %HeyiAm.Shares.Share{}
        |> HeyiAm.Shares.Share.changeset(%{
          token: "share_#{System.unique_integer([:positive])}",
          delete_token: "del_#{System.unique_integer([:positive])}",
          title: "Test Session",
          user_id: user.id
        })
        |> Repo.insert!()

      %{conn: conn, user: user, api_token: token, share: share}
    end

    test "seals a share owned by the authenticated user", %{conn: conn, api_token: api_token, share: share} do
      conn =
        conn
        |> put_req_header("authorization", "Bearer #{api_token}")
        |> post("/api/share/#{share.token}/seal")

      resp = json_response(conn, 200)
      assert resp["sealed_at"]
      assert resp["seal_signature"]
    end

    test "returns 401 without authentication", %{conn: conn, share: share} do
      conn = post(conn, "/api/share/#{share.token}/seal")
      assert json_response(conn, 401)["error"] == "Authentication required"
    end

    test "returns 404 for non-existent share", %{conn: conn, api_token: api_token} do
      conn =
        conn
        |> put_req_header("authorization", "Bearer #{api_token}")
        |> post("/api/share/nonexistent/seal")

      assert json_response(conn, 404)["error"] == "Not found"
    end

    test "returns 403 when user does not own the share", %{conn: conn, share: share} do
      other_user = AccountsFixtures.user_fixture()
      other_token = create_api_token(other_user)

      conn =
        conn
        |> put_req_header("authorization", "Bearer #{other_token}")
        |> post("/api/share/#{share.token}/seal")

      assert json_response(conn, 403)["error"] == "Not authorized"
    end

    test "returns 409 when share is already sealed", %{conn: conn, api_token: api_token, share: share} do
      {:ok, _sealed} = HeyiAm.Shares.seal_share(share)

      conn =
        conn
        |> put_req_header("authorization", "Bearer #{api_token}")
        |> post("/api/share/#{share.token}/seal")

      assert json_response(conn, 409)["error"] == "Already sealed"
    end
  end

  # Write a small valid PNG to a tmp file and return the path
  defp write_tmp_image do
    # Minimal 1x1 PNG
    png_data =
      <<137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
        8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207,
        192, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130>>

    path = Path.join(System.tmp_dir!(), "test_upload_#{System.unique_integer([:positive])}.png")
    File.write!(path, png_data)
    path
  end
end
