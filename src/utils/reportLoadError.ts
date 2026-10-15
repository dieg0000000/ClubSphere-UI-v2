interface SupabaseError {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export function reportLoadError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  const parts: string[] = [`[ClubSphere] ${context}`]

  if (error && typeof error === 'object') {
    const e = error as SupabaseError
    if (e.code) parts.push(`code=${e.code}`)
    if (e.message) parts.push(e.message)
    if (e.details) parts.push(`details: ${e.details}`)
    if (e.hint) parts.push(`hint: ${e.hint}`)
  } else if (typeof error === 'string') {
    parts.push(error)
  }

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      parts.push(`${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    }
  }

  console.error(parts.join(' — '))
}
