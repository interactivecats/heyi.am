defmodule HeyiAm.Challenges.Challenge do
  use Ecto.Schema
  import Ecto.Changeset

  schema "challenges" do
    field :token, :string
    field :description, :string
    field :posted_by, :string
    field :is_private, :boolean, default: false
    field :access_code_hash, :string
    field :status, :string, default: "open"
    field :expires_at, :utc_datetime

    # Virtual field for setting the access code
    field :access_code, :string, virtual: true

    belongs_to :user, HeyiAm.Accounts.User
    has_many :shares, HeyiAm.Shares.Share

    timestamps(type: :utc_datetime)
  end

  @required_fields [:token, :user_id]
  @optional_fields [:description, :posted_by, :is_private, :access_code, :status, :expires_at]
  @valid_statuses ~w(open closed archived)

  def changeset(challenge, attrs) do
    challenge
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> unique_constraint(:token)
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_length(:description, max: 5000)
    |> validate_length(:posted_by, max: 200)
    |> maybe_hash_access_code()
  end

  defp maybe_hash_access_code(changeset) do
    case get_change(changeset, :access_code) do
      nil ->
        changeset

      code when is_binary(code) and byte_size(code) > 0 ->
        changeset
        |> put_change(:access_code_hash, Bcrypt.hash_pwd_salt(code))
        |> put_change(:is_private, true)
        |> delete_change(:access_code)

      _ ->
        changeset
    end
  end

  def valid_access_code?(%__MODULE__{access_code_hash: hash}, code)
      when is_binary(hash) and is_binary(code) do
    Bcrypt.verify_pass(code, hash)
  end

  def valid_access_code?(_, _), do: false
end
