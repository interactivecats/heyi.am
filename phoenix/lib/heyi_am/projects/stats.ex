defmodule HeyiAm.Projects.Stats do
  @moduledoc """
  Computes aggregate project data from session shares.

  All functions are pure computations — they accept lists of share maps
  and return computed results. No database queries.

  Expected share fields: :loc_changed, :recorded_at, :top_files, :token,
  :duration_minutes, :turns, :files_changed

  top_files entries can be either plain strings ("lib/app.ex") or maps
  with a "path" key (%{"path" => "lib/app.ex", "additions" => 10}).
  """

  @doc """
  Computes cumulative lines of code over time from a list of shares.

  Returns a list of `%{date: date, loc: cumulative_loc, title: title, loc_delta: delta}`
  sorted by date.
  """
  @spec compute_cumulative_loc([map()]) :: [map()]
  def compute_cumulative_loc([]), do: []

  def compute_cumulative_loc(shares) do
    shares
    |> Enum.sort_by(& &1.recorded_at, DateTime)
    |> Enum.scan({nil, 0, nil, 0}, fn share, {_prev_date, acc, _title, _delta} ->
      delta = Map.get(share, :loc_changed) || 0
      {share.recorded_at, acc + delta, Map.get(share, :title), delta}
    end)
    |> Enum.map(fn {recorded_at, cumulative, title, delta} ->
      %{date: DateTime.to_date(recorded_at), loc: cumulative, title: title, loc_delta: delta}
    end)
  end

  @doc """
  Computes a file heatmap grouped by directory.

  Returns `%{dir_name => %{session_token => touch_count}}`.
  Files are grouped by their logical directory (up to 2 levels deep for
  paths with 3+ components, e.g. "lib/heyi_am/" from "lib/heyi_am/accounts.ex").
  Absolute paths are normalized to project-relative paths first.
  """
  @spec compute_file_heatmap([map()]) :: %{String.t() => %{String.t() => non_neg_integer()}}
  def compute_file_heatmap([]), do: %{}

  def compute_file_heatmap(shares) do
    all_paths = collect_all_paths(shares)
    prefix = common_prefix(all_paths)

    all_dirs =
      Enum.reduce(shares, %{}, fn share, acc ->
        files = share.top_files || []
        token = share.token

        Enum.reduce(files, acc, fn file, inner_acc ->
          path = extract_path(file) |> strip_prefix(prefix)
          dir = extract_directory(path)

          inner_acc
          |> Map.put_new(dir, %{})
          |> update_in([dir, token], &((&1 || 0) + 1))
        end)
      end)

    # Keep only top 10 directories by total edit count
    all_dirs
    |> Enum.sort_by(fn {_dir, counts} -> -Enum.sum(Map.values(counts)) end)
    |> Enum.take(10)
    |> Map.new()
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
      |> Enum.map(fn share ->
        paths = (share.top_files || []) |> Enum.map(&extract_path/1)
        {share.token, MapSet.new(paths)}
      end)

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
      |> Enum.flat_map(fn share ->
        (share.top_files || []) |> Enum.map(&extract_path/1)
      end)
      |> MapSet.new()

    sorted = Enum.sort_by(shares, & &1.recorded_at, DateTime)

    %{
      total_sessions: length(shares),
      total_loc: Enum.sum(Enum.map(shares, &(Map.get(&1, :loc_changed) || 0))),
      total_duration: Enum.sum(Enum.map(shares, &(Map.get(&1, :duration_minutes) || 0))),
      total_turns: Enum.sum(Enum.map(shares, &(Map.get(&1, :turns) || 0))),
      unique_files: MapSet.size(all_files),
      date_range: {
        safe_to_date(List.first(sorted).recorded_at),
        safe_to_date(List.last(sorted).recorded_at)
      }
    }
  end

  @doc """
  Aggregates top files across all sessions.

  Returns a sorted list of `%{path: path, edits: count, loc: total_loc, sessions: session_count}`,
  ordered by edit count descending.
  """
  @spec compute_top_files([map()]) :: [map()]
  def compute_top_files([]), do: []

  def compute_top_files(shares) do
    all_paths = collect_all_paths(shares)
    prefix = common_prefix(all_paths)

    shares
    |> Enum.flat_map(fn share ->
      token = share.token
      (share.top_files || [])
      |> Enum.map(fn file ->
        {extract_path(file) |> strip_prefix(prefix), extract_loc(file), token}
      end)
    end)
    |> Enum.group_by(fn {path, _loc, _token} -> path end)
    |> Enum.map(fn {path, entries} ->
      total_loc = entries |> Enum.map(fn {_, loc, _} -> loc end) |> Enum.sum()
      session_count = entries |> Enum.map(fn {_, _, token} -> token end) |> Enum.uniq() |> length()
      %{path: path, edits: length(entries), loc: total_loc, sessions: session_count}
    end)
    |> Enum.sort_by(& &1.edits, :desc)
  end

  defp safe_to_date(nil), do: Date.utc_today()
  defp safe_to_date(%DateTime{} = dt), do: DateTime.to_date(dt)
  defp safe_to_date(%NaiveDateTime{} = ndt), do: NaiveDateTime.to_date(ndt)

  @doc false
  def extract_path(%{"path" => path}), do: path
  def extract_path(path) when is_binary(path), do: path

  defp extract_loc(%{"additions" => a, "deletions" => d}), do: (a || 0) + (d || 0)
  defp extract_loc(%{"additions" => a}), do: a || 0
  defp extract_loc(_), do: 0

  @doc false
  def extract_directory(file_path) do
    case Path.split(file_path) do
      ["/" | rest] -> extract_directory(Enum.join(rest, "/"))
      [a, b, c, _ | _] -> a <> "/" <> b <> "/" <> c <> "/"
      [dir, subdir, _file] -> dir <> "/" <> subdir <> "/"
      [dir, _file] -> dir <> "/"
      [file] -> file
      _ -> "."
    end
  end

  defp collect_all_paths(shares) do
    Enum.flat_map(shares, fn share ->
      (share.top_files || []) |> Enum.map(&extract_path/1)
    end)
  end

  defp common_prefix([]), do: ""
  defp common_prefix(paths) do
    # Only strip common prefix for absolute paths
    if Enum.all?(paths, &String.starts_with?(&1, "/")) do
      split_paths = Enum.map(paths, &Path.split/1)
      min_parts = split_paths |> Enum.map(&length/1) |> Enum.min(fn -> 0 end)

      prefix_parts =
        Enum.reduce_while(0..(max(min_parts - 2, 0)), [], fn i, acc ->
          parts_at_i = Enum.map(split_paths, &Enum.at(&1, i))
          if Enum.uniq(parts_at_i) |> length() == 1 do
            {:cont, acc ++ [hd(parts_at_i)]}
          else
            {:halt, acc}
          end
        end)

      case prefix_parts do
        [] -> ""
        parts -> Path.join(parts) <> "/"
      end
    else
      ""
    end
  end

  defp strip_prefix(path, ""), do: path
  defp strip_prefix(path, prefix) do
    case String.replace_prefix(path, prefix, "") do
      "" -> path
      stripped -> stripped
    end
  end
end
