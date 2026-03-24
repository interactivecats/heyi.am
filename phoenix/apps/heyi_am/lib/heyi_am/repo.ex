defmodule HeyiAm.Repo do
  use Ecto.Repo,
    otp_app: :heyi_am,
    adapter: Ecto.Adapters.Postgres
end
