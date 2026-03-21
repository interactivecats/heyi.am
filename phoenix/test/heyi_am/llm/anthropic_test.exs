defmodule HeyiAm.LLM.AnthropicTest do
  use ExUnit.Case, async: true

  alias HeyiAm.LLM.Anthropic

  test "returns error when API key is not configured" do
    # In test env, anthropic_api_key is nil
    assert {:error, :missing_api_key} = Anthropic.complete("system", "user")
  end
end
