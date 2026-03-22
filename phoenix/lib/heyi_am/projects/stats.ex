defmodule HeyiAm.Projects.Stats do
  @moduledoc """
  Computes aggregate project data from session shares.

  All functions are pure computations — they accept lists of share maps
  and return computed results. No database queries.

  Expected share fields: :loc_changed, :recorded_at, :duration_minutes,
  :turns, :files_changed
  """

  @doc """
  Computes aggregate stats for a project's shares.

  Returns a map with :total_sessions, :total_loc, :total_duration,
  :total_turns, :unique_files, and :date_range.
  """
  @spec compute_project_stats([map()]) :: map()
  def compute_project_stats([]) do
    %{
      total_sessions: 0,
      total_loc: 0,
      total_duration: 0,
      total_turns: 0,
      unique_files: 0,
      date_range: nil
    }
  end

  def compute_project_stats(shares) do
    sorted = Enum.sort_by(shares, & &1.recorded_at, DateTime)

    %{
      total_sessions: length(shares),
      total_loc: Enum.sum(Enum.map(shares, &(Map.get(&1, :loc_changed) || 0))),
      total_duration: Enum.sum(Enum.map(shares, &(Map.get(&1, :duration_minutes) || 0))),
      total_turns: Enum.sum(Enum.map(shares, &(Map.get(&1, :turns) || 0))),
      unique_files: Enum.sum(Enum.map(shares, &(Map.get(&1, :files_changed) || 0))),
      date_range: {
        safe_to_date(List.first(sorted).recorded_at),
        safe_to_date(List.last(sorted).recorded_at)
      }
    }
  end

  defp safe_to_date(nil), do: Date.utc_today()
  defp safe_to_date(%DateTime{} = dt), do: DateTime.to_date(dt)
  defp safe_to_date(%NaiveDateTime{} = ndt), do: NaiveDateTime.to_date(ndt)
end
