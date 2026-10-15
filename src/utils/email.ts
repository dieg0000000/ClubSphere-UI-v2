const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(s: string): boolean {
  if (!s) return false
  const trimmed = s.trim()
  if (trimmed.length === 0 || trimmed.length > 254) return false
  if (trimmed.includes('\n') || trimmed.includes('\r')) return false
  return EMAIL_REGEX.test(trimmed)
}
