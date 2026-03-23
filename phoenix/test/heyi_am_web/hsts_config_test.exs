defmodule HeyiAmWeb.HSTSConfigTest do
  use ExUnit.Case, async: true

  test "prod config includes HSTS with preload and include_subdomains" do
    # Read prod.exs and verify HSTS is configured
    prod_config = File.read!("config/prod.exs")

    assert prod_config =~ "hsts:",
           "prod.exs must configure HSTS"
    assert prod_config =~ "max_age: 63_072_000",
           "HSTS max_age must be 2 years (63,072,000 seconds)"
    assert prod_config =~ "preload: true",
           "HSTS must have preload enabled"
    assert prod_config =~ "include_subdomains: true",
           "HSTS must include subdomains"
  end
end
