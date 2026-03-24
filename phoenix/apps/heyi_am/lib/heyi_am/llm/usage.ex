defmodule HeyiAm.LLM.Usage do
  use Ecto.Schema
  import Ecto.Changeset

  @valid_statuses ~w(success error)

  schema "enhancement_usage" do
    belongs_to :user, HeyiAm.Accounts.User
    field :provider, :string
    field :model, :string
    field :input_tokens, :integer, default: 0
    field :output_tokens, :integer, default: 0
    field :estimated_cost_cents, :integer, default: 0
    field :duration_ms, :integer, default: 0
    field :status, :string
    field :error_code, :string

    timestamps(updated_at: false, type: :utc_datetime)
  end

  def changeset(usage, attrs) do
    usage
    |> cast(attrs, [
      :user_id, :provider, :model, :input_tokens, :output_tokens,
      :estimated_cost_cents, :duration_ms, :status, :error_code
    ])
    |> validate_required([:user_id, :provider, :model, :status])
    |> validate_inclusion(:status, @valid_statuses)
  end
end
