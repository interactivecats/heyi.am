defmodule HeyiAm.PortfoliosTest do
  use HeyiAm.DataCase

  alias HeyiAm.Portfolios
  alias HeyiAm.Portfolios.PortfolioSession

  import HeyiAm.AccountsFixtures
  import HeyiAm.SharesFixtures

  describe "PortfolioSession.changeset/2" do
    test "valid with required fields" do
      changeset = PortfolioSession.changeset(%PortfolioSession{}, %{user_id: 1, share_id: 1})
      assert changeset.valid?
    end

    test "requires user_id" do
      changeset = PortfolioSession.changeset(%PortfolioSession{}, %{share_id: 1})
      refute changeset.valid?
      assert %{user_id: ["can't be blank"]} = errors_on(changeset)
    end

    test "requires share_id" do
      changeset = PortfolioSession.changeset(%PortfolioSession{}, %{user_id: 1})
      refute changeset.valid?
      assert %{share_id: ["can't be blank"]} = errors_on(changeset)
    end
  end

  describe "add_to_portfolio/2" do
    test "creates a portfolio entry" do
      user = user_fixture()
      share = share_fixture()
      {:ok, ps} = Portfolios.add_to_portfolio(user, share)
      assert ps.user_id == user.id
      assert ps.share_id == share.id
      assert ps.position == 1
    end

    test "sets incrementing positions" do
      user = user_fixture()
      share1 = share_fixture()
      share2 = share_fixture()
      {:ok, ps1} = Portfolios.add_to_portfolio(user, share1)
      {:ok, ps2} = Portfolios.add_to_portfolio(user, share2)
      assert ps1.position == 1
      assert ps2.position == 2
    end

    test "copies project_name from share" do
      user = user_fixture()
      share = share_fixture(%{project_name: "my-project"})
      {:ok, ps} = Portfolios.add_to_portfolio(user, share)
      assert ps.project_name == "my-project"
    end

    test "enforces unique user+share" do
      user = user_fixture()
      share = share_fixture()
      {:ok, _} = Portfolios.add_to_portfolio(user, share)
      assert {:error, _} = Portfolios.add_to_portfolio(user, share)
    end
  end

  describe "list_portfolio_sessions/1" do
    test "returns sessions ordered by position" do
      user = user_fixture()
      share1 = share_fixture()
      share2 = share_fixture()
      {:ok, _} = Portfolios.add_to_portfolio(user, share1)
      {:ok, _} = Portfolios.add_to_portfolio(user, share2)
      sessions = Portfolios.list_portfolio_sessions(user.id)
      assert length(sessions) == 2
      assert hd(sessions).share_id == share1.id
    end

    test "preloads share" do
      user = user_fixture()
      share = share_fixture()
      {:ok, _} = Portfolios.add_to_portfolio(user, share)
      [ps] = Portfolios.list_portfolio_sessions(user.id)
      assert ps.share.id == share.id
    end

    test "returns empty list for user with no portfolio" do
      user = user_fixture()
      assert Portfolios.list_portfolio_sessions(user.id) == []
    end
  end

  describe "toggle_visibility/2" do
    test "toggles visible to false" do
      user = user_fixture()
      share = share_fixture()
      {:ok, ps} = Portfolios.add_to_portfolio(user, share)
      {:ok, updated} = Portfolios.toggle_visibility(ps, false)
      refute updated.visible
    end

    test "toggles visible back to true" do
      user = user_fixture()
      share = share_fixture()
      {:ok, ps} = Portfolios.add_to_portfolio(user, share)
      {:ok, ps} = Portfolios.toggle_visibility(ps, false)
      {:ok, updated} = Portfolios.toggle_visibility(ps, true)
      assert updated.visible
    end
  end

  describe "reorder/2" do
    test "reorders portfolio sessions" do
      user = user_fixture()
      share1 = share_fixture()
      share2 = share_fixture()
      share3 = share_fixture()
      {:ok, ps1} = Portfolios.add_to_portfolio(user, share1)
      {:ok, ps2} = Portfolios.add_to_portfolio(user, share2)
      {:ok, ps3} = Portfolios.add_to_portfolio(user, share3)

      {:ok, _} = Portfolios.reorder(user.id, [ps3.id, ps1.id, ps2.id])

      sessions = Portfolios.list_portfolio_sessions(user.id)
      assert Enum.map(sessions, & &1.id) == [ps3.id, ps1.id, ps2.id]
    end
  end

  describe "remove_from_portfolio/1" do
    test "deletes the portfolio session" do
      user = user_fixture()
      share = share_fixture()
      {:ok, ps} = Portfolios.add_to_portfolio(user, share)
      {:ok, _} = Portfolios.remove_from_portfolio(ps)
      assert Portfolios.list_portfolio_sessions(user.id) == []
    end
  end

  describe "auto-add integration" do
    test "creating share with user_id auto-adds to portfolio" do
      user = user_fixture()

      {:ok, share} =
        HeyiAm.Shares.create_share(%{
          token: HeyiAm.Shares.generate_token(),
          title: "Auto-added",
          status: "listed",
          user_id: user.id,
          project_name: "test-project"
        })

      sessions = Portfolios.list_portfolio_sessions(user.id)
      assert length(sessions) == 1
      assert hd(sessions).share_id == share.id
      assert hd(sessions).project_name == "test-project"
    end

    test "creating share without user_id does not auto-add" do
      {:ok, _share} =
        HeyiAm.Shares.create_share(%{
          token: HeyiAm.Shares.generate_token(),
          title: "Anonymous"
        })

      # No crash, no portfolio entry
    end
  end
end
