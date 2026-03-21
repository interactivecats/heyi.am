defmodule HeyiAm.LLM.Anthropic do
  @moduledoc """
  Anthropic Messages API provider via Req.
  """

  @behaviour HeyiAm.LLM.Provider

  @base_url "https://api.anthropic.com/v1/messages"

  @impl true
  def complete(system_prompt, user_prompt, opts \\ []) do
    config = Application.get_env(:heyi_am, HeyiAm.LLM, [])
    api_key = Keyword.get(config, :anthropic_api_key)
    model = Keyword.get(config, :anthropic_model, "claude-haiku-4-5-20251001")
    timeout = Keyword.get(opts, :timeout, 30_000)

    if is_nil(api_key) do
      {:error, :missing_api_key}
    else
      body = %{
        model: model,
        max_tokens: 2048,
        system: system_prompt,
        messages: [%{role: "user", content: user_prompt}]
      }

      headers = [
        {"x-api-key", api_key},
        {"anthropic-version", "2023-06-01"},
        {"content-type", "application/json"}
      ]

      case Req.post(@base_url, json: body, headers: headers, receive_timeout: timeout) do
        {:ok, %{status: 200, body: resp_body}} ->
          extract_text(resp_body)

        {:ok, %{status: status, body: resp_body}} ->
          {:error, {:upstream, status, resp_body}}

        {:error, reason} ->
          {:error, {:request_failed, reason}}
      end
    end
  end

  defp extract_text(%{"content" => content}) when is_list(content) do
    text =
      content
      |> Enum.filter(&(&1["type"] == "text"))
      |> Enum.map_join("", & &1["text"])

    {:ok, text}
  end

  defp extract_text(body) do
    {:error, {:unexpected_response, body}}
  end
end
