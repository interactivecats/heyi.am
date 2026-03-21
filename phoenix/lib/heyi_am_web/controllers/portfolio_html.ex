defmodule HeyiAmWeb.PortfolioHTML do
  use HeyiAmWeb, :html

  import HeyiAmWeb.Helpers, only: [format_loc: 1]

  embed_templates "portfolio_html/*"

  defp truncate_title(nil, _max), do: ""
  defp truncate_title(str, max) when byte_size(str) <= max, do: str
  defp truncate_title(str, max), do: String.slice(str, 0, max) <> "…"
end
