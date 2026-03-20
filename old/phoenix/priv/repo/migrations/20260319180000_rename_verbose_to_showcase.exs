defmodule HeyiAm.Repo.Migrations.RenameVerboseToShowcase do
  use Ecto.Migration

  def up do
    execute "UPDATE users SET portfolio_layout = 'showcase' WHERE portfolio_layout = 'verbose'"
  end

  def down do
    execute "UPDATE users SET portfolio_layout = 'verbose' WHERE portfolio_layout = 'showcase'"
  end
end
