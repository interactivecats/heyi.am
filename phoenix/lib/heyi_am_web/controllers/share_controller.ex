defmodule HeyiAmWeb.ShareController do
  use HeyiAmWeb, :controller

  alias HeyiAm.Shares
  alias HeyiAm.Repo

  @valid_templates MapSet.new(HeyiAm.Shares.Share.valid_templates())

  defp resolve_template(share) do
    template = Map.get(share, :template, "editorial")

    if MapSet.member?(@valid_templates, template),
      do: template,
      else: "editorial"
  end

  @gone_tokens MapSet.new(~w(deleted expired removed))

  @doc """
  Formats an integer LOC count into a human-readable string.
  e.g. 2400 → "2.4k", 890 → "890"
  """
  def format_loc(nil), do: "0"
  def format_loc(n) when is_integer(n) and n >= 1000 do
    "#{Float.round(n / 1000, 1)}k"
  end
  def format_loc(n) when is_integer(n), do: to_string(n)
  def format_loc(n) when is_binary(n), do: n

  defp load_share(token) do
    case Shares.get_share_by_token(token) do
      nil -> nil
      share -> Repo.preload(share, :user)
    end
  end

  defp build_session(share) do
    share
    |> Map.from_struct()
    |> Map.put(:loc_changed, format_loc(share.loc_changed))
    |> Map.put(:user, %{
      username: (share.user && share.user.username) || "anonymous",
      display_name: (share.user && (share.user.display_name || share.user.username)) || "Anonymous"
    })
    |> Map.put(:project, %{
      title: share.project_name,
      slug: slugify(share.project_name)
    })
  end

  defp slugify(nil), do: ""
  defp slugify(name) do
    name
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9\s-]/, "")
    |> String.replace(~r/\s+/, "-")
    |> String.trim("-")
  end

  def show(conn, %{"token" => token} = params) do
    if MapSet.member?(@gone_tokens, token) do
      conn
      |> put_status(:gone)
      |> put_view(HeyiAmWeb.ShareHTML)
      |> render(:gone, token: token)
    else
      case load_share(token) do
        nil ->
          conn
          |> put_status(:not_found)
          |> put_view(HeyiAmWeb.ErrorHTML)
          |> render(:"404")

        share ->
          session = build_session(share)

          template =
            case params["template"] do
              t when is_binary(t) and t != "" ->
                if MapSet.member?(@valid_templates, t), do: t, else: resolve_template(share)

              _ ->
                resolve_template(share)
            end

          render(conn, :show,
            session: session,
            page_title: session.title,
            portfolio_layout: template
          )
      end
    end
  end

  def transcript(conn, %{"token" => token}) do
    case load_share(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      share ->
        session = build_session(share)
        template = resolve_template(share)
        transcript_lines = share.transcript_excerpt || []
        total_turns = share.turns || 0
        shown_turns = length(transcript_lines)

        render(conn, :transcript,
          session: session,
          transcript: transcript_lines,
          skipped_turns: max(total_turns - shown_turns, 0),
          page_title: "Transcript — #{session.title}",
          portfolio_layout: template
        )
    end
  end

  def verify(conn, %{"token" => token}) do
    case load_share(token) do
      nil ->
        conn
        |> put_status(:not_found)
        |> put_view(HeyiAmWeb.ErrorHTML)
        |> render(:"404")

      share ->
        session = build_session(share)

        content_hash = HeyiAm.Signature.content_hash(share)
        signed = HeyiAm.Signature.signed?(share)
        verified = HeyiAm.Signature.verify(share) == :ok

        signature_status =
          cond do
            verified -> "verified"
            signed -> "invalid"
            true -> "unverified"
          end

        verification = %{
          token: token,
          hash: content_hash,
          signature: share.signature,
          public_key: share.public_key,
          signature_status: signature_status,
          recorded_at: share.recorded_at,
          verified_at: share.verified_at
        }

        render(conn, :verify,
          session: session,
          verification: verification,
          page_title: "Verify — #{session.title}"
        )
    end
  end
end
