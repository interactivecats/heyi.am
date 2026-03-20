defmodule HeyiAm.Accounts.DeviceAuthorizationTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAm.Accounts
  alias HeyiAm.Accounts.DeviceAuthorization

  setup do
    user = HeyiAm.AccountsFixtures.user_fixture()
    %{user: user}
  end

  describe "create_device_authorization/0" do
    test "creates a pending device authorization with valid codes" do
      assert {:ok, da} = Accounts.create_device_authorization()
      assert da.status == "pending"
      assert da.device_code != nil
      assert da.user_code != nil
      assert String.length(da.user_code) == 6
      assert da.expires_at != nil
      assert da.user_id == nil
      assert da.api_token_plaintext == nil

      # User code should only contain non-ambiguous characters
      assert Regex.match?(~r/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, da.user_code)
    end

    test "device codes are unique" do
      {:ok, da1} = Accounts.create_device_authorization()
      {:ok, da2} = Accounts.create_device_authorization()
      assert da1.device_code != da2.device_code
    end
  end

  describe "get_device_authorization_by_user_code/1" do
    test "finds a pending device auth by user code", %{user: _user} do
      {:ok, da} = Accounts.create_device_authorization()
      found = Accounts.get_device_authorization_by_user_code(da.user_code)
      assert found.id == da.id
    end

    test "is case-insensitive" do
      {:ok, da} = Accounts.create_device_authorization()
      found = Accounts.get_device_authorization_by_user_code(String.downcase(da.user_code))
      assert found.id == da.id
    end

    test "returns nil for non-existent code" do
      assert Accounts.get_device_authorization_by_user_code("ZZZZZZ") == nil
    end

    test "returns nil for expired codes" do
      {:ok, da} = Accounts.create_device_authorization()

      # Manually expire it
      from(d in DeviceAuthorization, where: d.id == ^da.id)
      |> Repo.update_all(set: [expires_at: DateTime.add(DateTime.utc_now(:second), -1, :minute)])

      assert Accounts.get_device_authorization_by_user_code(da.user_code) == nil
    end

    test "returns nil for authorized codes" do
      {:ok, da} = Accounts.create_device_authorization()

      from(d in DeviceAuthorization, where: d.id == ^da.id)
      |> Repo.update_all(set: [status: "authorized"])

      assert Accounts.get_device_authorization_by_user_code(da.user_code) == nil
    end
  end

  describe "authorize_device/2" do
    test "authorizes a pending device auth and creates an API token", %{user: user} do
      {:ok, da} = Accounts.create_device_authorization()
      assert {:ok, authorized_da} = Accounts.authorize_device(da, user)

      assert authorized_da.status == "authorized"
      assert authorized_da.user_id == user.id
      assert authorized_da.api_token_plaintext != nil

      # Verify the API token was stored in the api_tokens table
      found_user = Accounts.get_user_by_api_token(authorized_da.api_token_plaintext)
      assert found_user.id == user.id
    end

    test "returns error for expired device auth", %{user: user} do
      {:ok, da} = Accounts.create_device_authorization()

      from(d in DeviceAuthorization, where: d.id == ^da.id)
      |> Repo.update_all(set: [expires_at: DateTime.add(DateTime.utc_now(:second), -1, :minute)])

      da = Repo.get!(DeviceAuthorization, da.id)
      assert {:error, :expired} = Accounts.authorize_device(da, user)
    end

    test "returns error for already authorized device auth", %{user: user} do
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, _} = Accounts.authorize_device(da, user)

      da = Repo.get!(DeviceAuthorization, da.id)
      assert {:error, :already_processed} = Accounts.authorize_device(da, user)
    end
  end

  describe "check_device_token/1" do
    test "returns pending for a pending device auth" do
      {:ok, da} = Accounts.create_device_authorization()
      assert {:ok, :pending} = Accounts.check_device_token(da.device_code)
    end

    test "returns authorized with token on first check", %{user: user} do
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, _} = Accounts.authorize_device(da, user)

      assert {:ok, :authorized, token, returned_user} =
               Accounts.check_device_token(da.device_code)

      assert is_binary(token)
      assert returned_user.id == user.id

      # Token should work for Bearer auth
      assert Accounts.get_user_by_api_token(token).id == user.id
    end

    test "clears plaintext token after first retrieval", %{user: user} do
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, _} = Accounts.authorize_device(da, user)

      # First check returns token
      {:ok, :authorized, token, _} = Accounts.check_device_token(da.device_code)
      assert is_binary(token)

      # Second check returns nil token
      {:ok, :authorized, nil, _} = Accounts.check_device_token(da.device_code)
    end

    test "returns expired for expired pending device auth" do
      {:ok, da} = Accounts.create_device_authorization()

      from(d in DeviceAuthorization, where: d.id == ^da.id)
      |> Repo.update_all(set: [expires_at: DateTime.add(DateTime.utc_now(:second), -1, :minute)])

      assert {:error, :expired} = Accounts.check_device_token(da.device_code)
    end

    test "returns not_found for invalid device code" do
      assert {:error, :not_found} = Accounts.check_device_token("nonexistent")
    end
  end

  describe "get_user_by_api_token/1" do
    test "returns user for valid token", %{user: user} do
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, _} = Accounts.authorize_device(da, user)
      {:ok, :authorized, token, _} = Accounts.check_device_token(da.device_code)

      found = Accounts.get_user_by_api_token(token)
      assert found.id == user.id
    end

    test "returns nil for invalid token" do
      assert Accounts.get_user_by_api_token("bogus-token") == nil
    end

    test "updates last_used_at on lookup", %{user: user} do
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, _} = Accounts.authorize_device(da, user)
      {:ok, :authorized, token, _} = Accounts.check_device_token(da.device_code)

      Accounts.get_user_by_api_token(token)

      api_token =
        Repo.get_by!(Accounts.ApiToken,
          hashed_token: Accounts.ApiToken.hash_token(token)
        )

      assert api_token.last_used_at != nil
    end
  end

  describe "cleanup_expired_device_authorizations/1" do
    test "deletes expired device authorizations older than cutoff" do
      {:ok, da} = Accounts.create_device_authorization()

      # Make it expired and old
      from(d in DeviceAuthorization, where: d.id == ^da.id)
      |> Repo.update_all(
        set: [
          status: "expired",
          expires_at: DateTime.add(DateTime.utc_now(:second), -120, :minute)
        ]
      )

      {count, _} = Accounts.cleanup_expired_device_authorizations(60)
      assert count == 1
    end

    test "does not delete authorized device authorizations", %{user: user} do
      {:ok, da} = Accounts.create_device_authorization()
      {:ok, _} = Accounts.authorize_device(da, user)

      {count, _} = Accounts.cleanup_expired_device_authorizations(0)
      assert count == 0
    end
  end
end
