defmodule HeyiAm.Accounts do
  @moduledoc """
  The Accounts context.
  """

  import Ecto.Query, warn: false
  alias HeyiAm.Repo

  alias HeyiAm.Accounts.{User, UserToken, UserNotifier, DeviceAuthorization, ApiToken}

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

  ## User registration

  @doc """
  Registers a user.

  ## Examples

      iex> register_user(%{field: value})
      {:ok, %User{}}

      iex> register_user(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def register_user(attrs) do
    %User{}
    |> User.email_changeset(attrs)
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

  @doc """
  Gets the user with the given magic link token.
  """
  def get_user_by_magic_link_token(token) do
    with {:ok, query} <- UserToken.verify_magic_link_token_query(token),
         {user, _token} <- Repo.one(query) do
      user
    else
      _ -> nil
    end
  end

  @doc """
  Logs the user in by magic link.

  There are three cases to consider:

  1. The user has already confirmed their email. They are logged in
     and the magic link is expired.

  2. The user has not confirmed their email and no password is set.
     In this case, the user gets confirmed, logged in, and all tokens -
     including session ones - are expired. In theory, no other tokens
     exist but we delete all of them for best security practices.

  3. The user has not confirmed their email but a password is set.
     This cannot happen in the default implementation but may be the
     source of security pitfalls. See the "Mixing magic link and password registration" section of
     `mix help phx.gen.auth`.
  """
  def login_user_by_magic_link(token) do
    {:ok, query} = UserToken.verify_magic_link_token_query(token)

    case Repo.one(query) do
      # Prevent session fixation attacks by disallowing magic links for unconfirmed users with password
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
  Delivers the magic link login instructions to the given user.
  """
  def deliver_login_instructions(%User{} = user, magic_link_url_fun)
      when is_function(magic_link_url_fun, 1) do
    {encoded_token, user_token} = UserToken.build_email_token(user, "login")
    Repo.insert!(user_token)
    UserNotifier.deliver_login_instructions(user, magic_link_url_fun.(encoded_token))
  end

  @doc """
  Deletes the signed token with the given context.
  """
  def delete_user_session_token(token) do
    Repo.delete_all(from(UserToken, where: [token: ^token, context: "session"]))
    :ok
  end

  ## Profile & GitHub OAuth

  def get_user_by_username(username) do
    Repo.get_by(User, username: username)
  end

  def get_user_by_github_id(github_id) do
    Repo.get_by(User, github_id: github_id)
  end

  @doc """
  Find or create a user from GitHub OAuth data.

  Security: We never auto-link by email — GitHub emails are not guaranteed
  to be verified. A new GitHub user always gets a fresh account.
  """
  def find_or_create_from_github(%{id: github_id, login: login} = info) do
    case get_user_by_github_id(github_id) do
      nil ->
        email = info[:email]

        %User{}
        |> User.email_changeset(%{
          email: email || "#{github_id}+#{login}@users.noreply.github.com"
        })
        |> User.github_changeset(%{
          github_id: github_id,
          username: login,
          display_name: info[:name] || login,
          avatar_url: info[:avatar_url],
          github_url: "https://github.com/#{login}"
        })
        |> User.confirm_changeset()
        |> Repo.insert()

      user ->
        user
        |> User.github_changeset(%{
          display_name: info[:name] || user.display_name,
          avatar_url: info[:avatar_url] || user.avatar_url
        })
        |> Repo.update()
    end
  end

  def update_profile(user, attrs) do
    user
    |> User.profile_changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Link a machine token to a user account.
  Associates all unowned shares from that machine with this user.
  """
  def link_machine_token(user, machine_token) do
    query = from(s in HeyiAm.Shares.Share,
      where: s.machine_token == ^machine_token and is_nil(s.user_id)
    )

    Repo.transaction(fn ->
      shares_to_link = Repo.all(query)

      {count, _} = Repo.update_all(query, set: [user_id: user.id])

      for share <- shares_to_link do
        share = %{share | user_id: user.id}
        HeyiAm.Portfolios.auto_add_to_portfolio(user.id, share.id)
        HeyiAm.Projects.link_share_to_project(share)
      end

      count
    end)
  end

  ## Device Authorization (RFC 8628 style)

  @doc """
  Creates a new pending device authorization with generated codes and a 10-minute expiry.
  """
  def create_device_authorization do
    DeviceAuthorization.create_changeset()
    |> Repo.insert()
  end

  @doc """
  Looks up a pending, non-expired device authorization by user code.
  Returns nil if not found or expired.
  """
  def get_device_authorization_by_user_code(user_code) when is_binary(user_code) do
    normalized = String.upcase(String.trim(user_code))

    from(da in DeviceAuthorization,
      where: da.user_code == ^normalized,
      where: da.status == "pending",
      where: da.expires_at > ^DateTime.utc_now(:second)
    )
    |> Repo.one()
  end

  @doc """
  Approves a device authorization for the given user.
  Creates a long-lived API token (hashed in api_tokens table) and stores
  the plaintext temporarily on the device_auth record for CLI retrieval.
  Returns `{:ok, device_auth}` on success.
  """
  def authorize_device(%DeviceAuthorization{status: "pending"} = device_auth, %User{} = user) do
    if DeviceAuthorization.expired?(device_auth) do
      {:error, :expired}
    else
      {api_token_changeset, plaintext} = ApiToken.create_changeset(user, %{label: "ccs-cli"})

      Repo.transact(fn ->
        case Repo.insert(api_token_changeset) do
          {:ok, _api_token} ->
            case device_auth
                 |> DeviceAuthorization.authorize_changeset(user, plaintext)
                 |> Repo.update() do
              {:ok, updated_da} -> {:ok, updated_da}
              {:error, changeset} -> Repo.rollback(changeset)
            end

          {:error, changeset} ->
            Repo.rollback(changeset)
        end
      end)
    end
  end

  def authorize_device(%DeviceAuthorization{}, _user), do: {:error, :already_processed}

  @doc """
  Checks the status of a device authorization by device_code (polling endpoint).

  Returns:
  - `{:ok, :pending}` -- still waiting for user approval
  - `{:ok, :authorized, token, user}` -- approved; token is the plaintext API token.
    The plaintext is cleared from the record after this call (one-time retrieval).
  - `{:error, :expired}` -- device code expired
  - `{:error, :not_found}` -- invalid device code
  """
  def check_device_token(device_code) when is_binary(device_code) do
    case Repo.get_by(DeviceAuthorization, device_code: device_code) do
      nil ->
        {:error, :not_found}

      %DeviceAuthorization{status: "authorized", api_token_plaintext: token} = da
      when is_binary(token) ->
        user = Repo.get!(User, da.user_id)

        # Clear the plaintext after retrieval (one-time read)
        da |> DeviceAuthorization.clear_token_changeset() |> Repo.update()

        {:ok, :authorized, token, user}

      %DeviceAuthorization{status: "authorized"} = da ->
        # Token already retrieved -- still return authorized but without token
        user = Repo.get!(User, da.user_id)
        {:ok, :authorized, nil, user}

      %DeviceAuthorization{status: "expired"} ->
        {:error, :expired}

      %DeviceAuthorization{status: "pending"} = da ->
        if DeviceAuthorization.expired?(da) do
          da |> DeviceAuthorization.expire_changeset() |> Repo.update()
          {:error, :expired}
        else
          {:ok, :pending}
        end
    end
  end

  @doc """
  Looks up a user by their API token (Bearer auth).
  The token is hashed with SHA-256 before comparison.
  Also updates the last_used_at timestamp.
  Returns the user or nil.
  """
  def get_user_by_api_token(token) when is_binary(token) do
    hashed = ApiToken.hash_token(token)

    query =
      from(at in ApiToken,
        where: at.hashed_token == ^hashed,
        where: is_nil(at.expires_at) or at.expires_at > ^DateTime.utc_now(:second),
        join: u in assoc(at, :user),
        select: {u, at.id}
      )

    case Repo.one(query) do
      {user, token_id} ->
        # Update last_used_at in the background (non-blocking)
        from(at in ApiToken, where: at.id == ^token_id)
        |> Repo.update_all(set: [last_used_at: DateTime.utc_now(:second)])

        user

      nil ->
        nil
    end
  end

  @doc """
  Deletes expired device authorizations older than the given age.
  Defaults to cleaning up records expired more than 1 hour ago.
  """
  def cleanup_expired_device_authorizations(older_than_minutes \\ 60) do
    cutoff = DateTime.add(DateTime.utc_now(:second), -older_than_minutes, :minute)

    from(da in DeviceAuthorization,
      where: da.expires_at < ^cutoff,
      where: da.status in ["pending", "expired"]
    )
    |> Repo.delete_all()
  end

  ## Token helper

  defp update_user_and_delete_all_tokens(changeset) do
    Repo.transact(fn ->
      with {:ok, user} <- Repo.update(changeset) do
        tokens_to_expire = Repo.all_by(UserToken, user_id: user.id)

        Repo.delete_all(from(t in UserToken, where: t.id in ^Enum.map(tokens_to_expire, & &1.id)))

        {:ok, {user, tokens_to_expire}}
      end
    end)
  end
end
