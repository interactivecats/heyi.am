defmodule HeyiAmPublicWeb.ConnCase do
  @moduledoc """
  Test case for the public web endpoint.

  NO session helpers — this endpoint has no sessions.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      @endpoint HeyiAmPublicWeb.Endpoint

      use HeyiAmPublicWeb, :verified_routes

      import Plug.Conn
      import Phoenix.ConnTest
      import HeyiAmPublicWeb.ConnCase
    end
  end

  setup tags do
    HeyiAm.DataCase.setup_sandbox(tags)
    {:ok, conn: Phoenix.ConnTest.build_conn()}
  end
end
