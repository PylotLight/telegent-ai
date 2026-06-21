export function escapeMarkdownV2(text: string): string {
  if (!text) return "";
  // Telegram MarkdownV2 reserved characters that must be escaped if they are not part of a formatting entity
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// A regex to match standard markdown code blocks (```...```)
const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;

export function escapeMarkdownV2WithCode(text: string): string {
  if (!text) return "";
  
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Escape the text before the code block
    const plainText = text.substring(lastIndex, match.index);
    result += plainText.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');

    // Reconstruct the code block WITHOUT escaping the inside
    const lang = match[1] || "";
    const code = match[2] || "";
    result += "```" + lang + "\n" + code + "```";
    
    lastIndex = codeBlockRegex.lastIndex;
  }

  // Escape any remaining text after the last code block
  const remainingText = text.substring(lastIndex);
  result += remainingText.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');

  return result;
}