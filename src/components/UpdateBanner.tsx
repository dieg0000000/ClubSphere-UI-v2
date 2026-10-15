import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import Button from './ui/Button'
import { UPDATE_AVAILABLE_EVENT, reloadForUpdate, type UpdateAvailableDetail } from '../lib/appUpdate'

export function UpdateBanner() {
  const [updateKey, setUpdateKey] = useState<string | null>(null)

  useEffect(() => {
    const onAvailable = (e: Event) => setUpdateKey((e as CustomEvent<UpdateAvailableDetail>).detail.key)
    window.addEventListener(UPDATE_AVAILABLE_EVENT, onAvailable)
    return () => window.removeEventListener(UPDATE_AVAILABLE_EVENT, onAvailable)
  }, [])

  if (!updateKey) return null

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-32px)] max-w-md bottom-[calc(var(--bottom-nav-h,64px)+var(--bottom-nav-gap,12px)+env(safe-area-inset-bottom,0px)+8px)] lg:bottom-6"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 12,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-lg)',
        color: 'var(--text-primary)',
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      <RefreshCw size={18} style={{ flexShrink: 0, color: 'var(--accent)' }} />
      <span style={{ flex: 1, fontWeight: 500 }}>Nouvelle version disponible</span>
      <Button variant="primary" size="sm" onClick={() => reloadForUpdate(updateKey)}>
        Mettre à jour
      </Button>
    </div>
  )
}
