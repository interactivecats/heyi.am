defmodule HeyiAm.LLM.MockProvider do
  @moduledoc """
  Mock LLM provider for testing. Returns a fixed JSON response.
  """

  @behaviour HeyiAm.LLM.Provider

  @impl true
  def complete(_system_prompt, _user_prompt, _opts \\ []) do
    response = Jason.encode!(%{
      title: "Fixed auth middleware for session expiry edge case",
      context: "Session tokens were silently expiring without proper refresh",
      developerTake: "The tricky part was the race condition between refresh and validation.",
      skills: ["Elixir", "Phoenix", "Auth"],
      questions: [
        %{text: "Why not use a GenServer for token refresh?", suggestedAnswer: "Overkill for this scale."},
        %{text: "How did you catch the race condition?", suggestedAnswer: "Logging showed double-refresh."},
        %{text: "Will this handle clustering?", suggestedAnswer: "Not yet, single-node for now."}
      ],
      executionSteps: [
        %{stepNumber: 1, title: "Identified expiry bug", body: "Tokens expired mid-request."},
        %{stepNumber: 2, title: "Added refresh guard", body: "Check-then-refresh with lock."},
        %{stepNumber: 3, title: "Wrote regression test", body: "Simulates rapid token expiry."}
      ]
    })

    {:ok, response}
  end
end
