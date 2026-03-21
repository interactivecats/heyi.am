defmodule HeyiAm.LLM.Gemini do
  @moduledoc """
  Gemini provider via the Google Generative Language API.
  """

  @behaviour HeyiAm.LLM.Provider

  @base_url "https://generativelanguage.googleapis.com/v1beta/models"

  @impl true
  def complete(system_prompt, user_prompt, opts \\ []) do
    config = Application.get_env(:heyi_am, HeyiAm.LLM, [])
    api_key = Keyword.get(config, :gemini_api_key)
    model = Keyword.get(config, :gemini_model, "gemini-2.5-flash")
    timeout = Keyword.get(opts, :timeout, 30_000)

    if is_nil(api_key) do
      {:error, :missing_api_key}
    else
      url = "#{@base_url}/#{model}:generateContent?key=#{api_key}"

      body = %{
        system_instruction: %{parts: [%{text: system_prompt}]},
        contents: [%{role: "user", parts: [%{text: user_prompt}]}],
        generationConfig: %{maxOutputTokens: 2048}
      }

      case Req.post(url, json: body, receive_timeout: timeout) do
        {:ok, %{status: 200, body: resp_body}} ->
          extract_text(resp_body)

        {:ok, %{status: status, body: resp_body}} ->
          {:error, {:upstream, status, resp_body}}

        {:error, reason} ->
          {:error, {:request_failed, reason}}
      end
    end
  end

  defp extract_text(%{"candidates" => [%{"content" => %{"parts" => parts}} | _]}) do
    text =
      parts
      |> Enum.filter(&Map.has_key?(&1, "text"))
      |> Enum.map_join("", & &1["text"])

    {:ok, text}
  end

  defp extract_text(body) do
    {:error, {:unexpected_response, body}}
  end
end
