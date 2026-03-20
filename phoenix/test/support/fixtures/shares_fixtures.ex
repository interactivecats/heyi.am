defmodule HeyiAm.SharesFixtures do
  alias HeyiAm.Shares

  def valid_share_attributes(attrs \\ %{}) do
    Enum.into(attrs, %{
      token: Shares.generate_token(),
      title: "Test Session #{System.unique_integer([:positive])}",
      template: "editorial"
    })
  end

  def share_fixture(attrs \\ %{}) do
    {:ok, share} =
      attrs
      |> valid_share_attributes()
      |> Shares.create_share()

    share
  end
end
