defmodule HeyiAm.Accounts.DeviceCode do
  use Ecto.Schema
  import Ecto.Query

  @device_code_size 32
  # Excluded: 0, O, 1, I to avoid ambiguity
  @user_code_chars ~c"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  @expiry_minutes 15
  schema "device_codes" do
    # Stores SHA-256 hash of the raw device_code (raw is never persisted)
    field :device_code, :binary
    field :user_code, :string
    field :status, :string, default: "pending"
    field :expires_at, :utc_datetime
    belongs_to :user, HeyiAm.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end

  @doc """
  Builds a new device code struct (not yet inserted).
  Returns `{raw_device_code, %DeviceCode{}}` where the struct contains the hashed device_code.
  """
  def build do
    raw = :crypto.strong_rand_bytes(@device_code_size)
    hashed = hash(raw)

    expires_at =
      DateTime.utc_now()
      |> DateTime.add(@expiry_minutes * 60, :second)
      |> DateTime.truncate(:second)

    {raw,
     %__MODULE__{
       device_code: hashed,
       user_code: generate_user_code(),
       status: "pending",
       expires_at: expires_at
     }}
  end

  @doc """
  Hashes a raw device code for storage/lookup.
  """
  def hash(raw_device_code) do
    :crypto.hash(:sha256, raw_device_code)
  end

  @doc """
  Returns true if the device code has expired.
  """
  def expired?(%__MODULE__{expires_at: expires_at}) do
    DateTime.compare(DateTime.utc_now(), expires_at) == :gt
  end

  @doc """
  Query for a pending, non-expired device code by user_code.
  """
  def by_user_code_query(user_code) do
    now = DateTime.utc_now()

    from dc in __MODULE__,
      where: dc.user_code == ^user_code,
      where: dc.status == "pending",
      where: dc.expires_at > ^now
  end

  defp generate_user_code do
    chars = @user_code_chars
    part = fn -> Enum.map(1..4, fn _ -> Enum.random(chars) end) |> List.to_string() end
    "#{part.()}-#{part.()}"
  end
end
