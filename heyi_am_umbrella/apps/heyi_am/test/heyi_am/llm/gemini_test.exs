defmodule HeyiAm.LLM.GeminiTest do
  use ExUnit.Case, async: true

  alias HeyiAm.LLM.Gemini

  test "returns error when API key is not configured" do
    # In test env, gemini_api_key is nil
    assert {:error, :missing_api_key} = Gemini.complete("system", "user")
  end
end
