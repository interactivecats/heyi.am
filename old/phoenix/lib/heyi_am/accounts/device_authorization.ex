defmodule HeyiAm.Accounts.DeviceAuthorization do
  use Ecto.Schema
  import Ecto.Changeset

  # Characters excluding ambiguous ones: 0/O, 1/I/L
  @user_code_alphabet ~c"23456789ABCDEFGHJKMNPQRSTUVWXYZ"
  @user_code_length 6
  @device_code_bytes 32
  @expiry_minutes 10

  schema "device_authorizations" do
    field :device_code, :string
    field :user_code, :string
    field :status, :string, default: "pending"
    field :expires_at, :utc_datetime
    field :api_token_plaintext, :string, redact: true

    belongs_to :user, HeyiAm.Accounts.User

    timestamps(type: :utc_datetime)
  end

  @doc """
  Changeset for creating a new pending device authorization.
  Generates device_code, user_code, and sets expiry.
  """
  def create_changeset do
    now = DateTime.utc_now(:second)
    expires_at = DateTime.add(now, @expiry_minutes, :minute)

    %__MODULE__{}
    |> change(%{
      device_code: generate_device_code(),
      user_code: generate_user_code(),
      status: "pending",
      expires_at: expires_at
    })
    |> validate_required([:device_code, :user_code, :status, :expires_at])
    |> unique_constraint(:device_code)
    |> unique_constraint(:user_code)
    |> check_constraint(:status, name: :valid_status)
  end

  @doc """
  Changeset for approving a device authorization.
  Links the user and stores the plaintext API token temporarily
  so the polling CLI can retrieve it once.
  """
  def authorize_changeset(device_auth, user, api_token_plaintext) do
    device_auth
    |> change(%{
      user_id: user.id,
      api_token_plaintext: api_token_plaintext,
      status: "authorized"
    })
    |> foreign_key_constraint(:user_id)
    |> check_constraint(:status, name: :valid_status)
  end

  @doc """
  Changeset to clear the plaintext token after CLI retrieval.
  """
  def clear_token_changeset(device_auth) do
    change(device_auth, api_token_plaintext: nil)
  end

  @doc """
  Changeset for expiring a device authorization.
  """
  def expire_changeset(device_auth) do
    change(device_auth, status: "expired", api_token_plaintext: nil)
  end

  @doc """
  Check if a device authorization has expired based on its expires_at field.
  """
  def expired?(%__MODULE__{expires_at: expires_at}) do
    DateTime.compare(DateTime.utc_now(:second), expires_at) != :lt
  end

  defp generate_device_code do
    :crypto.strong_rand_bytes(@device_code_bytes)
    |> Base.url_encode64(padding: false)
  end

  defp generate_user_code do
    alphabet = List.to_tuple(@user_code_alphabet)
    alphabet_size = tuple_size(alphabet)

    :crypto.strong_rand_bytes(@user_code_length)
    |> :binary.bin_to_list()
    |> Enum.map(fn byte -> elem(alphabet, rem(byte, alphabet_size)) end)
    |> List.to_string()
  end
end
