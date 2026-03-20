defmodule HeyiAmWeb.PortfolioComponentsTest do
  use HeyiAm.DataCase, async: true

  alias HeyiAmWeb.PortfolioComponents

  describe "project_initials/1" do
    test "two-word name returns first letter of each word, lowercased" do
      assert PortfolioComponents.project_initials("My Project") == "mp"
    end

    test "hyphenated name returns first letter of each part, lowercased" do
      assert PortfolioComponents.project_initials("my-project") == "mp"
    end

    test "single word returns first letter" do
      assert PortfolioComponents.project_initials("dashboard") == "d"
    end

    test "three+ words returns first two initials only" do
      assert PortfolioComponents.project_initials("my cool project app") == "mc"
    end

    test "underscore-separated name splits correctly" do
      assert PortfolioComponents.project_initials("hello_world") == "hw"
    end

    test "dot-separated name splits correctly" do
      assert PortfolioComponents.project_initials("heyi.am") == "ha"
    end
  end

  describe "build_portfolio_projects/2" do
    test "filter_visible: true excludes non-visible projects" do
      visible_project = %HeyiAm.Projects.Project{
        id: 1,
        visible: true,
        display_name: "Visible",
        project_key: "visible",
        description: "A visible project",
        featured_quote: nil,
        stats_cache: nil
      }

      hidden_project = %HeyiAm.Projects.Project{
        id: 2,
        visible: false,
        display_name: "Hidden",
        project_key: "hidden",
        description: "A hidden project",
        featured_quote: nil,
        stats_cache: nil
      }

      results = PortfolioComponents.build_portfolio_projects(
        [visible_project, hidden_project],
        filter_visible: true
      )

      assert length(results) == 1
      assert hd(results).name == "Visible"
    end

    test "filter_visible: false includes all projects" do
      visible = %HeyiAm.Projects.Project{
        id: 1, visible: true, display_name: "V", project_key: "v",
        description: nil, featured_quote: nil, stats_cache: nil
      }

      hidden = %HeyiAm.Projects.Project{
        id: 2, visible: false, display_name: "H", project_key: "h",
        description: nil, featured_quote: nil, stats_cache: nil
      }

      results = PortfolioComponents.build_portfolio_projects(
        [visible, hidden],
        filter_visible: false
      )

      assert length(results) == 2
    end

    test "nil stats_cache uses zero defaults" do
      project = %HeyiAm.Projects.Project{
        id: 1,
        visible: true,
        display_name: "Test",
        project_key: "test",
        description: nil,
        featured_quote: nil,
        stats_cache: nil
      }

      [result] = PortfolioComponents.build_portfolio_projects([project])

      assert result.share_count == 0
      assert result.total_duration == 0
      assert result.skills == []
    end

    test "skills capped at 4" do
      project = %HeyiAm.Projects.Project{
        id: 1,
        visible: true,
        display_name: "Skills Project",
        project_key: "skills",
        description: nil,
        featured_quote: nil,
        stats_cache: %{
          "skills" => ["Elixir", "React", "TypeScript", "CSS", "HTML", "Rust"],
          "share_count" => 5,
          "total_duration_minutes" => 100
        }
      }

      [result] = PortfolioComponents.build_portfolio_projects([project])

      assert length(result.skills) == 4
      assert result.skills == ["Elixir", "React", "TypeScript", "CSS"]
    end

    test "maps fields from project correctly" do
      project = %HeyiAm.Projects.Project{
        id: 1,
        visible: true,
        display_name: "My Display Name",
        project_key: "my-key",
        description: "A description",
        featured_quote: "Great quote",
        stats_cache: %{
          "share_count" => 3,
          "total_duration_minutes" => 120,
          "skills" => ["Elixir"]
        }
      }

      [result] = PortfolioComponents.build_portfolio_projects([project])

      assert result.name == "My Display Name"
      assert result.description == "A description"
      assert result.featured_quote == "Great quote"
      assert result.share_count == 3
      assert result.total_duration == 120
      assert result.skills == ["Elixir"]
      assert result.initials == "md"
    end

    test "uses project_key when display_name is nil" do
      project = %HeyiAm.Projects.Project{
        id: 1,
        visible: true,
        display_name: nil,
        project_key: "my-project",
        description: nil,
        featured_quote: nil,
        stats_cache: nil
      }

      [result] = PortfolioComponents.build_portfolio_projects([project])

      assert result.name == "my-project"
      assert result.initials == "mp"
    end
  end
end
