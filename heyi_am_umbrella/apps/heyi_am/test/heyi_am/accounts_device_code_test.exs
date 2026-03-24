defmodule HeyiAm.Accounts.DeviceCodeTest do
  use HeyiAm.DataCase, async: true

  import HeyiAm.AccountsFixtures

  alias HeyiAm.Accounts

  describe "create_device_code/0" do
    test "returns raw code and inserted struct" do
      {raw_code, dc} = Accounts.create_device_code()
      assert is_binary(raw_code) and byte_size(raw_code) == 32
      assert dc.user_code =~ ~r/^[A-Z2-9]{4}-[A-Z2-9]{4}$/
      assert dc.status == "pending"
      assert dc.id != nil
      assert dc.expires_at != nil
    end
  end

  describe "authorize_device_code/2" do
    test "authorizes a pending code" do
      {_raw, dc} = Accounts.create_device_code()
      user = user_fixture()
      assert {:ok, authorized} = Accounts.authorize_device_code(dc.user_code, user)
      assert authorized.status == "authorized"
      assert authorized.user_id == user.id
    end

    test "returns error for unknown code" do
      assert {:error, :not_found} = Accounts.authorize_device_code("ZZZZ-ZZZZ", user_fixture())
    end

    test "handles case-insensitive input" do
      {_raw, dc} = Accounts.create_device_code()
      user = user_fixture()
      lower = String.downcase(dc.user_code)
      assert {:ok, _} = Accounts.authorize_device_code(lower, user)
    end

    test "handles whitespace in input" do
      {_raw, dc} = Accounts.create_device_code()
      user = user_fixture()
      padded = "  #{dc.user_code}  "
      assert {:ok, _} = Accounts.authorize_device_code(padded, user)
    end
  end

  describe "poll_device_code/1" do
    test "returns authorization_pending for pending code" do
      {raw, _dc} = Accounts.create_device_code()
      assert {:error, :authorization_pending} = Accounts.poll_device_code(raw)
    end

    test "returns token and user for authorized code" do
      {raw, dc} = Accounts.create_device_code()
      user = user_fixture()
      {:ok, _} = Accounts.authorize_device_code(dc.user_code, user)
      assert {:ok, {token, returned_user}} = Accounts.poll_device_code(raw)
      assert is_binary(token) and byte_size(token) == 32
      assert returned_user.id == user.id
    end

    test "authorized code can only be polled once" do
      {raw, dc} = Accounts.create_device_code()
      user = user_fixture()
      {:ok, _} = Accounts.authorize_device_code(dc.user_code, user)
      assert {:ok, _} = Accounts.poll_device_code(raw)
      assert {:error, :not_found} = Accounts.poll_device_code(raw)
    end

    test "returned session token is valid" do
      {raw, dc} = Accounts.create_device_code()
      user = user_fixture()
      {:ok, _} = Accounts.authorize_device_code(dc.user_code, user)
      {:ok, {token, _user}} = Accounts.poll_device_code(raw)

      assert {verified_user, _inserted_at} = Accounts.get_user_by_session_token(token)
      assert verified_user.id == user.id
    end

    test "returns expired_token for expired code" do
      {raw, dc} = Accounts.create_device_code()

      expired_at = DateTime.add(DateTime.utc_now(), -1, :minute) |> DateTime.truncate(:second)

      dc
      |> Ecto.Changeset.change(%{expires_at: expired_at})
      |> HeyiAm.Repo.update!()

      assert {:error, :expired_token} = Accounts.poll_device_code(raw)
    end

    test "returns not_found for unknown code" do
      assert {:error, :not_found} = Accounts.poll_device_code(:crypto.strong_rand_bytes(32))
    end
  end
end
