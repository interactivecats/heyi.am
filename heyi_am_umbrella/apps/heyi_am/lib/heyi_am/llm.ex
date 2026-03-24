defmodule HeyiAm.LLM do
  @moduledoc """
  Context module for LLM-powered enhancement.

  Orchestrates: validate → quota check → truncate → prompt → provider → parse → log.
  """

  import Ecto.Query
  alias HeyiAm.Repo
  alias HeyiAm.LLM.{Usage, Prompt, Parser, Provider, Sampler}

  @required_session_keys ~w(title)

  @doc """
  Enhances a session using the configured LLM provider.

  Returns `{:ok, result, remaining}` or `{:error, reason}`.
  """
  def enhance(user_id, session) when is_map(session) do
    with :ok <- validate_session(session),
         {:ok, remaining} <- check_quota(user_id) do
      provider = Provider.provider()
      config = Application.get_env(:heyi_am, __MODULE__, [])
      provider_name = Keyword.get(config, :provider, "gemini")
      model = provider_model(config, provider_name)

      session = truncate_session(session)
      system = Prompt.system_prompt()
      user = Prompt.user_prompt(session)

      start = System.monotonic_time(:millisecond)

      case provider.complete(system, user) do
        {:ok, raw_text} ->
          duration_ms = System.monotonic_time(:millisecond) - start
          input_tokens = estimate_tokens(system <> user)
          output_tokens = estimate_tokens(raw_text)

          case Parser.parse_result(raw_text) do
            {:ok, result} ->
              log_usage(%{
                user_id: user_id,
                provider: provider_name,
                model: model,
                input_tokens: input_tokens,
                output_tokens: output_tokens,
                estimated_cost_cents: estimate_cost(provider_name, input_tokens, output_tokens),
                duration_ms: duration_ms,
                status: "success"
              })

              {:ok, result, remaining - 1}

            {:error, parse_error} ->
              log_usage(%{
                user_id: user_id,
                provider: provider_name,
                model: model,
                input_tokens: input_tokens,
                output_tokens: output_tokens,
                estimated_cost_cents: 0,
                duration_ms: duration_ms,
                status: "error",
                error_code: "PARSE_ERROR"
              })

              {:error, {:parse_error, parse_error}}
          end

        {:error, reason} ->
          duration_ms = System.monotonic_time(:millisecond) - start

          log_usage(%{
            user_id: user_id,
            provider: provider_name,
            model: model,
            duration_ms: duration_ms,
            status: "error",
            error_code: "UPSTREAM_ERROR"
          })

          {:error, {:upstream_error, reason}}
      end
    end
  end

  @doc """
  Logs an enhancement usage record.
  """
  def log_usage(attrs) do
    %Usage{}
    |> Usage.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Returns the number of successful enhancements this month for the given user.
  """
  def monthly_count(user_id) do
    start_of_month =
      Date.utc_today()
      |> Date.beginning_of_month()
      |> DateTime.new!(~T[00:00:00], "Etc/UTC")

    Repo.one(
      from u in Usage,
        where: u.user_id == ^user_id,
        where: u.status == "success",
        where: u.inserted_at >= ^start_of_month,
        select: count(u.id)
    )
  end

  @doc """
  Returns true if the user is within their monthly enhancement quota.
  """
  def within_quota?(user_id) do
    monthly_count(user_id) < monthly_quota()
  end

  @doc """
  Returns the remaining number of enhancements for this month.
  """
  def remaining_quota(user_id) do
    max(0, monthly_quota() - monthly_count(user_id))
  end

  defp monthly_quota do
    config = Application.get_env(:heyi_am, __MODULE__, [])
    Keyword.get(config, :monthly_quota, 10)
  end

  defp validate_session(session) do
    missing = Enum.filter(@required_session_keys, fn key -> !is_binary(session[key]) or session[key] == "" end)

    if missing == [] do
      :ok
    else
      {:error, {:invalid_session, "Missing required fields: #{Enum.join(missing, ", ")}"}}
    end
  end

  defp check_quota(user_id) do
    remaining = remaining_quota(user_id)
    if remaining > 0, do: {:ok, remaining}, else: {:error, :quota_exceeded}
  end

  defp truncate_session(session) do
    session
    |> Sampler.sample_session()
    |> Map.update("rawLog", [], fn log ->
      if is_list(log), do: Enum.map(log, &truncate_string(&1, 1500)), else: []
    end)
    |> Map.update("filesChanged", [], fn files ->
      if is_list(files) do
        files
        |> Enum.sort_by(fn f -> -((f["additions"] || 0) + (f["deletions"] || 0)) end)
        |> Enum.take(10)
      else
        []
      end
    end)
  end

  defp truncate_string(str, max) when is_binary(str) do
    if String.length(str) > max do
      String.slice(str, 0, max)
    else
      str
    end
  end
  defp truncate_string(_, _), do: ""

  defp estimate_tokens(text) when is_binary(text), do: div(byte_size(text), 4)
  defp estimate_tokens(_), do: 0

  defp estimate_cost("gemini", input_tokens, output_tokens) do
    # Gemini 2.5 Flash: ~$0.15/1M input, ~$0.60/1M output
    trunc((input_tokens * 0.15 + output_tokens * 0.60) / 10_000)
  end

  defp estimate_cost("anthropic", input_tokens, output_tokens) do
    # Claude Haiku 3.5: ~$1.00/1M input, ~$5.00/1M output
    trunc((input_tokens * 1.00 + output_tokens * 5.00) / 10_000)
  end

  defp estimate_cost(_, _input, _output), do: 0

  defp provider_model(config, "gemini"), do: Keyword.get(config, :gemini_model, "gemini-2.5-flash")
  defp provider_model(config, "anthropic"), do: Keyword.get(config, :anthropic_model, "claude-haiku-4-5-20251001")
  defp provider_model(_config, _unknown), do: "mock"
end
