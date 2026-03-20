defmodule HeyiAm.Portfolios.PortfolioSession do
  use Ecto.Schema
  import Ecto.Changeset

  schema "portfolio_sessions" do
    field :project_name, :string
    field :position, :integer
    field :visible, :boolean, default: true

    belongs_to :user, HeyiAm.Accounts.User
    belongs_to :share, HeyiAm.Shares.Share

    timestamps(type: :utc_datetime)
  end

  def changeset(portfolio_session, attrs) do
    portfolio_session
    |> cast(attrs, [:user_id, :share_id, :project_name, :position, :visible])
    |> validate_required([:user_id, :share_id])
    |> unique_constraint([:user_id, :share_id])
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:share_id)
  end
end
