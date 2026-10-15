import type { BadgeVariant } from '../components/ui/Badge'

export interface ExpenseStatusInfo {
  label: string
  variant: BadgeVariant
}

const MAP: Record<string, ExpenseStatusInfo> = {
  submitted: { label: 'À traiter', variant: 'orange' },
  approved: { label: 'Approuvée', variant: 'blue' },
  reimbursed: { label: 'Remboursée', variant: 'green' },
  rejected: { label: 'Refusée', variant: 'red' },
  recorded: { label: 'Comptabilisée', variant: 'neutral' },
}

const FALLBACK: ExpenseStatusInfo = { label: '?', variant: 'neutral' }

export function getExpenseStatus(status: string): ExpenseStatusInfo {
  return MAP[status] ?? { label: status, variant: 'neutral' }
}

export function getExpenseStatusEntries(): [string, ExpenseStatusInfo][] {
  return Object.entries(MAP)
}

const ROW_TINTS: Record<string, string> = {
  approved: 'rgba(59,130,246,0.08)',
  reimbursed: 'rgba(34,197,94,0.08)',
  recorded: '#B5F5B5',
  rejected: 'rgba(239,68,68,0.08)',
}

export function getExpenseRowTint(status: string): string {
  return ROW_TINTS[status] ?? 'transparent'
}
