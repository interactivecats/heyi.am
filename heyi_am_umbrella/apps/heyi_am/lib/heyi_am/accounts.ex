defmodule HeyiAm.Accounts do
  @moduledoc """
  The Accounts context.
  """

  import Ecto.Query, warn: false
  alias HeyiAm.Repo

  alias HeyiAm.Accounts.{User, UserToken, UserNotifier}

  ## Database getters

  def get_user_by_email(email) when is_binary(email) do
    Repo.get_by(User, email: email)
  end

  def get_user_by_username(username) when is_binary(username) do
    Repo.get_by(User, username: username)
  end

  def get_user_by_email_and_password(email, password)
      when is_binary(email) and is_binary(password) do
    user = Repo.get_by(User, email: email)
    if User.valid_password?(user, password), do: user
  end

  def get_user!(id), do: Repo.get!(User, id)

  ## GitHub OAuth

  def find_or_create_from_github(%{github_id: github_id} = attrs) when is_integer(github_id) do
    case Repo.get_by(User, github_id: github_id) do
      nil ->
        changeset =
          %User{}
          |> User.github_changeset(attrs)
          |> User.confirm_changeset()

        case Repo.insert(changeset) do
          {:ok, user} ->
            UserNotifier.deliver_welcome(user)
            {:ok, user}

          {:error, %Ecto.Changeset{errors: errors} = changeset} ->
            if Keyword.has_key?(errors, :github_id) do
              case Repo.get_by(User, github_id: github_id) do
                nil -> {:error, changeset}
                user -> {:ok, user}
              end
            else
              {:error, changeset}
            end
        end

      user ->
        {:ok, user}
    end
  end

  ## User registration

  def register_user(attrs) do
    %User{}
    |> User.registration_changeset(attrs)
    |> Repo.insert()
  end

  ## Settings

  def sudo_mode?(user, minutes \\ -20)

  def sudo_mode?(%User{authenticated_at: ts}, minutes) when is_struct(ts, DateTime) do
    DateTime.after?(ts, DateTime.utc_now() |> DateTime.add(minutes, :minute))
  end

  def sudo_mode?(_user, _minutes), do: false

  def change_user_email(user, attrs \\ %{}, opts \\ []) do
    User.email_changeset(user, attrs, opts)
  end

  def update_user_email(user, token) do
    context = "change:#{user.email}"

    Repo.transact(fn ->
      with {:ok, query} <- UserToken.verify_change_email_token_query(token, context),
           %UserToken{sent_to: email} <- Repo.one(query),
           {:ok, user} <- Repo.update(User.email_changeset(user, %{email: email})),
           {_count, _result} <-
             Repo.delete_all(from(UserToken, where: [user_id: ^user.id, context: ^context])) do
        {:ok, user}
      else
        _ -> {:error, :transaction_aborted}
      end
    end)
  end

  def change_user_password(user, attrs \\ %{}, opts \\ []) do
    User.password_changeset(user, attrs, opts)
  end

  def update_user_password(user, attrs) do
    user
    |> User.password_changeset(attrs)
    |> update_user_and_delete_all_tokens()
  end

  ## Session

  def generate_user_session_token(user) do
    {token, user_token} = UserToken.build_session_token(user)
    Repo.insert!(user_token)
    token
  end

  def get_user_by_session_token(token) do
    {:ok, query} = UserToken.verify_session_token_query(token)
    Repo.one(query)
  end

  ## Magic link login (used by phx.gen.auth confirmation flow)

  def get_user_by_magic_link_token(token) do
    with {:ok, query} <- UserToken.verify_magic_link_token_query(token),
         {user, _token} <- Repo.one(query) do
      user
    else
      _ -> nil
    end
  end

  def login_user_by_magic_link(token) do
    {:ok, query} = UserToken.verify_magic_link_token_query(token)

    case Repo.one(query) do
      {%User{confirmed_at: nil, hashed_password: hash}, _token} when not is_nil(hash) ->
        raise """
        magic link log in is not allowed for unconfirmed users with a password set!

        This cannot happen with the default implementation, which indicates that you
        might have adapted the code to a different use case. Please make sure to read the
        "Mixing magic link and password registration" section of `mix help phx.gen.auth`.
        """

      {%User{confirmed_at: nil} = user, _token} ->
        user
        |> User.confirm_changeset()
        |> update_user_and_delete_all_tokens()

      {user, token} ->
        Repo.delete!(token)
        {:ok, {user, []}}

      nil ->
        {:error, :not_found}
    end
  end

  ## Email delivery

  def deliver_user_update_email_instructions(%User{} = user, current_email, update_email_url_fun)
      when is_function(update_email_url_fun, 1) do
    {encoded_token, user_token} = UserToken.build_email_token(user, "change:#{current_email}")

    Repo.insert!(user_token)
    UserNotifier.deliver_update_email_instructions(user, update_email_url_fun.(encoded_token))
  end

  def deliver_login_instructions(%User{} = user, magic_link_url_fun)
      when is_function(magic_link_url_fun, 1) do
    {encoded_token, user_token} = UserToken.build_email_token(user, "login")
    Repo.insert!(user_token)
    UserNotifier.deliver_login_instructions(user, magic_link_url_fun.(encoded_token))
  end

  ## Password reset

  def deliver_user_reset_password_instructions(%User{} = user, reset_password_url_fun)
      when is_function(reset_password_url_fun, 1) do
    {encoded_token, user_token} = UserToken.build_email_token(user, "reset_password")
    Repo.insert!(user_token)
    UserNotifier.deliver_reset_password_instructions(user, reset_password_url_fun.(encoded_token))
  end

  def get_user_by_reset_password_token(token) do
    with {:ok, query} <- UserToken.verify_reset_password_token_query(token),
         %User{} = user <- Repo.one(query) do
      user
    else
      _ -> nil
    end
  end

  def reset_user_password(user, attrs) do
    Repo.transact(fn ->
      with {:ok, user} <- user |> User.password_changeset(attrs) |> Repo.update() do
        Repo.delete_all(from(t in UserToken, where: t.user_id == ^user.id))
        {:ok, user}
      end
    end)
  end

  def delete_user_session_token(token) do
    Repo.delete_all(from(UserToken, where: [token: ^token, context: "session"]))
    :ok
  end

  ## Device Authorization

  alias HeyiAm.Accounts.DeviceCode

  @device_code_max_retry 3

  def create_device_code(attempt \\ 0) do
    {raw_code, device_code} = DeviceCode.build()

    case Repo.insert(device_code) do
      {:ok, inserted} ->
        {raw_code, inserted}

      {:error, _changeset} when attempt < @device_code_max_retry ->
        create_device_code(attempt + 1)

      {:error, changeset} ->
        raise "Failed to create device code after retries: #{inspect(changeset.errors)}"
    end
  end

  def authorize_device_code(user_code, user) do
    user_code = user_code |> String.trim() |> String.upcase()

    # Atomic update — prevents race condition where two concurrent requests
    # both read the same pending code and authorize it for different users
    query =
      from dc in DeviceCode,
        where: dc.user_code == ^user_code and dc.status == "pending",
        select: dc

    case Repo.update_all(query, set: [status: "authorized", user_id: user.id]) do
      {1, [dc]} -> {:ok, dc}
      {0, _} -> {:error, :not_found}
    end
  end

  def poll_device_code(raw_device_code) do
    hashed = DeviceCode.hash(raw_device_code)

    authorized_query =
      from dc in DeviceCode,
        where: dc.device_code == ^hashed,
        where: dc.status == "authorized",
        select: dc.user_id

    case Repo.delete_all(authorized_query) do
      {1, [user_id]} ->
        user = Repo.get!(User, user_id)
        token = generate_user_session_token(user)
        {:ok, {token, user}}

      {0, _} ->
        case Repo.one(from dc in DeviceCode, where: dc.device_code == ^hashed) do
          nil ->
            {:error, :not_found}

          %DeviceCode{status: "pending"} = dc ->
            if DeviceCode.expired?(dc),
              do: {:error, :expired_token},
              else: {:error, :authorization_pending}

          %DeviceCode{status: "denied"} ->
            {:error, :access_denied}

          %DeviceCode{} ->
            {:error, :expired_token}
        end
    end
  end

  ## Profile

  def change_user_profile(user, attrs \\ %{}) do
    User.profile_changeset(user, attrs)
  end

  def update_user_profile(user, attrs) do
    user
    |> User.profile_changeset(attrs)
    |> Repo.update()
  end

  def update_user_rendered_html(user, attrs) do
    user
    |> User.rendered_html_changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Updates the user's `rendered_portfolio_html` column. The HTML is sanitized
  by `HeyiAm.HtmlSanitizer` inside the changeset before the write.
  """
  def update_user_rendered_portfolio_html(user, html) when is_binary(html) do
    update_user_rendered_html(user, %{"rendered_portfolio_html" => html})
  end

  @doc """
  Sets the user's `profile_photo_key`, deleting the previous S3 object
  (best-effort) after the DB write succeeds. Pass `nil` or `""` to clear.
  """
  def update_user_profile_photo_key(user, key) do
    old_key = user.profile_photo_key

    changeset = User.profile_photo_key_changeset(user, %{"profile_photo_key" => key})

    case Repo.update(changeset) do
      {:ok, updated} ->
        if is_binary(old_key) and old_key != "" and old_key != key do
          HeyiAm.ObjectStorage.delete_object(old_key)
        end

        {:ok, updated}

      error ->
        error
    end
  end

  def update_user_time_stats(user, time_stats) do
    user
    |> Ecto.Changeset.change(%{time_stats: time_stats})
    |> Repo.update()
  end

  def change_user_username(user, attrs \\ %{}, opts \\ []) do
    User.username_changeset(user, attrs, opts)
  end

  def update_user_username(user, attrs) do
    user
    |> User.username_changeset(attrs)
    |> Repo.update()
  end

  ## GDPR

  def export_user_data(%User{} = user) do
    shares = HeyiAm.Shares.list_shares_for_user(user.id)
    {:ok, %{
      exported_at: DateTime.utc_now(),
      profile: %{
        email: user.email,
        username: user.username,
        display_name: user.display_name,
        bio: user.bio,
        avatar_url: user.avatar_url,
        github_url: user.github_url,
        location: user.location,
        status: user.status,
        portfolio_layout: user.portfolio_layout,
        portfolio_accent: user.portfolio_accent,
        confirmed_at: user.confirmed_at,
        inserted_at: user.inserted_at
      },
      shares: Enum.map(shares, &share_to_export/1)
    }}
  end

  def delete_user_account(%User{} = user) do
    Repo.transact(fn ->
      from(s in HeyiAm.Shares.Share,
        where: s.user_id == ^user.id,
        update: [set: [
          user_id: nil,
          title: "deleted",
          dev_take: nil,
          narrative: nil,
          project_name: nil,
          status: "unlisted",
          token: fragment("'deleted-' || gen_random_uuid()::text")
        ]]
      )
      |> Repo.update_all([])

      Repo.delete_all(from(t in UserToken, where: t.user_id == ^user.id))

      Repo.update_all(
        from(u in User, where: u.id == ^user.id),
        set: [
          email: "deleted-#{Ecto.UUID.generate()}@deleted.heyi.am",
          hashed_password: "",
          username: nil,
          display_name: nil,
          bio: nil,
          avatar_url: nil,
          github_id: nil,
          github_url: nil,
          location: nil,
          status: "deleted",
          confirmed_at: nil
        ]
      )

      {:ok, user}
    end)
  end

  defp share_to_export(share) do
    %{
      token: share.token,
      title: share.title,
      dev_take: share.dev_take,
      duration_minutes: share.duration_minutes,
      turns: share.turns,
      files_changed: share.files_changed,
      loc_changed: share.loc_changed,
      recorded_at: share.recorded_at,
      template: share.template,
      language: share.language,
      tools: share.tools,
      skills: share.skills,
      narrative: share.narrative,
      project_name: share.project_name,
      status: share.status,
      inserted_at: share.inserted_at
    }
  end

  ## Token helper

  defp update_user_and_delete_all_tokens(changeset) do
    Repo.transact(fn ->
      with {:ok, user} <- Repo.update(changeset) do
        tokens_to_expire = Repo.all(from(t in UserToken, where: t.user_id == ^user.id))

        Repo.delete_all(from(t in UserToken, where: t.id in ^Enum.map(tokens_to_expire, & &1.id)))

        {:ok, {user, tokens_to_expire}}
      end
    end)
  end
end
