/**
 * Strip AI-internal XML tags from assistant text content.
 */
export function cleanAssistantText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/<antml_[a-z_]+>[\s\S]*?<\/antml_[a-z_]+>/g, "");
  cleaned = cleaned.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
  cleaned = cleaned.replace(/<teammate-message[^>]*>[\s\S]*?<\/teammate-message>/g, "");
  cleaned = cleaned.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "");
  cleaned = cleaned.replace(/<fast_mode_info>[\s\S]*?<\/fast_mode_info>/g, "");
  cleaned = cleaned.replace(/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}
