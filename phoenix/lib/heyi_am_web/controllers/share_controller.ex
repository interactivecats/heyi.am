defmodule HeyiAmWeb.ShareController do
  use HeyiAmWeb, :controller

  @mock_session %{
    token: "abc123",
    title: "Ripping out auth and rebuilding with phx.gen.auth",
    dev_take:
      "The existing auth was frankencode — three different token systems layered on top of each other. I told the AI to tear it all out and start fresh with phx.gen.auth. It wanted to patch. I said no. The migration from sessions-in-database to stateless JWT took 4 pivots, but the result is clean, testable, and actually secure.",
    duration_minutes: 47,
    turns: 77,
    files_changed: 34,
    loc_changed: "2.4k",
    recorded_at: ~U[2026-03-12 14:02:00Z],
    verified_at: ~U[2026-03-12 14:49:00Z],
    sealed?: false,
    template: "editorial",
    language: "Elixir",
    tools: ["Elixir", "Phoenix", "PostgreSQL"],
    skills: ["Elixir", "Phoenix", "Authentication", "Security", "Database Migration"],
    user: %{
      username: "ben",
      display_name: "heyi.am contributors",
      avatar_url: nil
    },
    project: %{
      title: "heyi.am",
      slug: "heyi-am"
    },
    beats: [
      %{label: "Deep review of existing auth flow", description: "Found 3 overlapping token systems"},
      %{label: "Attempted patch — rejected", description: "AI suggested incremental fix"},
      %{label: "Fresh scaffold with phx.gen.auth", description: "Clean start from generated code"},
      %{label: "Schema migration", description: "Moved user data to new auth tables"},
      %{label: "GitHub OAuth rebuild", description: "Rewired OAuth flow on new auth system"},
      %{label: "Device auth flow", description: "CLI-to-web bridge rebuilt"},
      %{label: "309 tests passing", description: "Full green on first run"}
    ],
    qa_pairs: [
      %{
        question: "Why did you choose to tear out auth entirely rather than refactor incrementally?",
        answer: "Because three token systems layered on each other is a security liability, not tech debt. You can't reason about what's valid."
      },
      %{
        question: "What was the hardest part of the migration?",
        answer: "Moving the device authorization flow. It's the bridge between CLI and web — if that breaks, nobody can publish."
      },
      %{
        question: "The AI suggested patching — why did you override it?",
        answer: "It kept trying to preserve backwards compatibility with the old session tokens. But those were the problem. Clean break or nothing."
      },
      %{
        question: "What would you tell another dev facing the same situation?",
        answer: "Don't patch auth. If you can't draw the token flow on a whiteboard in 2 minutes, start over."
      },
      %{
        question: "What's the one thing you'd do differently?",
        answer: "I'd write the migration script first before touching any code. I ended up doing it manually which was error-prone."
      }
    ],
    highlights: [
      %{type: "pivot", title: "Rejected AI's patch approach", description: "Chose clean rewrite over incremental fix when AI kept preserving broken token logic."},
      %{type: "win", title: "309 tests passing on first run", description: "Clean migration resulted in zero test regressions despite full auth rewrite."},
      %{type: "insight", title: "Device auth is the critical bridge", description: "The CLI-to-web auth flow is the hardest part — break it and nobody can publish."}
    ],
    tool_breakdown: [
      %{name: "Read", count: 142},
      %{name: "Edit", count: 92},
      %{name: "Write", count: 64},
      %{name: "Bash", count: 58},
      %{name: "Grep", count: 36},
      %{name: "Glob", count: 20}
    ],
    top_files: [
      %{path: "lib/heyi_am_web/controllers/user_session_controller.ex", touches: 12},
      %{path: "lib/heyi_am/accounts.ex", touches: 9},
      %{path: "lib/heyi_am/accounts/user.ex", touches: 7},
      %{path: "lib/heyi_am_web/user_auth.ex", touches: 6},
      %{path: "test/heyi_am_web/user_auth_test.exs", touches: 5}
    ],
    transcript_excerpt: [
      %{role: :dev, text: "The existing auth was frankencode"},
      %{role: :ai, text: "I can help patch..."},
      %{role: :dev, text: "No. Tear it all out."}
    ],
    narrative:
      "This session began with a critical review of the existing authentication system. The developer identified three overlapping token mechanisms that had accumulated over months of feature development — session tokens in the database, API tokens for CLI access, and machine tokens for device authorization.\n\nWhen the AI suggested an incremental refactoring approach, the developer pushed back firmly: the layered token systems represented a security liability, not mere technical debt. The decision was made to move the existing Phoenix application to a backup directory and scaffold fresh using phx.gen.auth.\n\nThe migration required careful handling of the device authorization flow — the bridge between CLI and web that enables session publishing. Four pivots occurred during this phase as edge cases in token refresh and session management surfaced. The final result: a clean, testable authentication system with 309 tests passing on first run.",
    turn_timeline: [
      %{turn: 1, prompt: "Review existing auth flow", tools: ["Read", "Grep"]},
      %{turn: 2, prompt: "AI suggests incremental patch", tools: ["Read"]},
      %{turn: 3, prompt: "Override: tear it all out", tools: ["Bash"]},
      %{turn: 4, prompt: "Scaffold fresh with phx.gen.auth", tools: ["Bash", "Write"]},
      %{turn: 5, prompt: "Migrate user schema", tools: ["Edit", "Read"]},
      %{turn: 6, prompt: "Rebuild OAuth flow", tools: ["Edit", "Write", "Read"]},
      %{turn: 7, prompt: "Wire device authorization", tools: ["Edit", "Read", "Bash"]},
      %{turn: 8, prompt: "Run full test suite — 309 passing", tools: ["Bash"]}
    ]
  }

  @mock_transcript [
    %{
      role: :dev,
      id: "REQ-001",
      timestamp: "00:00:12",
      text: "The existing auth was frankencode — three different token systems layered on top of each other. I told the AI to tear it all out and start fresh with phx.gen.auth. It wanted to patch. I said no.",
      decision: nil
    },
    %{
      role: :ai,
      id: "RES-001",
      timestamp: "00:00:15",
      text: "I understand you want to clean up the auth system. Let me first analyze what we have. I can see three separate token systems: a session-based approach in auth_plug.ex, JWT tokens in api_auth.ex, and the old Phoenix.Token approach in remember_me_plug.ex.\n\nI'd recommend we patch incrementally — start by unifying the session approach...",
      decision: nil
    },
    %{
      role: :dev,
      id: "REQ-002",
      timestamp: "00:01:30",
      text: "No. Tear it all out. Start fresh with phx.gen.auth. Move the entire phoenix directory to phoenix_old and scaffold a new app.",
      decision: %{label: "Critical Decision", text: "Developer overrides AI suggestion to patch incrementally. Chooses full teardown instead.", color: "primary"}
    },
    %{
      role: :ai,
      id: "RES-002",
      timestamp: "00:01:45",
      text: "Understood. I'll move phoenix/ to phoenix_old/ and scaffold a fresh Phoenix app with mix phx.new, then run mix phx.gen.auth Accounts User users to get a clean auth foundation.\n\nExecuting now...",
      decision: nil
    },
    %{
      role: :ai,
      id: "RES-003",
      timestamp: "00:05:22",
      text: "Fresh app scaffolded. Auth generated. Now migrating schemas from phoenix_old/ one by one. Starting with the User schema...",
      decision: nil
    },
    %{
      role: :ai,
      id: "RES-077",
      timestamp: "00:47:12",
      text: "All tests passing. 309 tests, 0 failures. The new auth system is clean, uses phx.gen.auth as the foundation, with GitHub OAuth and device authorization layered on top properly.",
      decision: %{label: "Session Complete", text: "309 tests passing. Auth rebuild complete.", color: "secondary"}
    }
  ]

  @valid_templates MapSet.new(HeyiAm.Shares.Share.valid_templates())

  defp resolve_template(session) do
    template = Map.get(session, :template, "editorial")

    if MapSet.member?(@valid_templates, template),
      do: template,
      else: "editorial"
  end

  @gone_tokens MapSet.new(~w(deleted expired removed))

  def show(conn, %{"token" => token} = params) do
    if MapSet.member?(@gone_tokens, token) do
      conn
      |> put_status(:gone)
      |> put_view(HeyiAmWeb.ShareHTML)
      |> render(:gone, token: token)
    else
      session = Map.put(@mock_session, :token, token)

      template =
        case params["template"] do
          t when is_binary(t) and t != "" ->
            if MapSet.member?(@valid_templates, t), do: t, else: resolve_template(session)

          _ ->
            resolve_template(session)
        end

      render(conn, :show,
        session: session,
        page_title: session.title,
        portfolio_layout: template
      )
    end
  end

  def transcript(conn, %{"token" => token}) do
    session = Map.put(@mock_session, :token, token)
    template = resolve_template(session)

    render(conn, :transcript,
      session: session,
      transcript: @mock_transcript,
      skipped_turns: 72,
      page_title: "Transcript — #{session.title}",
      portfolio_layout: template
    )
  end

  def verify(conn, %{"token" => token}) do
    session = Map.put(@mock_session, :token, token)

    # Build verification from Signature module using mock session as a map
    content_hash = HeyiAm.Signature.content_hash(session)
    signed = HeyiAm.Signature.signed?(session)
    verified = HeyiAm.Signature.verify(session) == :ok

    signature_status =
      cond do
        verified -> "verified"
        signed -> "invalid"
        true -> "unverified"
      end

    verification = %{
      token: token,
      hash: content_hash,
      signature: session[:signature],
      public_key: session[:public_key],
      signature_status: signature_status,
      recorded_at: session.recorded_at,
      verified_at: session[:verified_at]
    }

    render(conn, :verify,
      session: session,
      verification: verification,
      page_title: "Verify — #{session.title}"
    )
  end
end
