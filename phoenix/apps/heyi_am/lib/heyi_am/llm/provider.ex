defmodule HeyiAm.LLM.Provider do
  @moduledoc """
  Behaviour for LLM providers.
  """

  @type opts :: keyword()

  @callback complete(system_prompt :: String.t(), user_prompt :: String.t(), opts()) ::
              {:ok, String.t()} | {:error, term()}

  @doc """
  Returns the configured provider module.
  """
  def provider do
    config = Application.get_env(:heyi_am, HeyiAm.LLM, [])

    case Keyword.get(config, :provider, "gemini") do
      "anthropic" -> HeyiAm.LLM.Anthropic
      "gemini" -> HeyiAm.LLM.Gemini
      "mock" -> HeyiAm.LLM.MockProvider
      other -> raise "Unknown LLM provider: #{other}"
    end
  end
end
