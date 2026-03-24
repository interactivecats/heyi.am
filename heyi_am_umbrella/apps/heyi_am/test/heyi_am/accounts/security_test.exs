defmodule HeyiAm.Accounts.SecurityTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAm.Accounts.User
  alias HeyiAm.Accounts.DeviceCode

  describe "profile_changeset/2 XSS prevention" do
    test "does not accept rendered_portfolio_html" do
      user = %User{}

      changeset =
        User.profile_changeset(user, %{
          rendered_portfolio_html: "<script>alert('xss')</script>",
          display_name: "Safe Name"
        })

      # rendered_portfolio_html should be silently ignored by cast
      refute Ecto.Changeset.get_change(changeset, :rendered_portfolio_html)
      assert Ecto.Changeset.get_change(changeset, :display_name) == "Safe Name"
    end
  end

  describe "rendered_html_changeset/2" do
    test "accepts rendered_portfolio_html" do
      user = %User{}

      changeset =
        User.rendered_html_changeset(user, %{
          rendered_portfolio_html: "<div>safe html from CLI</div>"
        })

      assert Ecto.Changeset.get_change(changeset, :rendered_portfolio_html) ==
               "<div>safe html from CLI</div>"
    end

    test "does not accept profile fields" do
      user = %User{}

      changeset =
        User.rendered_html_changeset(user, %{
          display_name: "Sneaky",
          bio: "Injected bio"
        })

      refute Ecto.Changeset.get_change(changeset, :display_name)
      refute Ecto.Changeset.get_change(changeset, :bio)
    end
  end

  describe "device code user_code generation" do
    test "generates codes in XXXX-XXXX format" do
      {_raw, device_code} = DeviceCode.build()
      assert device_code.user_code =~ ~r/^[A-Z2-9]{4}-[A-Z2-9]{4}$/
    end

    test "generates unique codes across multiple calls" do
      codes =
        for _ <- 1..10 do
          {_raw, dc} = DeviceCode.build()
          dc.user_code
        end

      # With 32^8 possible codes, 10 should all be unique
      assert length(Enum.uniq(codes)) == 10
    end

    test "uses only the allowed character set (no 0, O, 1, I)" do
      for _ <- 1..20 do
        {_raw, dc} = DeviceCode.build()
        code = String.replace(dc.user_code, "-", "")
        refute String.contains?(code, "0")
        refute String.contains?(code, "O")
        refute String.contains?(code, "1")
        refute String.contains?(code, "I")
      end
    end
  end
end
