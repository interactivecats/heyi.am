defmodule HeyiAm.Repo.Migrations.UpdatePortfolioLayoutValues do
  use Ecto.Migration

  def up do
    # Consolidate old layout values to new 6-template system
    execute """
    UPDATE users SET portfolio_layout = 'editorial'
    WHERE portfolio_layout IN ('engineer', 'showcase', 'timeline', 'highlights', 'dense', 'skills')
    """
    # 'minimal' stays as-is (already a valid new value)
  end

  def down do
    execute """
    UPDATE users SET portfolio_layout = 'highlights'
    WHERE portfolio_layout = 'editorial'
    """
  end
end
