export function escapeMarkdownV2(text: string): string {
  if (!text) return "";
  // Telegram MarkdownV2 reserved characters that must be escaped if they are not part of a formatting entity
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
