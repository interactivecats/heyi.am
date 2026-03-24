{:ok, _} = Application.ensure_all_started(:heyi_am_public_web)
ExUnit.start()
Ecto.Adapters.SQL.Sandbox.mode(HeyiAm.Repo, :manual)
