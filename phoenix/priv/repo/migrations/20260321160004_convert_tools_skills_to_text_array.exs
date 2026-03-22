defmodule HeyiAm.Repo.Migrations.ConvertToolsSkillsToTextArray do
  use Ecto.Migration

  def up do
    # Step 1: Add temporary text[] columns
    execute "ALTER TABLE shares ADD COLUMN tools_new text[] DEFAULT '{}'"
    execute "ALTER TABLE shares ADD COLUMN skills_new text[] DEFAULT '{}'"

    # Step 2: Populate from jsonb using a subquery
    execute """
    UPDATE shares SET
      tools_new = (SELECT array_agg(elem) FROM jsonb_array_elements_text(COALESCE(tools, '[]'::jsonb)) AS elem),
      skills_new = (SELECT array_agg(elem) FROM jsonb_array_elements_text(COALESCE(skills, '[]'::jsonb)) AS elem)
    """

    # Step 3: Drop old columns and rename new ones
    execute "ALTER TABLE shares DROP COLUMN tools"
    execute "ALTER TABLE shares DROP COLUMN skills"
    execute "ALTER TABLE shares RENAME COLUMN tools_new TO tools"
    execute "ALTER TABLE shares RENAME COLUMN skills_new TO skills"
  end

  def down do
    execute "ALTER TABLE shares ADD COLUMN tools_new jsonb DEFAULT '[]'::jsonb"
    execute "ALTER TABLE shares ADD COLUMN skills_new jsonb DEFAULT '[]'::jsonb"

    execute """
    UPDATE shares SET
      tools_new = to_jsonb(COALESCE(tools, '{}')),
      skills_new = to_jsonb(COALESCE(skills, '{}'))
    """

    execute "ALTER TABLE shares DROP COLUMN tools"
    execute "ALTER TABLE shares DROP COLUMN skills"
    execute "ALTER TABLE shares RENAME COLUMN tools_new TO tools"
    execute "ALTER TABLE shares RENAME COLUMN skills_new TO skills"
  end
end
