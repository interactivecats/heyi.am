defmodule HeyiAm.HtmlSanitizer do
  @moduledoc """
  Sanitizes rendered HTML from the CLI before storing in the database.

  The rendered_html field contains pure structural HTML — no JavaScript, no SVG,
  no interactive elements. Interactive visualizations are loaded separately by
  client-side JS reading from data attributes on mount points.

  This sanitizer strips everything except safe structural HTML tags and attributes.
  """

  def sanitize(nil), do: nil
  def sanitize(""), do: ""

  def sanitize(html) when is_binary(html) do
    HtmlSanitizeEx.Scrubber.scrub(html, __MODULE__.Scrubber)
  end
end

defmodule HeyiAm.HtmlSanitizer.Scrubber do
  @moduledoc false

  require HtmlSanitizeEx.Scrubber.Meta
  alias HtmlSanitizeEx.Scrubber.Meta

  Meta.remove_cdata_sections_before_scrub()
  Meta.strip_comments()

  # Only structural HTML tags — no SVG, no script, no forms, no embeds
  @allowed_tags ~w(div span section article aside header footer main nav
                    figure figcaption details summary
                    p h1 h2 h3 h4 h5 h6 blockquote pre code
                    em strong b i u s del ins sub sup small mark abbr cite dfn kbd samp var time
                    ul ol li dl dt dd
                    table thead tbody tfoot tr th td caption colgroup col
                    a img br hr wbr)

  # Safe attributes
  @common_attrs ~w(class id style title role
                    aria-label aria-hidden aria-expanded aria-controls
                    aria-describedby aria-labelledby
                    hidden lang dir tabindex)

  @link_attrs ~w(target rel)
  @img_attrs ~w(alt width height loading)
  @table_cell_attrs ~w(colspan rowspan scope)

  # Tag rules: allow listed tags, strip everything else
  for tag <- @allowed_tags do
    def scrub({unquote(tag), attributes, children}) do
      {unquote(tag), scrub_attributes(unquote(tag), attributes), children}
    end
  end

  # URI validation for href and src — only http/https allowed
  def scrub_attribute("a", {"href", uri}), do: validate_uri(uri, "href")
  def scrub_attribute("img", {"src", uri}), do: validate_uri(uri, "src")

  # Common attributes allowed on all tags
  for attr <- @common_attrs do
    def scrub_attribute(_tag, {unquote(attr), value}), do: {unquote(attr), value}
  end

  # data-* attributes (any data- prefixed attribute is safe)
  def scrub_attribute(_tag, {"data-" <> _ = attr, value}), do: {attr, value}

  # Link-specific
  for attr <- @link_attrs do
    def scrub_attribute("a", {unquote(attr), value}), do: {unquote(attr), value}
  end

  # Image-specific
  for attr <- @img_attrs do
    def scrub_attribute("img", {unquote(attr), value}), do: {unquote(attr), value}
  end

  # Table cell attributes
  for attr <- @table_cell_attrs do
    def scrub_attribute("th", {unquote(attr), value}), do: {unquote(attr), value}
    def scrub_attribute("td", {unquote(attr), value}), do: {unquote(attr), value}
  end

  # Strip everything not covered
  Meta.strip_everything_not_covered()

  defp scrub_attributes(tag, attributes) do
    attributes
    |> Enum.map(fn attr -> scrub_attribute(tag, attr) end)
    |> Enum.reject(&is_nil/1)
  end

  @max_scheme_length 20
  @protocol_separator ":|(&#0*58)|(&#x70)|(&#x0*3a)|(%|&#37;)3A"
  @http_like_scheme "(?<scheme>.+?)(#{@protocol_separator})//"

  defp validate_uri(uri, attr_name) do
    valid? =
      if uri =~ ~r/#{@protocol_separator}/mi do
        case Regex.named_captures(~r/#{@http_like_scheme}/mi, String.slice(uri, 0..@max_scheme_length)) do
          %{"scheme" => scheme} when scheme != "" ->
            String.downcase(scheme) in ["http", "https"]
          _ ->
            false
        end
      else
        true  # Relative URLs are safe
      end

    if valid?, do: {attr_name, uri}
  end
end
