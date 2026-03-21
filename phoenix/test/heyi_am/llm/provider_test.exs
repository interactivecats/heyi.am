defmodule HeyiAm.LLM.ProviderTest do
  use ExUnit.Case, async: true

  alias HeyiAm.LLM.Provider

  test "provider/0 returns mock provider in test" do
    assert Provider.provider() == HeyiAm.LLM.MockProvider
  end

  test "mock provider returns valid JSON" do
    {:ok, text} = HeyiAm.LLM.MockProvider.complete("system", "user")
    assert {:ok, parsed} = Jason.decode(text)
    assert is_binary(parsed["title"])
    assert is_list(parsed["skills"])
    assert is_list(parsed["questions"])
    assert is_list(parsed["executionSteps"])
  end
end
