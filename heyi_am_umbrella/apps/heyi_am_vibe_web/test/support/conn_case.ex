defmodule HeyiAmVibeWeb.ConnCase do
  @moduledoc """
  Test case for vibe web controllers.

  No session helpers — vibes are anonymous.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      @endpoint HeyiAmVibeWeb.Endpoint

      use HeyiAmVibeWeb, :verified_routes

      import Plug.Conn
      import Phoenix.ConnTest
      import HeyiAmVibeWeb.ConnCase
    end
  end

  setup tags do
    pid = Ecto.Adapters.SQL.Sandbox.start_owner!(HeyiAm.Repo, shared: not tags[:async])
    on_exit(fn -> Ecto.Adapters.SQL.Sandbox.stop_owner(pid) end)
    {:ok, conn: Phoenix.ConnTest.build_conn()}
  end
end
