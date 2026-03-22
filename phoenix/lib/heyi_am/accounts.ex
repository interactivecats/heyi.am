defmodule HeyiAm.Accounts do
  @moduledoc """
  The Accounts context.
  """

  import Ecto.Query, warn: false
  alias HeyiAm.Repo

  alias HeyiAm.Accounts.{User, UserToken, UserNotifier}

  ## Database getters

  @doc """
  Gets a user by email.

  ## Examples

      iex> get_user_by_email("foo@example.com")
      %User{}

      iex> get_user_by_email("unknown@example.com")
      nil

  """
  def get_user_by_email(email) when is_binary(email) do
    Repo.get_by(User, email: email)
  end

  @doc """
  Gets a user by username.

  ## Examples

      iex> get_user_by_username("alice")
      %User{}

      iex> get_user_by_username("nonexistent")
      nil

  """
  def get_user_by_username(username) when is_binary(username) do
    Repo.get_by(User, username: username)
  end

  @doc """
  Gets a user by email and password.

  ## Examples

      iex> get_user_by_email_and_password("foo@example.com", "correct_password")
      %User{}

      iex> get_user_by_email_and_password("foo@example.com", "invalid_password")
      nil

  """
  def get_user_by_email_and_password(email, password)
      when is_binary(email) and is_binary(password) do
    user = Repo.get_by(User, email: email)
    if User.valid_password?(user, password), do: user
  end

  @doc """
  Gets a single user.

  Raises `Ecto.NoResultsError` if the User does not exist.

  ## Examples

      iex> get_user!(123)
      %User{}

      iex> get_user!(456)
      ** (Ecto.NoResultsError)

  """
  def get_user!(id), do: Repo.get!(User, id)

  ## GitHub OAuth

  @doc """
  Finds an existing user by `github_id`, or creates a new one from GitHub OAuth data.

  Never auto-links by email — always matches on `github_id`.

  ## Examples

      iex> find_or_create_from_github(%{github_id: 123, email: "a@b.com", ...})
      {:ok, %User{}}

  """
  def find_or_create_from_github(%{github_id: github_id} = attrs) when is_integer(github_id) do
    case Repo.get_by(User, github_id: github_id) do
      nil ->
        changeset =
          %User{}
          |> User.github_changeset(attrs)
          |> User.confirm_changeset()

        case Repo.insert(changeset) do
          {:ok, user} ->
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

  @doc """
  Registers a user with email and password, auto-confirming the account.

  ## Examples

      iex> register_user(%{email: "a@b.com", password: "validpassword1"})
      {:ok, %User{}}

      iex> register_user(%{email: "bad"})
      {:error, %Ecto.Changeset{}}

  """
  def register_user(attrs) do
    %User{}
    |> User.registration_changeset(attrs)
    |> Repo.insert()
  end

  ## Settings

  @doc """
  Checks whether the user is in sudo mode.

  The user is in sudo mode when the last authentication was done no further
  than 20 minutes ago. The limit can be given as second argument in minutes.
  """
  def sudo_mode?(user, minutes \\ -20)

  def sudo_mode?(%User{authenticated_at: ts}, minutes) when is_struct(ts, DateTime) do
    DateTime.after?(ts, DateTime.utc_now() |> DateTime.add(minutes, :minute))
  end

  def sudo_mode?(_user, _minutes), do: false

  @doc """
  Returns an `%Ecto.Changeset{}` for changing the user email.

  See `HeyiAm.Accounts.User.email_changeset/3` for a list of supported options.

  ## Examples

      iex> change_user_email(user)
      %Ecto.Changeset{data: %User{}}

  """
  def change_user_email(user, attrs \\ %{}, opts \\ []) do
    User.email_changeset(user, attrs, opts)
  end

  @doc """
  Updates the user email using the given token.

  If the token matches, the user email is updated and the token is deleted.
  """
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

  @doc """
  Returns an `%Ecto.Changeset{}` for changing the user password.

  See `HeyiAm.Accounts.User.password_changeset/3` for a list of supported options.

  ## Examples

      iex> change_user_password(user)
      %Ecto.Changeset{data: %User{}}

  """
  def change_user_password(user, attrs \\ %{}, opts \\ []) do
    User.password_changeset(user, attrs, opts)
  end

  @doc """
  Updates the user password.

  Returns a tuple with the updated user, as well as a list of expired tokens.

  ## Examples

      iex> update_user_password(user, %{password: ...})
      {:ok, {%User{}, [...]}}

      iex> update_user_password(user, %{password: "too short"})
      {:error, %Ecto.Changeset{}}

  """
  def update_user_password(user, attrs) do
    user
    |> User.password_changeset(attrs)
    |> update_user_and_delete_all_tokens()
  end

  ## Session

  @doc """
  Generates a session token.
  """
  def generate_user_session_token(user) do
    {token, user_token} = UserToken.build_session_token(user)
    Repo.insert!(user_token)
    token
  end

  @doc """
  Gets the user with the given signed token.

  If the token is valid `{user, token_inserted_at}` is returned, otherwise `nil` is returned.
  """
  def get_user_by_session_token(token) do
    {:ok, query} = UserToken.verify_session_token_query(token)
    Repo.one(query)
  end

  @doc ~S"""
  Delivers the update email instructions to the given user.

  ## Examples

      iex> deliver_user_update_email_instructions(user, current_email, &url(~p"/users/settings/confirm-email/#{&1}"))
      {:ok, %{to: ..., body: ...}}

  """
  def deliver_user_update_email_instructions(%User{} = user, current_email, update_email_url_fun)
      when is_function(update_email_url_fun, 1) do
    {encoded_token, user_token} = UserToken.build_email_token(user, "change:#{current_email}")

    Repo.insert!(user_token)
    UserNotifier.deliver_update_email_instructions(user, update_email_url_fun.(encoded_token))
  end

  @doc """
  Deletes the signed token with the given context.
  """
  def delete_user_session_token(token) do
    Repo.delete_all(from(UserToken, where: [token: ^token, context: "session"]))
    :ok
  end

  ## Device Authorization

  alias HeyiAm.Accounts.DeviceCode

  @doc """
  Creates a new device code for the device authorization flow.
  Returns `{raw_device_code, %DeviceCode{}}`.
  """
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

  @doc """
  Authorizes a pending device code by user_code, linking it to the given user.
  Returns `{:ok, %DeviceCode{}}` or `{:error, :not_found}`.
  """
  def authorize_device_code(user_code, user) do
    user_code = user_code |> String.trim() |> String.upcase()

    case Repo.one(DeviceCode.by_user_code_query(user_code)) do
      nil ->
        {:error, :not_found}

      %DeviceCode{} = dc ->
        dc
        |> Ecto.Changeset.change(%{status: "authorized", user_id: user.id})
        |> Repo.update()
    end
  end

  @doc """
  Polls a device code for authorization status.

  Returns:
  - `{:ok, {session_token, user}}` when authorized (token is raw binary)
  - `{:error, :authorization_pending}` when still pending
  - `{:error, :expired_token}` when expired
  - `{:error, :access_denied}` when denied
  - `{:error, :not_found}` when not found
  """
  def poll_device_code(raw_device_code) do
    hashed = DeviceCode.hash(raw_device_code)

    # Atomic delete-and-select: only one concurrent caller can claim the row
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
        # Not authorized — check why
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

  @doc """
  Returns an `%Ecto.Changeset{}` for changing profile fields.
  """
  def change_user_profile(user, attrs \\ %{}) do
    User.profile_changeset(user, attrs)
  end

  @doc """
  Updates the user profile.
  """
  def update_user_profile(user, attrs) do
    user
    |> User.profile_changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for changing the username.
  """
  def change_user_username(user, attrs \\ %{}, opts \\ []) do
    User.username_changeset(user, attrs, opts)
  end

  @doc """
  Updates the user username.
  """
  def update_user_username(user, attrs) do
    user
    |> User.username_changeset(attrs)
    |> Repo.update()
  end

  ## GDPR

  def export_user_data(%User{} = user) do
    shares = HeyiAm.Shares.list_shares_for_user(user.id)
    portfolio_sessions = HeyiAm.Portfolios.list_portfolio_sessions(user.id)
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
      shares: Enum.map(shares, &share_to_export/1),
      portfolio_sessions: Enum.map(portfolio_sessions, &portfolio_session_to_export/1)
    }}
  end

  def delete_user_account(%User{} = user) do
    Repo.transact(fn ->
      # Anonymize shares — strip PII, keep aggregate stats
      from(s in HeyiAm.Shares.Share,
        where: s.user_id == ^user.id,
        update: [set: [
          user_id: nil,
          title: "deleted",
          dev_take: nil,
          narrative: nil,
          project_name: nil,
          beats: fragment("'[]'::jsonb"),
          qa_pairs: fragment("'[]'::jsonb"),
          highlights: fragment("'[]'::jsonb"),
          tool_breakdown: fragment("'[]'::jsonb"),
          top_files: fragment("'[]'::jsonb"),
          transcript_excerpt: fragment("'[]'::jsonb"),
          signature: nil,
          public_key: nil,
          sealed: false,
          status: "unlisted",
          token: fragment("'deleted-' || gen_random_uuid()::text")
        ]]
      )
      |> Repo.update_all([])

      # Anonymize portfolio sessions — strip project_name, keep structure for stats
      Repo.update_all(
        from(ps in HeyiAm.Portfolios.PortfolioSession, where: ps.user_id == ^user.id),
        set: [project_name: nil]
      )

      # Delete all session tokens (security)
      Repo.delete_all(from(t in UserToken, where: t.user_id == ^user.id))

      # Anonymize user record — frees username and email for re-registration
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
      verified_at: share.verified_at,
      sealed: share.sealed,
      template: share.template,
      language: share.language,
      tools: share.tools,
      skills: share.skills,
      beats: share.beats,
      qa_pairs: share.qa_pairs,
      highlights: share.highlights,
      tool_breakdown: share.tool_breakdown,
      top_files: share.top_files,
      transcript_excerpt: share.transcript_excerpt,
      narrative: share.narrative,
      project_name: share.project_name,
      signature: share.signature,
      public_key: share.public_key,
      status: share.status,
      inserted_at: share.inserted_at
    }
  end

  defp portfolio_session_to_export(ps) do
    %{
      project_name: ps.project_name,
      position: ps.position,
      visible: ps.visible,
      share_id: ps.share_id,
      inserted_at: ps.inserted_at
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
