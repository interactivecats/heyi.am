{:ok, _} = Application.ensure_all_started(:heyi_am_vibe_web)
Ecto.Adapters.SQL.Sandbox.mode(HeyiAm.Repo, :manual)
ExUnit.start()
