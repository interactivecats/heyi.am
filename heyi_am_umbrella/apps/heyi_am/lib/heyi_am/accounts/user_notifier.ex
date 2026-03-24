defmodule HeyiAm.Accounts.UserNotifier do
  @moduledoc """
  Delivers transactional emails for user account operations.

  Each email is sent in both HTML and plain text formats. The HTML
  uses table-based layout with inline styles for broad email client
  compatibility (Gmail, Outlook, Apple Mail, Fastmail).
  """

  import Swoosh.Email
  alias HeyiAm.Mailer
  alias HeyiAm.Accounts.User

  # -- Delivery ------------------------------------------------------------

  defp deliver(recipient, subject, text_body, html_body) do
    email =
      new()
      |> to(recipient)
      |> from({"heyi.am", "hello@heyi.am"})
      |> subject(subject)
      |> text_body(text_body)
      |> html_body(html_body)

    with {:ok, _metadata} <- Mailer.deliver(email) do
      {:ok, email}
    end
  end

  # -- Public API -----------------------------------------------------------

  @doc """
  Delivers instructions to confirm a new email address.
  """
  def deliver_update_email_instructions(user, url) do
    text =
      text_layout("""
      Click the link below to confirm changing your email address.

      #{url}

      If you didn't request this change, ignore this email.\
      """)

    html =
      html_layout(
        html_paragraph("Click the button below to confirm changing your email address.") <>
          html_button("Confirm new email", url) <>
          html_fallback_url(url) <>
          html_muted_paragraph("If you didn't request this change, ignore this email.")
      )

    deliver(user.email, "Confirm your new email address", text, html)
  end

  @doc """
  Deliver instructions to log in with a magic link.
  """
  def deliver_login_instructions(user, url) do
    case user do
      %User{confirmed_at: nil} -> deliver_confirmation_instructions(user, url)
      _ -> deliver_magic_link_instructions(user, url)
    end
  end

  defp deliver_magic_link_instructions(user, url) do
    text =
      text_layout("""
      You can log into your account by visiting the URL below:

      #{url}

      If you didn't request this email, please ignore this.\
      """)

    html =
      html_layout(
        html_paragraph("Click the button below to log into your account.") <>
          html_button("Log in to heyi.am", url) <>
          html_fallback_url(url) <>
          html_muted_paragraph("If you didn't request this email, please ignore this.")
      )

    deliver(user.email, "Log in to heyi.am", text, html)
  end

  defp deliver_confirmation_instructions(user, url) do
    text =
      text_layout("""
      You can confirm your account by visiting the URL below:

      #{url}

      If you didn't create an account with us, please ignore this.\
      """)

    html =
      html_layout(
        html_paragraph("Click the button below to confirm your account.") <>
          html_button("Confirm my account", url) <>
          html_fallback_url(url) <>
          html_muted_paragraph("If you didn't create an account with us, please ignore this.")
      )

    deliver(user.email, "Confirm your heyi.am account", text, html)
  end

  @doc """
  Delivers instructions to reset a user password.
  """
  def deliver_reset_password_instructions(user, url) do
    text =
      text_layout("""
      You can reset your password by visiting the URL below:

      #{url}

      If you didn't request this change, ignore this email.\
      """)

    html =
      html_layout(
        html_paragraph("Click the button below to reset your password.") <>
          html_button("Reset password", url) <>
          html_fallback_url(url) <>
          html_muted_paragraph("If you didn't request this change, ignore this email.")
      )

    deliver(user.email, "Reset your password", text, html)
  end

  @doc """
  Delivers a welcome email after sign-up with getting started instructions.
  """
  def deliver_welcome(user) do
    text =
      text_layout("""
      Welcome to heyi.am! Your account is ready.

      Here's how to get started:

      1. Install the CLI
         Run this in your terminal:

          npx heyiam

      2. Record your first session
         Start a coding session with your AI tool of choice
         (Claude Code, Cursor, Copilot, etc.) and let the CLI
         capture the conversation.

      3. Upload it
         When you're done, run:

          npx heyiam upload

         Your session becomes a case study on your portfolio
         at https://heyi.am/#{user.username || "your-username"}

      That's it. Ship work, show thinking.\
      """)

    html =
      html_layout(
        html_paragraph("Welcome to heyi.am! Your account is ready.") <>
          html_paragraph("Here's how to get started:") <>
          html_step("1", "Install the CLI",
            "Run this in your terminal to get started.") <>
          html_code_block("npx heyiam") <>
          html_step("2", "Record your first session",
            "Start a coding session with your AI tool of choice " <>
            "(Claude Code, Cursor, Copilot, etc.) and let the CLI capture the conversation.") <>
          html_step("3", "Upload it",
            "When you're done, upload your session. It becomes a case study on your portfolio.") <>
          html_code_block("npx heyiam upload") <>
          html_paragraph("That's it. Ship work, show thinking.") <>
          html_button("View your portfolio", "https://heyi.am/#{user.username || "your-username"}")
      )

    deliver(user.email, "Welcome to heyi.am", text, html)
  end

  # -- Plain text helpers ---------------------------------------------------

  defp text_layout(body) do
    """
    heyi.am
    =======

    #{String.trim(body)}

    --
    The heyi.am team — https://heyiam.com
    """
  end

  # -- HTML helpers ---------------------------------------------------------

  @font_body ~s(-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif)
  @font_mono ~s('SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace)

  @color_bg "#f4f4f5"
  @color_card "#ffffff"
  @color_text "#52525b"
  @color_text_muted "#a1a1aa"
  @color_border "#e4e4e7"
  @color_primary "#084471"
  @color_code_bg "#f4f4f5"

  defp html_layout(content) do
    """
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>heyi.am</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #{@color_bg}; font-family: #{@font_body}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #{@color_bg};">
        <tr>
          <td align="center" style="padding: 40px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width: 480px; width: 100%; background-color: #{@color_card}; border-radius: 8px; border: 1px solid #{@color_border};">
              <tr>
                <td style="padding: 32px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="font-family: #{@font_mono}; font-size: 18px; font-weight: 700; color: #18181b; padding-bottom: 16px;">
                        heyi.am
                      </td>
                    </tr>
                    <tr>
                      <td style="border-top: 1px solid #{@color_border}; padding-bottom: 24px; line-height: 0; font-size: 0;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 32px 32px 32px; color: #{@color_text}; font-size: 15px; line-height: 24px;">
                  #{content}
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width: 480px; width: 100%;">
              <tr>
                <td align="center" style="padding: 24px 32px 0 32px; font-family: #{@font_body}; font-size: 12px; line-height: 18px; color: #{@color_text_muted};">
                  Sent by heyi.am &middot; <a href="https://heyiam.com" style="color: #{@color_text_muted}; text-decoration: underline;">heyiam.com</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """
  end

  defp html_paragraph(text) do
    """
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="font-family: #{@font_body}; font-size: 15px; line-height: 24px; color: #{@color_text}; padding-bottom: 16px;">
          #{text}
        </td>
      </tr>
    </table>
    """
  end

  defp html_muted_paragraph(text) do
    """
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="font-family: #{@font_body}; font-size: 13px; line-height: 20px; color: #{@color_text_muted}; padding-bottom: 8px;">
          #{text}
        </td>
      </tr>
    </table>
    """
  end

  defp html_button(label, url) do
    """
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding-bottom: 16px;">
      <tr>
        <td align="left">
          <a href="#{url}" target="_blank" style="display: inline-block; background-color: #{@color_primary}; color: #ffffff; font-family: #{@font_body}; font-size: 14px; font-weight: 600; line-height: 40px; text-align: center; text-decoration: none; border-radius: 6px; padding: 0 24px; -webkit-text-size-adjust: none;">
            #{label}
          </a>
        </td>
      </tr>
    </table>
    """
  end

  defp html_fallback_url(url) do
    """
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="font-family: #{@font_body}; font-size: 12px; line-height: 18px; color: #{@color_text_muted}; padding-bottom: 16px;">
          Or copy this link:<br />
          <a href="#{url}" style="font-family: #{@font_mono}; font-size: 12px; color: #{@color_primary}; text-decoration: underline; word-break: break-all;">#{url}</a>
        </td>
      </tr>
    </table>
    """
  end

  defp html_step(number, title, description) do
    """
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding-bottom: 8px;">
      <tr>
        <td width="28" valign="top" style="padding-top: 2px;">
          <div style="width: 22px; height: 22px; border-radius: 50%; background-color: #{@color_primary}; color: #ffffff; font-family: #{@font_body}; font-size: 12px; font-weight: 700; line-height: 22px; text-align: center;">
            #{number}
          </div>
        </td>
        <td style="padding-left: 10px; font-family: #{@font_body}; font-size: 15px; line-height: 24px; color: #{@color_text};">
          <strong style="color: #18181b;">#{title}</strong><br />
          <span style="font-size: 14px; color: #{@color_text};">#{description}</span>
        </td>
      </tr>
    </table>
    """
  end

  defp html_code_block(code) do
    """
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding-bottom: 16px;">
      <tr>
        <td style="background-color: #{@color_code_bg}; border: 1px solid #{@color_border}; border-radius: 6px; padding: 12px 16px; font-family: #{@font_mono}; font-size: 14px; line-height: 20px; color: #18181b;">
          #{code}
        </td>
      </tr>
    </table>
    """
  end
end
