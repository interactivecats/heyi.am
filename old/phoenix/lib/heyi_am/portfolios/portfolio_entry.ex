defmodule HeyiAm.Portfolios.PortfolioEntry do
  use Ecto.Schema
  import Ecto.Changeset

  schema "portfolio_entries" do
    field :pinned, :boolean, default: false
    field :position, :integer, default: 0
    field :visible, :boolean, default: true

    belongs_to :user, HeyiAm.Accounts.User
    belongs_to :share, HeyiAm.Shares.Share

    timestamps(type: :utc_datetime)
  end

  def changeset(entry, attrs) do
    entry
    |> cast(attrs, [:pinned, :position, :visible, :user_id, :share_id])
    |> validate_required([:user_id, :share_id])
    |> unique_constraint([:user_id, :share_id])
  end
end
