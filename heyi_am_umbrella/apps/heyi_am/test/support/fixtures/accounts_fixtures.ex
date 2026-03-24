defmodule HeyiAm.AccountsFixtures do
  @moduledoc """
  This module defines test helpers for creating
  entities via the `HeyiAm.Accounts` context.
  """

  import Ecto.Query

  alias HeyiAm.Accounts
  alias HeyiAm.Accounts.Scope

  def unique_user_email, do: "user#{System.unique_integer()}@example.com"
  def valid_user_password, do: "hello world!"

  def valid_user_attributes(attrs \\ %{}) do
    Enum.into(attrs, %{
      email: unique_user_email(),
      password: valid_user_password()
    })
  end

  def unconfirmed_user_fixture(attrs \\ %{}) do
    {:ok, user} =
      attrs
      |> valid_user_attributes()
      |> HeyiAm.Accounts.register_user()

    # Un-confirm the user and clear password for testing magic link flows
    HeyiAm.Repo.update_all(
      Ecto.Query.from(u in HeyiAm.Accounts.User, where: u.id == ^user.id),
      set: [confirmed_at: nil, hashed_password: nil]
    )

    HeyiAm.Repo.get!(HeyiAm.Accounts.User, user.id)
  end

  @profile_keys ~w(display_name bio avatar_url github_url location status portfolio_layout portfolio_accent)a

  def user_fixture(attrs \\ %{}) do
    {username, attrs} = Map.pop(attrs, :username)
    {profile_attrs, attrs} = Map.split(attrs, @profile_keys)

    {:ok, user} =
      attrs
      |> valid_user_attributes()
      |> Accounts.register_user()

    user =
      if username do
        {:ok, user} = Accounts.update_user_username(user, %{username: username})
        user
      else
        user
      end

    if map_size(profile_attrs) > 0 do
      {:ok, user} = Accounts.update_user_profile(user, profile_attrs)
      user
    else
      user
    end
  end

  def user_scope_fixture do
    user = user_fixture()
    user_scope_fixture(user)
  end

  def user_scope_fixture(user) do
    Scope.for_user(user)
  end

  def set_password(user) do
    {:ok, {user, _expired_tokens}} =
      Accounts.update_user_password(user, %{password: valid_user_password()})

    user
  end

  def extract_user_token(fun) do
    {:ok, captured_email} = fun.(&"[TOKEN]#{&1}[TOKEN]")
    [_, token | _] = String.split(captured_email.text_body, "[TOKEN]")
    token
  end

  def override_token_authenticated_at(token, authenticated_at) when is_binary(token) do
    HeyiAm.Repo.update_all(
      from(t in Accounts.UserToken,
        where: t.token == ^token
      ),
      set: [authenticated_at: authenticated_at]
    )
  end

  def generate_user_magic_link_token(user) do
    {encoded_token, user_token} = Accounts.UserToken.build_email_token(user, "login")
    HeyiAm.Repo.insert!(user_token)
    {encoded_token, user_token.token}
  end

  def offset_user_token(token, amount_to_add, unit) do
    dt = DateTime.add(DateTime.utc_now(:second), amount_to_add, unit)

    HeyiAm.Repo.update_all(
      from(ut in Accounts.UserToken, where: ut.token == ^token),
      set: [inserted_at: dt, authenticated_at: dt]
    )
  end
end
