import type { BadgeVariant } from '../components/ui/Badge'

export type AvailabilityStatus = 'disponible' | 'blesse' | 'malade' | 'pause'

const labels: Record<string, string> = {
  disponible: 'Disponible',
  blesse: 'Blessé',
  malade: 'Malade',
  pause: 'Pause',
}

const badges: Record<string, BadgeVariant> = {
  blesse: 'orange',
  malade: 'orange',
  pause: 'neutral',
}

export function availabilityLabel(status: string | null | undefined): string {
  return labels[status || 'disponible'] || 'Disponible'
}

export function availabilityBadgeVariant(status: string | null | undefined): BadgeVariant | null {
  if (!status || status === 'disponible') return null
  return badges[status] || null
}

export function formatReturnDate(until: string | null | undefined): string | null {
  if (!until) return null
  return new Date(until).toLocaleDateString('fr-CH')
}

export function availabilitySummary(
  status: string | null | undefined,
  until: string | null | undefined,
): string | null {
  if (!status || status === 'disponible') return null
  const label = labels[status] || status
  const date = formatReturnDate(until)
  return date ? `${label} jusqu'au ${date}` : label
}

export function isUnavailableForMatch(
  availability: string | null | undefined,
  availabilityUntil: string | null | undefined,
  matchDate: string,
): boolean {
  if (!availability || availability === 'disponible') return false
  if (!availabilityUntil) return true
  return availabilityUntil >= matchDate
}

export function unavailabilityBadgeText(
  availability: string | null | undefined,
  availabilityUntil: string | null | undefined,
): string {
  const label = labels[availability || 'disponible'] || (availability ?? 'Indisponible')
  const date = formatReturnDate(availabilityUntil)
  return date ? `Indisponible — ${label.toLowerCase()} jusqu'au ${date}` : `Indisponible — ${label.toLowerCase()}`
}
