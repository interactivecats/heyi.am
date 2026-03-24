defmodule HeyiAm.ScaffoldTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAm.Repo
  alias HeyiAm.Accounts.User
  alias HeyiAm.Accounts.UserToken
  alias HeyiAm.Accounts.DeviceCode
  alias HeyiAm.Projects.Project
  alias HeyiAm.Shares.Share
  alias HeyiAm.Vibes.Vibe
  alias HeyiAm.LLM.Usage

  describe "Repo accessibility" do
    test "Repo is accessible and connected" do
      assert %Postgrex.Result{} = Repo.query!("SELECT 1")
    end
  end

  describe "PubSub" do
    test "subscribe and broadcast works" do
      topic = "scaffold_test:#{System.unique_integer()}"
      Phoenix.PubSub.subscribe(HeyiAm.PubSub, topic)
      Phoenix.PubSub.broadcast(HeyiAm.PubSub, topic, {:test_message, "hello"})
      assert_receive {:test_message, "hello"}
    end
  end

  describe "context modules are loadable" do
    test "all context modules are defined" do
      assert Code.ensure_loaded?(HeyiAm.Accounts)
      assert Code.ensure_loaded?(HeyiAm.Accounts.User)
      assert Code.ensure_loaded?(HeyiAm.Accounts.UserToken)
      assert Code.ensure_loaded?(HeyiAm.Accounts.DeviceCode)
      assert Code.ensure_loaded?(HeyiAm.Projects)
      assert Code.ensure_loaded?(HeyiAm.Projects.Project)
      assert Code.ensure_loaded?(HeyiAm.Shares)
      assert Code.ensure_loaded?(HeyiAm.Shares.Share)
      assert Code.ensure_loaded?(HeyiAm.Vibes)
      assert Code.ensure_loaded?(HeyiAm.Vibes.Vibe)
      assert Code.ensure_loaded?(HeyiAm.LLM.Usage)
    end
  end

  describe "basic insert/query on each table" do
    test "can insert and query a user" do
      {:ok, user} =
        %User{}
        |> User.registration_changeset(%{email: "scaffold@test.com", password: "password123456"})
        |> Repo.insert()

      assert user.id
      assert Repo.get!(User, user.id).email == "scaffold@test.com"
    end

    test "can insert and query a user token" do
      {:ok, user} =
        %User{}
        |> User.registration_changeset(%{email: "token@test.com", password: "password123456"})
        |> Repo.insert()

      {token, token_struct} = UserToken.build_session_token(user)
      {:ok, saved} = Repo.insert(token_struct)

      assert saved.id
      assert saved.context == "session"
      assert byte_size(token) == 32
    end

    test "can insert and query a project" do
      {:ok, user} =
        %User{}
        |> User.registration_changeset(%{email: "project@test.com", password: "password123456"})
        |> Repo.insert()

      {:ok, project} =
        %Project{}
        |> Project.changeset(%{slug: "test-project", title: "Test Project", user_id: user.id})
        |> Repo.insert()

      assert project.id
      assert Repo.get!(Project, project.id).slug == "test-project"
    end

    test "can insert and query a share" do
      {:ok, user} =
        %User{}
        |> User.registration_changeset(%{email: "share@test.com", password: "password123456"})
        |> Repo.insert()

      {:ok, share} =
        %Share{}
        |> Share.changeset(%{
          token: "test-token-#{System.unique_integer([:positive])}",
          title: "Test Share",
          user_id: user.id
        })
        |> Repo.insert()

      assert share.id
      assert Repo.get!(Share, share.id).title == "Test Share"
    end

    test "can insert and query a vibe" do
      {:ok, vibe} =
        %Vibe{}
        |> Vibe.changeset(%{
          short_id: "test#{System.unique_integer([:positive])}",
          delete_code: "del123",
          archetype_id: "night-owl",
          narrative: "A test narrative",
          stats: %{"turns" => 42},
          session_count: 5,
          total_turns: 100
        })
        |> Repo.insert()

      assert vibe.id
      assert Repo.get!(Vibe, vibe.id).archetype_id == "night-owl"
    end

    test "can insert and query a device code" do
      {_raw, device_code} = DeviceCode.build()
      {:ok, saved} = Repo.insert(device_code)

      assert saved.id
      assert saved.status == "pending"
    end

    test "can insert and query enhancement usage" do
      {:ok, user} =
        %User{}
        |> User.registration_changeset(%{email: "usage@test.com", password: "password123456"})
        |> Repo.insert()

      {:ok, usage} =
        %Usage{}
        |> Usage.changeset(%{
          user_id: user.id,
          provider: "anthropic",
          model: "claude-3",
          status: "success"
        })
        |> Repo.insert()

      assert usage.id
      assert Repo.get!(Usage, usage.id).provider == "anthropic"
    end
  end
end
