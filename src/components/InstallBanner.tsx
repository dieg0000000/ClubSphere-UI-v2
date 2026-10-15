import { useState, useEffect } from 'react'
import { X, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { isNativeApp } from '../lib/nativeApp'

const DISMISS_KEY = 'install_banner_dismissed_at'
const DISMISS_DAYS = 30

function isDismissed(): boolean {
  const ts = localStorage.getItem(DISMISS_KEY)
  if (!ts) return false
  return Date.now() - Number(ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000
}

function isStandalone(): boolean {
  if (isNativeApp()) return true
  if ((navigator as any).standalone) return true
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return false
}

export function InstallBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (isDismissed()) return
    const mq = window.matchMedia('(max-width: 768px)')
    if (mq.matches) setVisible(true)
  }, [])

  if (!visible) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--accent)',
        color: 'var(--text-inverse)',
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <Download size={18} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        Installez l'app de votre club sur votre téléphone{' '}
        <Link
          to="/aide/installer"
          style={{ color: 'var(--text-inverse)', fontWeight: 600, textDecoration: 'underline' }}
        >
          Comment faire ?
        </Link>
      </span>
      <button
        onClick={handleDismiss}
        aria-label="Fermer"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-inverse)',
          cursor: 'pointer',
          padding: 4,
          flexShrink: 0,
          opacity: 0.8,
        }}
      >
        <X size={18} />
      </button>
    </div>
  )
}
