defmodule HeyiAm.Vibes.Vibe do
  use Ecto.Schema
  import Ecto.Changeset

  @valid_archetypes ~w(night-owl backseat-driver delegator cowboy overthinker speed-runner debugger diplomat architect pair-programmer marathon-runner scientist puppeteer weekend-warrior orchestrator minimalist secret-spiller vibe-coder)
  @valid_modifiers ~w(says-please codes-at-3am reads-5x-more never-tests cusses-under-pressure writes-essays lets-ai-cook asks-more-than-tells scope-creeps ships-on-weekends spawns-agents plans-first interrupts-often marathon-sessions one-word-prompts leaks-secrets)

  @max_stat_keys 50
  @max_stats_bytes 4_096

  schema "vibes" do
    field :short_id, :string
    field :delete_code, :string
    field :archetype_id, :string
    field :modifier_id, :string
    field :headline, :string
    field :narrative, :string
    field :stats, :map
    field :sources, {:array, :string}, default: []
    field :session_count, :integer
    field :total_turns, :integer
    field :anonymized_at, :utc_datetime

    timestamps(type: :utc_datetime)
  end

  @required ~w(short_id delete_code archetype_id narrative stats session_count total_turns)a
  @optional ~w(modifier_id headline sources)a

  def changeset(vibe, attrs) do
    vibe
    |> cast(attrs, @required ++ @optional)
    |> validate_required(@required)
    |> sanitize_text(:headline)
    |> sanitize_text(:narrative)
    |> validate_length(:short_id, max: 10)
    |> validate_length(:headline, max: 76)
    |> validate_length(:narrative, max: 500)
    |> validate_number(:session_count, greater_than: 0, less_than: 100_000)
    |> validate_number(:total_turns, greater_than_or_equal_to: 0, less_than: 10_000_000)
    |> validate_inclusion(:archetype_id, @valid_archetypes)
    |> validate_modifier()
    |> validate_stats()
    |> validate_sources()
    |> unique_constraint(:short_id)
  end

  # Strip control characters, null bytes, and HTML/XML tags from free-text fields.
  # HEEx auto-escapes on output, but this is defense-in-depth: we never store
  # markup or shell metacharacters in the first place.
  defp sanitize_text(changeset, field) do
    case get_change(changeset, field) do
      nil -> changeset
      value when is_binary(value) ->
        cleaned =
          value
          |> String.replace(~r/<[^>]*>/, "")           # strip HTML/XML tags
          |> String.replace(~r/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/, "")  # strip control chars (keep \n, \r, \t)
          |> String.trim()

        put_change(changeset, field, cleaned)
      _ -> changeset
    end
  end

  def valid_archetypes, do: @valid_archetypes
  def valid_modifiers, do: @valid_modifiers

  defp validate_modifier(changeset) do
    validate_change(changeset, :modifier_id, fn :modifier_id, value ->
      if is_nil(value) or value in @valid_modifiers,
        do: [],
        else: [modifier_id: "must be a known modifier"]
    end)
  end

  defp validate_stats(changeset) do
    validate_change(changeset, :stats, fn :stats, value ->
      cond do
        not is_map(value) ->
          [stats: "must be a map"]
        map_size(value) > @max_stat_keys ->
          [stats: "too many keys (max #{@max_stat_keys})"]
        byte_size(Jason.encode!(value)) > @max_stats_bytes ->
          [stats: "too large (max #{@max_stats_bytes} bytes)"]
        not Enum.all?(value, fn {_k, v} -> is_number(v) end) ->
          [stats: "all values must be numbers"]
        not Enum.all?(value, fn {k, _v} -> is_binary(k) and Regex.match?(~r/^[a-z_]{1,40}$/, k) end) ->
          [stats: "keys must be lowercase alpha/underscore, max 40 chars"]
        true ->
          []
      end
    end)
  end

  defp validate_sources(changeset) do
    validate_change(changeset, :sources, fn :sources, value ->
      valid = ~w(claude cursor codex gemini antigravity)
      if is_list(value) and Enum.all?(value, &(&1 in valid)),
        do: [],
        else: [sources: "must be a list of known tool names"]
    end)
  end
end
