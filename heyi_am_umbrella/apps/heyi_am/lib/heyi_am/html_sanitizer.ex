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
  # NOTE: "style" is intentionally excluded — inline styles enable CSS data
  # exfiltration via background-image: url() and similar properties.
  @common_attrs ~w(class id title role
                    aria-label aria-hidden aria-expanded aria-controls
                    aria-describedby aria-labelledby
                    hidden lang dir tabindex)

  @link_attrs ~w(target)
  @img_attrs ~w(alt width height loading)
  @table_cell_attrs ~w(colspan rowspan scope)

  # Only data-* attributes that mount.js / CLI components actually use — reject
  # all others to prevent DOM clobbering and JS hijacking via attacker-controlled values.
  @allowed_data_attrs ~w(data-work-timeline data-growth-chart data-sessions
                          data-total-loc data-total-files data-session-id
                          data-session-base-url data-message-index data-testid
                          data-accent data-mode data-template data-render-version
                          data-username data-project-slug data-editable
                          data-target data-count-to data-format data-suffix
                          data-width data-bar-width data-target-width)

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

  # Only allowlisted data-* attributes — prevents DOM clobbering / JS hijacking
  for attr <- @allowed_data_attrs do
    def scrub_attribute(_tag, {unquote(attr), value}), do: {unquote(attr), value}
  end

  # Link-specific — rel is forced to "noopener noreferrer" in scrub_attributes,
  # so we only allow target here (stripped if not _blank)
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
    cleaned =
      attributes
      |> Enum.map(fn attr -> scrub_attribute(tag, attr) end)
      |> Enum.reject(&is_nil/1)

    # Force rel="noopener noreferrer" on all <a> tags to prevent reverse tabnabbing
    if tag == "a" do
      cleaned
      |> Enum.reject(fn {k, _} -> k == "rel" end)
      |> Kernel.++([{"rel", "noopener noreferrer"}])
    else
      cleaned
    end
  end

  @max_scheme_length 20
  @protocol_separator ":|(&#0*58)|(&#x0*3a)|(%|&#37;)3A"
  @http_like_scheme "(?<scheme>.+?)(#{@protocol_separator})//"

  # Raster image data URIs only — SVG excluded (can contain scripts in non-img contexts)
  @safe_data_prefixes ["data:image/png;", "data:image/jpeg;", "data:image/jpg;",
                        "data:image/gif;", "data:image/webp;"]

  defp validate_uri(uri, attr_name) do
    trimmed = String.trim(uri)

    valid? =
      cond do
        # Block protocol-relative URLs (//evil.com) — they bypass scheme checks
        String.starts_with?(trimmed, "//") ->
          false

        # Raster data:image/* URIs in img src are safe
        attr_name == "src" and Enum.any?(@safe_data_prefixes, &String.starts_with?(trimmed, &1)) ->
          true

        trimmed =~ ~r/#{@protocol_separator}/mi ->
          case Regex.named_captures(~r/#{@http_like_scheme}/mi, String.slice(trimmed, 0..@max_scheme_length)) do
            %{"scheme" => scheme} when scheme != "" ->
              String.downcase(scheme) in ["http", "https"]
            _ ->
              false
          end

        true ->
          true  # Relative URLs (paths, fragments, query strings) are safe
      end

    if valid?, do: {attr_name, uri}
  end
end
