export const MIN_PASSWORD_LENGTH = 10
export const PASSWORDS_MISMATCH = 'Les deux mots de passe ne correspondent pas'

export function passwordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH
}

export function mapPasswordAuthError(message: string | undefined | null): string[] | null {
  if (!message) return null
  const m = message.toLowerCase()
  const lines: string[] = []
  if (m.includes('at least 10 characters')) lines.push('Le mot de passe doit contenir au moins 10 caractères.')
  if (m.includes('known to be weak') || m.includes('easy to guess')) {
    lines.push('Ce mot de passe est trop courant (il figure dans des listes de mots de passe piratés). Choisissez-en un autre, par exemple une phrase de 3 mots.')
  }
  return lines.length ? lines : null
}

export function PasswordLengthHint({ password, errors }: { password: string; errors?: string[] | null }) {
  const ok = passwordLongEnough(password)
  return (
    <>
      <p className="text-xs mt-1" style={{ color: password.length > 0 && ok ? 'var(--success-text)' : 'var(--text-secondary)' }}>
        {password.length === 0 ? `${MIN_PASSWORD_LENGTH} caractères minimum` : `${Math.min(password.length, MIN_PASSWORD_LENGTH)}/${MIN_PASSWORD_LENGTH}`}
      </p>
      {errors?.map((line) => (
        <p key={line} className="text-xs mt-1" style={{ color: 'var(--danger-text)' }}>{line}</p>
      ))}
    </>
  )
}

export function PasswordMismatchHint({ password, confirmPassword }: { password: string; confirmPassword: string }) {
  if (confirmPassword.length === 0 || password === confirmPassword) return null
  return <p className="text-xs mt-1" style={{ color: 'var(--danger-text)' }}>{PASSWORDS_MISMATCH}</p>
}
