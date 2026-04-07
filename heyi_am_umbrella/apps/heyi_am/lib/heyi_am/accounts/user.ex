defmodule HeyiAm.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  # rendered_portfolio_html is intentionally excluded — it is only writable
  # via rendered_html_changeset/2 (CLI upload pipeline), never the profile API.
  @profile_fields ~w(display_name bio avatar_url github_url location status portfolio_layout portfolio_accent)a

  schema "users" do
    field :email, :string
    field :password, :string, virtual: true, redact: true
    field :hashed_password, :string, redact: true
    field :confirmed_at, :utc_datetime
    field :authenticated_at, :utc_datetime, virtual: true

    field :username, :string
    field :display_name, :string
    field :bio, :string
    field :avatar_url, :string
    field :github_id, :integer
    field :github_url, :string
    field :location, :string
    field :status, :string
    field :portfolio_layout, :string, default: "editorial"
    field :portfolio_accent, :string
    field :time_stats, :map
    field :rendered_portfolio_html, :string

    timestamps(type: :utc_datetime)
  end

  @doc """
  A user changeset for registering or changing the email.

  It requires the email to change otherwise an error is added.

  ## Options

    * `:validate_unique` - Set to false if you don't want to validate the
      uniqueness of the email, useful when displaying live validations.
      Defaults to `true`.
  """
  def email_changeset(user, attrs, opts \\ []) do
    user
    |> cast(attrs, [:email])
    |> validate_email(opts)
  end

  defp validate_email(changeset, opts) do
    changeset =
      changeset
      |> validate_required([:email])
      |> validate_format(:email, ~r/^[^@,;\s]+@[^@,;\s]+$/,
        message: "must have the @ sign and no spaces"
      )
      |> validate_length(:email, max: 160)

    if Keyword.get(opts, :validate_unique, true) do
      changeset
      |> unsafe_validate_unique(:email, HeyiAm.Repo)
      |> unique_constraint(:email)
      |> validate_email_changed()
    else
      changeset
    end
  end

  defp validate_email_changed(changeset) do
    if get_field(changeset, :email) && get_change(changeset, :email) == nil do
      add_error(changeset, :email, "did not change")
    else
      changeset
    end
  end

  @doc """
  A user changeset for changing the password.

  ## Options

    * `:hash_password` - Hashes the password so it can be stored securely
      in the database and ensures the password field is cleared to prevent
      leaks in the logs. If password hashing is not needed and clearing the
      password field is not desired (like when using this changeset for
      validations on a LiveView form), this option can be set to `false`.
      Defaults to `true`.
  """
  def password_changeset(user, attrs, opts \\ []) do
    user
    |> cast(attrs, [:password])
    |> validate_confirmation(:password, message: "does not match password")
    |> validate_password(opts)
  end

  defp validate_password(changeset, opts) do
    changeset
    |> validate_required([:password])
    |> validate_length(:password, min: 12, max: 72)
    |> maybe_hash_password(opts)
  end

  defp maybe_hash_password(changeset, opts) do
    hash_password? = Keyword.get(opts, :hash_password, true)
    password = get_change(changeset, :password)

    if hash_password? && password && changeset.valid? do
      changeset
      |> validate_length(:password, max: 72, count: :bytes)
      |> put_change(:hashed_password, Bcrypt.hash_pwd_salt(password))
      |> delete_change(:password)
    else
      changeset
    end
  end

  @doc """
  A changeset for registration with email + password, auto-confirmed.
  """
  def registration_changeset(user, attrs) do
    changeset =
      user
      |> cast(attrs, [:email, :password, :username])
      |> validate_email(validate_unique: true)
      |> validate_password(hash_password: true)
      |> confirm_changeset()

    # Validate username only when provided (optional at registration)
    if get_change(changeset, :username) do
      changeset
      |> validate_length(:username, min: 3, max: 39)
      |> validate_format(:username, ~r/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/,
        message: "must be lowercase alphanumeric and hyphens, cannot start or end with a hyphen"
      )
      |> validate_format(:username, ~r/^[a-z0-9-]+$/,
        message: "must contain only lowercase letters, numbers, and hyphens"
      )
      |> unsafe_validate_unique(:username, HeyiAm.Repo)
      |> unique_constraint(:username)
    else
      changeset
    end
  end

  @doc """
  Confirms the account by setting `confirmed_at`.
  """
  def confirm_changeset(%Ecto.Changeset{} = changeset) do
    put_change(changeset, :confirmed_at, DateTime.utc_now(:second))
  end

  def confirm_changeset(user) do
    now = DateTime.utc_now(:second)
    change(user, confirmed_at: now)
  end

  @doc """
  Verifies the password.

  If there is no user or the user doesn't have a password, we call
  `Bcrypt.no_user_verify/0` to avoid timing attacks.
  """
  def valid_password?(%HeyiAm.Accounts.User{hashed_password: hashed_password}, password)
      when is_binary(hashed_password) and byte_size(password) > 0 do
    Bcrypt.verify_pass(password, hashed_password)
  end

  def valid_password?(_, _) do
    Bcrypt.no_user_verify()
    false
  end

  @doc """
  A changeset for creating or updating a user from GitHub OAuth.
  """
  def github_changeset(user, attrs) do
    user
    |> cast(attrs, [:email, :github_id, :github_url, :display_name, :avatar_url])
    |> validate_required([:email, :github_id])
    |> unique_constraint(:email)
    |> unique_constraint(:github_id)
  end

  @doc """
  A changeset for updating profile fields.
  """
  def profile_changeset(user, attrs) do
    user
    |> cast(attrs, @profile_fields)
    |> validate_length(:display_name, max: 100)
    |> validate_length(:bio, max: 500)
    |> validate_length(:location, max: 100)
    |> validate_length(:status, max: 100)
    |> validate_length(:portfolio_layout, max: 64)
    |> validate_format(:portfolio_layout, ~r/\A[a-z0-9][a-z0-9-]*\z/,
      message: "must be lowercase alphanumeric with hyphens"
    )
    |> validate_url_scheme(:avatar_url)
    |> validate_url_scheme(:github_url)
  end

  defp validate_url_scheme(changeset, field) do
    validate_change(changeset, field, fn _, value ->
      case URI.parse(value) do
        %{scheme: scheme} when scheme in ["https", "http"] -> []
        _ -> [{field, "must be an http or https URL"}]
      end
    end)
  end

  @doc """
  A changeset for updating rendered HTML from the CLI upload pipeline only.
  This is separate from profile_changeset to prevent stored XSS via the profile API.
  """
  def rendered_html_changeset(user, attrs) do
    sanitized = sanitize_portfolio_html(attrs)

    user
    |> cast(sanitized, [:rendered_portfolio_html])
  end

  defp sanitize_portfolio_html(%{"rendered_portfolio_html" => html} = attrs) when is_binary(html) do
    Map.put(attrs, "rendered_portfolio_html", HeyiAm.HtmlSanitizer.sanitize(html))
  end
  defp sanitize_portfolio_html(%{rendered_portfolio_html: html} = attrs) when is_binary(html) do
    Map.put(attrs, :rendered_portfolio_html, HeyiAm.HtmlSanitizer.sanitize(html))
  end
  defp sanitize_portfolio_html(attrs), do: attrs

  @doc """
  A changeset for setting or updating the username.
  """
  def username_changeset(user, attrs, opts \\ []) do
    changeset =
      user
      |> cast(attrs, [:username])
      |> validate_required([:username])
      |> validate_length(:username, min: 3, max: 39)
      |> validate_format(:username, ~r/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/,
        message: "must be lowercase alphanumeric and hyphens, cannot start or end with a hyphen"
      )
      |> validate_format(:username, ~r/^[a-z0-9-]+$/,
        message: "must contain only lowercase letters, numbers, and hyphens"
      )

    if Keyword.get(opts, :validate_unique, true) do
      changeset
      |> unsafe_validate_unique(:username, HeyiAm.Repo)
      |> unique_constraint(:username)
    else
      changeset
    end
  end
end
