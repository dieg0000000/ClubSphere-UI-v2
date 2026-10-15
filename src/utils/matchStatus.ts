export interface MatchStatusStyle {
  bg: string
  text: string
  label: string
}

const STATUS_MAP: Record<string, MatchStatusStyle> = {
  'planifié':     { bg: 'var(--info-soft)',    text: 'var(--info-text)',    label: 'Planifié' },
  'scheduled':    { bg: 'var(--info-soft)',    text: 'var(--info-text)',    label: 'Planifié' },
  'à confirmer':  { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'À confirmer' },
  'to_confirm':   { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'À confirmer' },
  'confirmé':     { bg: 'var(--success-soft)', text: 'var(--success-text)', label: 'Confirmé' },
  'confirmed':    { bg: 'var(--success-soft)', text: 'var(--success-text)', label: 'Confirmé' },
  'joué':         { bg: 'var(--bg-hover)',     text: 'var(--text-muted)',   label: 'Joué' },
  'played':       { bg: 'var(--bg-hover)',     text: 'var(--text-muted)',   label: 'Joué' },
  'annulé':       { bg: 'var(--danger-soft)',  text: 'var(--danger-text)',  label: 'Annulé' },
  'cancelled':    { bg: 'var(--danger-soft)',  text: 'var(--danger-text)',  label: 'Annulé' },
  'reporté':      { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'Reporté' },
  'postponed':    { bg: 'var(--warning-soft)', text: 'var(--warning-text)', label: 'Reporté' },
}

const FALLBACK: MatchStatusStyle = { bg: 'var(--bg-hover)', text: 'var(--text-muted)', label: '' }

export function getMatchStatusStyle(status: string): MatchStatusStyle {
  const s = STATUS_MAP[status.toLowerCase()]
  if (s) return s
  return { ...FALLBACK, label: status }
}

export function getMatchStatusLabel(status: string): string {
  return getMatchStatusStyle(status).label
}

/** Display score in home-first order (matching the title "Home vs Away"). */
export function displayScore(
  scoreFor: number,
  scoreAgainst: number,
  isHome: boolean,
): [number, number] {
  return isHome ? [scoreFor, scoreAgainst] : [scoreAgainst, scoreFor]
}

export function clubTodayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Coaches may enter the score on the match day and the two following calendar days (Europe/Zurich). */
export function isCoachScoreWindowOpen(matchDate: string): boolean {
  const limit = new Date(clubTodayISO() + 'T00:00:00Z')
  limit.setUTCDate(limit.getUTCDate() - 2)
  return matchDate.slice(0, 10) >= limit.toISOString().slice(0, 10)
}

/** Display penalties in home-first order. */
export function displayPenalties(
  penFor: number,
  penAgainst: number,
  isHome: boolean,
): [number, number] {
  return isHome ? [penFor, penAgainst] : [penAgainst, penFor]
}

/** Verdict line in French, based on score_for vs score_against (our goals). */
export function matchVerdict(
  scoreFor: number,
  scoreAgainst: number,
  forfeit: 'for' | 'against' | null,
): string {
  const [dHome, dAway] = [scoreFor, scoreAgainst]
  const suffix = forfeit ? ' (forfait)' : ''
  if (dHome > dAway) return `Victoire ${dHome}–${dAway}${suffix}`
  if (dHome < dAway) return `Défaite ${dHome}–${dAway}${suffix}`
  return `Match nul ${dHome}–${dAway}${suffix}`
}

/** All status values that represent an upcoming (non-cancelled/non-played) match */
export const UPCOMING_MATCH_STATUSES = [
  'planifié', 'scheduled',
  'à confirmer', 'to_confirm',
  'confirmé', 'confirmed',
  'planifie', 'a_confirmer',
]
