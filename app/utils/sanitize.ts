/**
 * Lightweight XSS protection for user-generated text.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function stripControlChars(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

export function sanitizeChat(message: string, maxLen = 200): string {
  return stripControlChars(message).trim().slice(0, maxLen)
}

/** Simple spam detection: repeated chars / identical messages */
export function isSpammy(message: string, recentMessages: string[]): boolean {
  if (message.length > 3) {
    const repeated = /(.)\1{8,}/.test(message)
    if (repeated) return true
  }
  const sameCount = recentMessages.filter(m => m === message).length
  return sameCount >= 3
}
