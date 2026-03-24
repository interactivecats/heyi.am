defmodule HeyiAm.SharesFixtures do
  alias HeyiAm.Shares

  def valid_share_attributes(attrs \\ %{}) do
    Enum.into(attrs, %{
      token: Shares.generate_token(),
      title: "Test Session #{System.unique_integer([:positive])}",
      template: "editorial",
      status: "listed"
    })
  end

  def share_fixture(attrs \\ %{}) do
    {rendered_html, attrs} = Map.pop(attrs, :rendered_html)

    {:ok, share} =
      attrs
      |> valid_share_attributes()
      |> Shares.create_share()

    if rendered_html do
      {:ok, share} = Shares.update_share_rendered_html(share, %{rendered_html: rendered_html})
      share
    else
      share
    end
  end
end
