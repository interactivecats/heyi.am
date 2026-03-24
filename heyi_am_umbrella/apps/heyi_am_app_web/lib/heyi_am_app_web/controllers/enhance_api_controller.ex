defmodule HeyiAmAppWeb.EnhanceApiController do
  use HeyiAmAppWeb, :controller

  alias HeyiAm.LLM

  def create(conn, %{"session" => session}) when is_map(session) do
    case conn.assigns[:current_user_id] do
      nil ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: %{code: "AUTH_REQUIRED", message: "Authentication required. Run: heyiam login"}})

      user_id ->
        case LLM.enhance(user_id, session) do
          {:ok, result, remaining} ->
            json(conn, %{result: result, usage: %{remaining: remaining}})

          {:error, :quota_exceeded} ->
            resets_at = next_month_start()

            conn
            |> put_status(429)
            |> json(%{error: %{
              code: "QUOTA_EXCEEDED",
              message: "Monthly enhancement limit reached.",
              resets_at: resets_at
            }})

          {:error, {:invalid_session, message}} ->
            conn
            |> put_status(:unprocessable_entity)
            |> json(%{error: %{code: "INVALID_SESSION", message: message}})

          {:error, {:upstream_error, _reason}} ->
            conn
            |> put_status(:bad_gateway)
            |> json(%{error: %{code: "UPSTREAM_ERROR", message: "AI provider temporarily unavailable. Try again."}})

          {:error, {:parse_error, _reason}} ->
            conn
            |> put_status(:bad_gateway)
            |> json(%{error: %{code: "UPSTREAM_ERROR", message: "AI response could not be parsed. Try again."}})
        end
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: %{code: "MISSING_SESSION", message: "Missing 'session' parameter"}})
  end

  defp next_month_start do
    Date.utc_today()
    |> Date.beginning_of_month()
    |> Date.shift(month: 1)
    |> Date.to_iso8601()
  end
end
