defmodule HeyiAm.Accounts.ApiToken do
  @moduledoc """
  Long-lived API tokens for CLI authentication.
  Tokens are hashed with SHA-256 before storage -- the plaintext is shown
  once at creation time and cannot be recovered.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @hash_algorithm :sha256
  @token_bytes 32

  schema "api_tokens" do
    field :hashed_token, :binary
    field :label, :string, default: "ccs-cli"
    field :last_used_at, :utc_datetime
    field :expires_at, :utc_datetime

    # Virtual: plaintext token, available only at creation time
    field :token, :string, virtual: true, redact: true

    belongs_to :user, HeyiAm.Accounts.User

    timestamps(type: :utc_datetime)
  end

  @doc """
  Creates a new API token for the given user.
  Returns `{changeset, plaintext_token}` -- the plaintext must be captured
  before the changeset is inserted.
  """
  def create_changeset(user, attrs \\ %{}) do
    raw_token = generate_token()
    hashed = hash_token(raw_token)

    changeset =
      %__MODULE__{}
      |> cast(attrs, [:label, :expires_at])
      |> put_change(:user_id, user.id)
      |> put_change(:hashed_token, hashed)
      |> put_change(:token, raw_token)
      |> validate_required([:user_id, :hashed_token])
      |> unique_constraint(:hashed_token)
      |> foreign_key_constraint(:user_id)

    {changeset, raw_token}
  end

  @doc """
  Hash a raw token for lookup or storage.
  """
  def hash_token(token) when is_binary(token) do
    :crypto.hash(@hash_algorithm, token)
  end

  defp generate_token do
    :crypto.strong_rand_bytes(@token_bytes)
    |> Base.url_encode64(padding: false)
  end
end
