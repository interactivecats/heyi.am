defmodule HeyiAmWeb.PortfolioHTML do
  use HeyiAmWeb, :html

  embed_templates "portfolio_html/*"

  defp format_date(nil), do: ""
  defp format_date(date_str) when is_binary(date_str) do
    case Date.from_iso8601(date_str |> String.slice(0, 10)) do
      {:ok, date} -> Calendar.strftime(date, "%b %d")
      _ -> date_str
    end
  end
  defp format_date(_), do: ""
end
