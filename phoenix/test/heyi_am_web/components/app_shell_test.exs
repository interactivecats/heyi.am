defmodule HeyiAmWeb.AppShellTest do
  use HeyiAmWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  alias HeyiAmWeb.AppShell

  describe "public_shell/1" do
    test "renders topbar with logo text and href" do
      html =
        render_component(&AppShell.public_shell/1,
          logo_text: "heyi.am",
          logo_href: "/",
          inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Page content" end}]
        )

      assert html =~ ~s(class="topbar-logo")
      assert html =~ "heyi.am"
      assert html =~ ~s(href="/")
    end

    test "renders navigation items" do
      assigns = %{
        logo_text: "heyi.am",
        logo_href: "/",
        current_page: "Portfolio",
        class: nil,
        nav_item: [
          %{
            __slot__: :nav_item,
            href: "/portfolio",
            label: "Portfolio",
            inner_block: nil
          },
          %{
            __slot__: :nav_item,
            href: "/archive",
            label: "Archive",
            inner_block: nil
          }
        ],
        status: [],
        inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Content" end}]
      }

      html = render_component(&AppShell.public_shell/1, assigns)

      assert html =~ ~s(href="/portfolio")
      assert html =~ "Portfolio"
      assert html =~ ~s(href="/archive")
      assert html =~ "Archive"
    end

    test "marks current page with aria-current" do
      assigns = %{
        logo_text: "heyi.am",
        logo_href: "/",
        current_page: "Archive",
        class: nil,
        nav_item: [
          %{__slot__: :nav_item, href: "/portfolio", label: "Portfolio", inner_block: nil},
          %{__slot__: :nav_item, href: "/archive", label: "Archive", inner_block: nil}
        ],
        status: [],
        inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Content" end}]
      }

      html = render_component(&AppShell.public_shell/1, assigns)

      assert html =~ ~s(aria-current="page")
    end

    test "renders inner content" do
      html =
        render_component(&AppShell.public_shell/1,
          logo_text: "heyi.am",
          logo_href: "/",
          inner_block: [
            %{__slot__: :inner_block, inner_block: fn _, _ -> "<h1>Hello World</h1>" end}
          ]
        )

      assert html =~ "Hello World"
    end

    test "uses public-shell-main class on main element" do
      html =
        render_component(&AppShell.public_shell/1,
          logo_text: "heyi.am",
          logo_href: "/",
          inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Content" end}]
        )

      assert html =~ "public-shell-main"
    end

    test "renders without nav items when none provided" do
      html =
        render_component(&AppShell.public_shell/1,
          logo_text: "heyi.am",
          logo_href: "/",
          inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Content" end}]
        )

      # Should not render navigation element when no nav items
      refute html =~ ~s(aria-label="Main navigation")
    end

    test "applies topbar class for light background" do
      html =
        render_component(&AppShell.public_shell/1,
          logo_text: "heyi.am",
          logo_href: "/",
          inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Content" end}]
        )

      assert html =~ ~s(class="topbar")
      # Public shell should NOT have editor variant
      refute html =~ "topbar--editor"
    end
  end

  describe "editor_shell/1" do
    test "renders dark topbar with editor variant class" do
      html =
        render_component(&AppShell.editor_shell/1,
          logo_text: "Workbench",
          logo_href: "/",
          inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Editor" end}]
        )

      assert html =~ "topbar--editor"
    end

    test "renders sidebar when sidebar slot provided" do
      assigns = %{
        logo_text: "Workbench",
        logo_href: "/",
        current_page: nil,
        class: nil,
        nav_item: [],
        actions: [],
        sidebar: [
          %{
            __slot__: :sidebar,
            inner_block: fn _, _ -> "<nav>Sidebar content</nav>" end
          }
        ],
        inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Main" end}]
      }

      html = render_component(&AppShell.editor_shell/1, assigns)

      assert html =~ ~s(class="sidebar")
      assert html =~ "Sidebar content"
    end

    test "does not render sidebar when slot is empty" do
      html =
        render_component(&AppShell.editor_shell/1,
          logo_text: "Workbench",
          logo_href: "/",
          inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Main" end}]
        )

      refute html =~ ~s(class="sidebar")
    end

    test "renders action buttons" do
      assigns = %{
        logo_text: "Workbench",
        logo_href: "/",
        current_page: nil,
        class: nil,
        nav_item: [],
        actions: [
          %{
            __slot__: :actions,
            inner_block: fn _, _ ->
              ~s(<button class="btn btn-primary">Save</button>)
            end
          }
        ],
        sidebar: [],
        inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Main" end}]
      }

      html = render_component(&AppShell.editor_shell/1, assigns)

      assert html =~ "Save"
    end

    test "uses app-shell class for sidebar layout" do
      assigns = %{
        logo_text: "Workbench",
        logo_href: "/",
        current_page: nil,
        class: nil,
        nav_item: [],
        actions: [],
        sidebar: [
          %{__slot__: :sidebar, inner_block: fn _, _ -> "Sidebar" end}
        ],
        inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Main" end}]
      }

      html = render_component(&AppShell.editor_shell/1, assigns)

      assert html =~ ~s(class="app-shell")
      assert html =~ "app-shell-main"
    end

    test "has proper ARIA roles for accessibility" do
      assigns = %{
        logo_text: "Workbench",
        logo_href: "/",
        current_page: nil,
        class: nil,
        nav_item: [],
        actions: [],
        sidebar: [
          %{__slot__: :sidebar, inner_block: fn _, _ -> "Sidebar" end}
        ],
        inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Main" end}]
      }

      html = render_component(&AppShell.editor_shell/1, assigns)

      assert html =~ ~s(role="banner")
      assert html =~ ~s(role="complementary")
      assert html =~ ~s(aria-label="Sidebar navigation")
    end

    test "renders nav items with correct labels" do
      assigns = %{
        logo_text: "Workbench",
        logo_href: "/",
        current_page: "Sessions",
        class: nil,
        nav_item: [
          %{__slot__: :nav_item, href: "/drafts", label: "Drafts", inner_block: nil},
          %{__slot__: :nav_item, href: "/sessions", label: "Sessions", inner_block: nil}
        ],
        actions: [],
        sidebar: [],
        inner_block: [%{__slot__: :inner_block, inner_block: fn _, _ -> "Main" end}]
      }

      html = render_component(&AppShell.editor_shell/1, assigns)

      assert html =~ "Drafts"
      assert html =~ "Sessions"
      assert html =~ ~s(aria-current="page")
    end
  end
end
