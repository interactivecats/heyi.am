defmodule HeyiAmAppWeb.AdminAuth do
  @moduledoc """
  LiveView on_mount hook that restricts access to admin users.

  In dev, all authenticated users are allowed.
  In prod, checks the user's email against the ADMIN_EMAILS env var.
  """
  use HeyiAmAppWeb, :verified_routes

  def on_mount(:admin, _params, session, socket) do
    case HeyiAmAppWeb.UserAuth.on_mount(:require_authenticated, %{}, session, socket) do
      {:halt, socket} ->
        {:halt, socket}

      {:cont, socket} ->
        user = socket.assigns[:current_scope] && socket.assigns.current_scope.user

        cond do
          dev?() ->
            {:cont, socket}

          is_nil(user) ->
            {:halt,
             socket
             |> Phoenix.LiveView.put_flash(:error, "You must log in to access the dashboard.")
             |> Phoenix.LiveView.redirect(to: ~p"/users/log-in")}

          admin?(user.email) ->
            {:cont, socket}

          true ->
            {:halt,
             socket
             |> Phoenix.LiveView.put_flash(:error, "You are not authorized to access the dashboard.")
             |> Phoenix.LiveView.redirect(to: ~p"/users/log-in")}
        end
    end
  end

  defp dev?, do: Application.get_env(:heyi_am, :env) == :dev
  defp admin?(nil), do: false

  defp admin?(email) do
    admin_emails =
      System.get_env("ADMIN_EMAILS", "")
      |> String.split(",", trim: true)
      |> Enum.map(&String.trim/1)

    email in admin_emails
  end
end
