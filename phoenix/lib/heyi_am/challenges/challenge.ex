defmodule HeyiAm.Challenges.Challenge do
  use Ecto.Schema
  import Ecto.Changeset

  @valid_statuses ~w(draft active closed)

  schema "challenges" do
    field :title, :string
    field :problem_statement, :string
    field :evaluation_criteria, {:array, :map}, default: []
    field :time_limit_minutes, :integer
    field :access_code, :string, virtual: true, redact: true
    field :access_code_hash, :string, redact: true
    field :slug, :string
    field :max_responses, :integer
    field :status, :string, default: "draft"

    belongs_to :creator, HeyiAm.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(challenge, attrs) do
    challenge
    |> cast(attrs, [
      :title,
      :problem_statement,
      :evaluation_criteria,
      :time_limit_minutes,
      :access_code,
      :max_responses,
      :status
    ])
    |> validate_required([:title, :problem_statement])
    |> validate_length(:title, min: 3, max: 200)
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_number(:time_limit_minutes, greater_than: 0)
    |> validate_number(:max_responses, greater_than: 0)
    |> maybe_hash_access_code()
    |> put_slug_if_missing()
    |> unique_constraint(:slug)
  end

  def status_changeset(challenge, status) when status in @valid_statuses do
    change(challenge, status: status)
  end

  defp maybe_hash_access_code(changeset) do
    access_code = get_change(changeset, :access_code)

    if access_code && access_code != "" do
      changeset
      |> put_change(:access_code_hash, Bcrypt.hash_pwd_salt(access_code))
      |> delete_change(:access_code)
    else
      changeset
    end
  end

  defp put_slug_if_missing(changeset) do
    if get_field(changeset, :slug) do
      changeset
    else
      put_change(changeset, :slug, generate_slug())
    end
  end

  def generate_slug do
    :crypto.strong_rand_bytes(8) |> Base.url_encode64(padding: false)
  end

  def valid_access_code?(%__MODULE__{access_code_hash: hash}, code)
      when is_binary(hash) and byte_size(code) > 0 do
    Bcrypt.verify_pass(code, hash)
  end

  def valid_access_code?(_, _) do
    Bcrypt.no_user_verify()
    false
  end

  def has_access_code?(%__MODULE__{access_code_hash: hash}) when is_binary(hash), do: true
  def has_access_code?(_), do: false
end
