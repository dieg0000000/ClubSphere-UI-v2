import type { BadgeVariant } from '../components/ui/Badge'

const BADGE_CYCLE: BadgeVariant[] = ['blue', 'orange', 'violet', 'pink', 'green', 'sky']

export function getEventTypeBadgeVariant(type: string): BadgeVariant {
  let hash = 0
  for (let i = 0; i < type.length; i++) {
    hash = ((hash << 5) - hash + type.charCodeAt(i)) | 0
  }
  return BADGE_CYCLE[Math.abs(hash) % BADGE_CYCLE.length]
}

export function formatEventDate(dateString: string): string {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('fr-CH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatEventDateShort(dateString: string): string {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('fr-CH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

export function isEventPast(dateString: string): boolean {
  return new Date(dateString) < new Date()
}

export function isEventFull(registrationCount: number, maxAttendees?: number): boolean {
  if (!maxAttendees) return false
  return registrationCount >= maxAttendees
}

export function exportRegistrationsToCsv(
  eventTitle: string,
  registrations: Array<{
    full_name: string
    email: string
    is_volunteer: boolean
    volunteer_role?: string
    created_at: string
  }>
): void {
  const headers = ['Nom', 'Email', 'Bénévole', 'Rôle bénévole', 'Date d\'inscription']
  const rows = registrations.map(reg => [
    reg.full_name,
    reg.email,
    reg.is_volunteer ? 'Oui' : 'Non',
    reg.volunteer_role || '-',
    new Date(reg.created_at).toLocaleString('fr-CH')
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', `inscriptions_${eventTitle.replace(/\s+/g, '_')}.csv`)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
