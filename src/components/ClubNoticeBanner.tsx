import { useState, useEffect, useRef, useCallback } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Button from './ui/Button'

const POLL_INTERVAL = 5 * 60 * 1000
const RESHOW_DELAY = 10_000

export function ClubNoticeBanner() {
  const [active, setActive] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const reshowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotice = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_club_notice')
    if (error || !data) {
      setActive(false)
      return
    }
    const result = data as { active: boolean; message?: string }
    setActive(result.active)
    setMessage(result.message ?? null)
    if (!result.active) {
      setDismissed(false)
      if (reshowTimer.current) { clearTimeout(reshowTimer.current); reshowTimer.current = null }
    }
  }, [])

  useEffect(() => {
    fetchNotice()
    pollTimer.current = setInterval(fetchNotice, POLL_INTERVAL)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
      if (reshowTimer.current) clearTimeout(reshowTimer.current)
    }
  }, [fetchNotice])

  const handleDismiss = () => {
    setDismissed(true)
    if (reshowTimer.current) clearTimeout(reshowTimer.current)
    reshowTimer.current = setTimeout(() => {
      setDismissed(false)
    }, RESHOW_DELAY)
  }

  if (!active || dismissed) return null

  const displayText = message || 'Votre cotisation est en attente de paiement.'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--overlay-bg)',
      padding: 20,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 640,
        background: 'var(--warning-soft)',
        border: '2px solid var(--warning)',
        borderRadius: 16,
        padding: '32px 28px',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        textAlign: 'center',
        position: 'relative',
      }}>
        <button
          onClick={handleDismiss}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 6,
            color: 'var(--warning-text)',
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="Fermer"
        >
          <X size={20} />
        </button>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--warning)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <TriangleAlert size={24} style={{ color: 'var(--text-inverse)' }} />
        </div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--warning-text)' }}>
          Rappel de paiement
        </h2>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--warning-text)', lineHeight: 1.5, opacity: 0.85 }}>
          {displayText}
        </p>
        <Button variant="warning" size="md" onClick={handleDismiss} style={{ marginTop: 8 }}>
          J'ai compris
        </Button>
      </div>
    </div>
  )
}
