defmodule HeyiAm.ChangesetHelpers do
  @moduledoc """
  Shared changeset validation helpers used across schemas.
  """

  import Ecto.Changeset

  @doc """
  Validates that a URL field uses http or https scheme.
  Blocks javascript:, data:, and other dangerous URI schemes.
  """
  def validate_url_scheme(changeset, field) do
    validate_change(changeset, field, fn _, url ->
      case URI.parse(url) do
        %URI{scheme: scheme} when scheme in ["http", "https"] -> []
        _ -> [{field, "must be an http or https URL"}]
      end
    end)
  end
end
