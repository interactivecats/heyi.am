defmodule HeyiAm.Repo.Migrations.AddArchivedStatusToShares do
  use Ecto.Migration

  def up do
    # Drop both possible constraint names (valid_status from Ecto, shares_status_check if re-created)
    execute "ALTER TABLE shares DROP CONSTRAINT IF EXISTS valid_status"
    execute "ALTER TABLE shares DROP CONSTRAINT IF EXISTS shares_status_check"

    execute """
    ALTER TABLE shares ADD CONSTRAINT valid_status
    CHECK (status IN ('draft', 'listed', 'unlisted', 'archived'))
    """
  end

  def down do
    execute "UPDATE shares SET status = 'draft' WHERE status = 'archived'"
    execute "ALTER TABLE shares DROP CONSTRAINT IF EXISTS valid_status"

    execute """
    ALTER TABLE shares ADD CONSTRAINT valid_status
    CHECK (status IN ('draft', 'listed', 'unlisted'))
    """
  end
end
