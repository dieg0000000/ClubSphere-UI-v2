import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getTermsStatus, type TermsStatus } from '../lib/terms'
import { TermsLink } from './TermsCheckbox'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function TermsAcceptanceSection() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [status, setStatus] = useState<TermsStatus | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getTermsStatus(userId)
      .then((s) => { if (!cancelled) setStatus(s) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  if (!status?.accepted || !status.version || !status.accepted_at) return null

  return (
    <div className="rounded-lg px-6 py-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-start gap-3">
        <FileText className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--text-secondary)' }} />
        <div className="space-y-1">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {`Conditions d'utilisation acceptées le ${formatDate(status.accepted_at)} (version ${status.version})`}
          </p>
          <TermsLink version={status.version} url={status.url} />
        </div>
      </div>
    </div>
  )
}
