defmodule HeyiAm.Projects do
  @moduledoc """
  Computes aggregate project data from session shares.

  All functions are pure computations — they accept lists of share maps
  and return computed results. No database queries.

  Expected share fields: :loc_changed, :recorded_at, :top_files, :token,
  :duration_minutes, :turns, :files_changed
  """

  @doc """
  Computes cumulative lines of code over time from a list of shares.

  Returns a list of `%{date: date, loc: cumulative_loc}` sorted by date.
  """
  @spec compute_cumulative_loc([map()]) :: [%{date: Date.t(), loc: integer()}]
  def compute_cumulative_loc([]), do: []

  def compute_cumulative_loc(shares) do
    shares
    |> Enum.sort_by(& &1.recorded_at, DateTime)
    |> Enum.scan({nil, 0}, fn share, {_prev_date, acc} ->
      {share.recorded_at, acc + (share.loc_changed || 0)}
    end)
    |> Enum.map(fn {recorded_at, cumulative} ->
      %{date: DateTime.to_date(recorded_at), loc: cumulative}
    end)
  end

  @doc """
  Computes a file heatmap grouped by directory.

  Returns `%{dir_name => %{session_token => touch_count}}`.
  Files are grouped by their first path component (directory).
  """
  @spec compute_file_heatmap([map()]) :: %{String.t() => %{String.t() => non_neg_integer()}}
  def compute_file_heatmap([]), do: %{}

  def compute_file_heatmap(shares) do
    Enum.reduce(shares, %{}, fn share, acc ->
      files = share[:top_files] || []
      token = share.token

      Enum.reduce(files, acc, fn file, inner_acc ->
        dir = extract_directory(file)

        inner_acc
        |> Map.put_new(dir, %{})
        |> update_in([dir, token], &((&1 || 0) + 1))
      end)
    end)
  end

  @doc """
  Detects session overlap based on shared files.

  Returns a list of `{token1, token2, shared_files}` for pairs with overlap.
  """
  @spec compute_session_overlap([map()]) :: [{String.t(), String.t(), [String.t()]}]
  def compute_session_overlap(shares) when length(shares) < 2, do: []

  def compute_session_overlap(shares) do
    indexed =
      shares
      |> Enum.map(fn share -> {share.token, MapSet.new(share[:top_files] || [])} end)

    for {token1, files1} <- indexed,
        {token2, files2} <- indexed,
        token1 < token2,
        shared = MapSet.intersection(files1, files2),
        MapSet.size(shared) > 0 do
      {token1, token2, MapSet.to_list(shared)}
    end
  end

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
    all_files =
      shares
      |> Enum.flat_map(fn share -> share[:top_files] || [] end)
      |> MapSet.new()

    sorted = Enum.sort_by(shares, & &1.recorded_at, DateTime)

    %{
      total_sessions: length(shares),
      total_loc: Enum.sum(Enum.map(shares, &(&1[:loc_changed] || 0))),
      total_duration: Enum.sum(Enum.map(shares, &(&1[:duration_minutes] || 0))),
      total_turns: Enum.sum(Enum.map(shares, &(&1[:turns] || 0))),
      unique_files: MapSet.size(all_files),
      date_range: {
        DateTime.to_date(List.first(sorted).recorded_at),
        DateTime.to_date(List.last(sorted).recorded_at)
      }
    }
  end

  defp extract_directory(file_path) do
    case Path.split(file_path) do
      [dir | _rest] when dir != "" -> dir
      _ -> "."
    end
  end
end
