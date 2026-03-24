defmodule HeyiAmPublicWeb.Layouts do
  @moduledoc """
  Layouts for the public web app. No session-dependent features.
  """
  use HeyiAmPublicWeb, :html

  embed_templates "layouts/*"
end
