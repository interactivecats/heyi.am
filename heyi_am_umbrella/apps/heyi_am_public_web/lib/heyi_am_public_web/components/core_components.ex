defmodule HeyiAmPublicWeb.CoreComponents do
  @moduledoc """
  Minimal core UI components for the public web app.
  Only includes components actually used by public pages.
  """
  use Phoenix.Component

  @doc """
  Renders a [Heroicon](https://heroicons.com).
  """
  attr :name, :string, required: true
  attr :class, :any, default: "size-4"

  def icon(%{name: "hero-" <> _} = assigns) do
    ~H"""
    <span class={[@name, @class]} />
    """
  end

  @doc """
  Generates a generic error message.
  """
  slot :inner_block, required: true

  def error(assigns) do
    ~H"""
    <p class="label-sm" style="color: var(--error, #dc2626);">
      {render_slot(@inner_block)}
    </p>
    """
  end
end
