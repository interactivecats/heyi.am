defmodule HeyiAmWeb.PortfolioController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Accounts

  @mock_projects [
    %{
      title: "DataFlow Engine",
      slug: "dataflow-engine",
      description:
        "A real-time streaming data pipeline built with GenStage. Handles 50k events/sec with backpressure and partition-aware routing.",
      status: "active",
      skills: ["Elixir", "GenStage", "PostgreSQL", "system-design"],
      session_count: 12,
      total_minutes: 540,
      loc_changed: "8.2k"
    },
    %{
      title: "heyi.am",
      slug: "heyi-am",
      description:
        "Signal-first portfolio platform for developers. Phoenix + LiveView, sealed session verification, anti-fluff enforcement.",
      status: "active",
      skills: ["Elixir", "Phoenix", "LiveView", "Tailwind"],
      session_count: 8,
      total_minutes: 380,
      loc_changed: "4.1k"
    }
  ]

  @mock_collab_profile %{
    task_scoping: 82,
    redirection: 65,
    verification: 91,
    orchestration: 74
  }

  @mock_metrics %{
    uptime: "47h",
    avg_cycle: "42m",
    error_budget: "3.2%"
  }

  @mock_recent_activity [
    %{label: "Auth rewrite", date: "Mar 12"},
    %{label: "Portfolio editor", date: "Mar 10"},
    %{label: "Vibe picker fix", date: "Mar 8"}
  ]

  @mock_project_sessions [
    %{
      token: "abc123",
      title: "Ripping out auth and rebuilding with phx.gen.auth",
      description: "Full auth system rewrite from frankencode to clean phx.gen.auth scaffold.",
      duration_minutes: 47,
      turns: 77,
      files_changed: 34,
      loc_changed: "2.4k",
      skills: ["Phoenix", "Auth", "Security"],
      recorded_at: ~U[2026-03-12 14:02:00Z],
      verified_at: ~U[2026-03-12 14:49:00Z]
    },
    %{
      token: "def456",
      title: "Portfolio editor drag-and-drop session reorder",
      description: "Wired up sortable session cards with LiveView hooks and optimistic UI.",
      duration_minutes: 35,
      turns: 52,
      files_changed: 12,
      loc_changed: "890",
      skills: ["LiveView", "JavaScript", "UX"],
      recorded_at: ~U[2026-03-10 10:15:00Z],
      verified_at: ~U[2026-03-10 10:50:00Z]
    },
    %{
      token: "ghi789",
      title: "Fixing lossy vibe picker layout mapping",
      description: "Tracked down layout state loss during picker transitions. Root cause: stale assigns.",
      duration_minutes: 28,
      turns: 41,
      files_changed: 6,
      loc_changed: "310",
      skills: ["LiveView", "Debugging"],
      recorded_at: ~U[2026-03-08 16:30:00Z],
      verified_at: ~U[2026-03-08 16:58:00Z]
    }
  ]

  @mock_project_detail %{
    title: "DataFlow Engine",
    slug: "dataflow-engine",
    description:
      "A real-time streaming data pipeline built with GenStage. Handles 50k events/sec with backpressure and partition-aware routing.",
    status: "active",
    started_at: ~U[2026-01-10 00:00:00Z],
    skills: ["Elixir", "GenStage", "PostgreSQL", "system-design"],
    session_count: 12,
    total_minutes: 540,
    files_touched: 89,
    loc_changed: "8.2k",
    dev_take:
      "Built this to replace our Kafka setup. GenStage's backpressure model is a better fit for our load profile — we needed partition-aware routing without the operational overhead of a JVM cluster.",
    architecture:
      "Three-stage pipeline: Producer (PostgreSQL logical replication) -> ProducerConsumer (partition router with consistent hashing) -> Consumer (batched writes to analytics store). Backpressure propagates upstream via demand signals."
  }

  def project(conn, %{"username" => username, "project" => slug}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      user ->
        project = Map.put(@mock_project_detail, :slug, slug)

        render(conn, :project,
          portfolio_user: user,
          project: project,
          sessions: @mock_project_sessions,
          page_title: "#{project.title} — #{user.display_name || user.username}",
          portfolio_layout: user.portfolio_layout || "editorial"
        )
    end
  end

  def show(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      user ->
        render(conn, :show,
          portfolio_user: user,
          projects: @mock_projects,
          collab_profile: @mock_collab_profile,
          metrics: @mock_metrics,
          recent_activity: @mock_recent_activity,
          page_title: user.display_name || user.username,
          portfolio_layout: user.portfolio_layout || "editorial"
        )
    end
  end
end
