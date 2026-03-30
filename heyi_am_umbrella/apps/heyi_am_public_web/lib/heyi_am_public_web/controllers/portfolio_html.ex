defmodule HeyiAmPublicWeb.PortfolioHTML do
  use HeyiAmPublicWeb, :html

  embed_templates "portfolio_html/*"

  def format_duration(nil), do: "0m"
  def format_duration(minutes) when minutes >= 60, do: "#{div(minutes, 60)}h"
  def format_duration(minutes), do: "#{minutes}m"

  def format_number(n) when n >= 1000, do: "#{Float.round(n / 1000, 1)}k"
  def format_number(n), do: "#{n}"
end
