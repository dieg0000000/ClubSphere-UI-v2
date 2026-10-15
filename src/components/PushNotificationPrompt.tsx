import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { ensurePushSubscription, pushSupported } from '../lib/pushSubscription'
import Button from './ui/Button'
import { isNativeApp } from '../lib/nativeApp'
import { useNativePush } from '../hooks/useNativePush'

const DISMISS_KEY = 'push_prompt_dismissed_at'
const DISMISS_DAYS = 14

function isDismissed(): boolean {
  const ts = localStorage.getItem(DISMISS_KEY)
  if (!ts) return false
  const elapsed = Date.now() - Number(ts)
  return elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000
}

function isIosNotInstalled(): boolean {
  if (isNativeApp()) return false
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return isIos && (navigator as Navigator & { standalone?: boolean }).standalone !== true
}

export function PushNotificationPrompt() {
  return isNativeApp() ? <NativePushPrompt /> : <WebPushPrompt />
}

interface PromptCardProps {
  activateLabel: string
  onActivate: () => void
  onDismiss: () => void
  loading?: boolean
}

function PromptCard({ activateLabel, onActivate, onDismiss, loading }: PromptCardProps) {
  return (
    <div
      className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-0.5"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '16px 20px',
      }}
    >
      <div
        className="col-start-1 row-start-1 sm:row-span-2"
        style={{
          background: 'var(--accent)',
          borderRadius: '10px',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Bell size={20} style={{ color: 'var(--text-inverse)' }} />
      </div>

      <p
        className="col-start-2 row-start-1 min-w-0 sm:self-end"
        style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px', margin: 0 }}
      >
        Activez les notifications
      </p>

      <p
        className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:self-start"
        style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.4, margin: 0 }}
      >
        Recevez les messages et convocations de votre club directement sur votre appareil.
      </p>

      <div className="col-span-2 col-start-1 row-start-3 flex flex-col-reverse gap-2 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:flex-row sm:items-center sm:gap-3">
        <Button variant="ghost" size="sm" className="w-full sm:w-auto" onClick={onDismiss}>
          Plus tard
        </Button>
        <Button size="sm" className="w-full sm:w-auto" onClick={onActivate} loading={loading}>
          {activateLabel}
        </Button>
      </div>
    </div>
  )
}

function NativePushPrompt() {
  const { user } = useAuth()
  const { clubId } = useTenant()
  const { enabled, activating, activate } = useNativePush(clubId)
  const [dismissed, setDismissed] = useState(isDismissed)

  if (!user?.id || enabled || dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  return (
    <PromptCard
      activateLabel="Activer les notifications"
      onActivate={activate}
      onDismiss={handleDismiss}
      loading={activating}
    />
  )
}

function WebPushPrompt() {
  const { user, canRegisterPush } = useAuth()
  const { clubId } = useTenant()
  const [visible, setVisible] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    if (!pushSupported()) {
      if (isIosNotInstalled() && !isDismissed()) setIosHint(true)
      return
    }

    if (Notification.permission === 'granted') {
      if (canRegisterPush) ensurePushSubscription(clubId)
      return
    }

    if (Notification.permission === 'default' && !isDismissed()) {
      setVisible(true)
    }
  }, [user?.id, canRegisterPush])

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
    setIosHint(false)
  }

  if (iosHint) {
    return (
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <Smartphone size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, flex: 1 }}>
          Sur iPhone, les notifications ne fonctionnent que si l'app est installée.
        </p>
        <Link
          to="/aide/installer"
          style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          Comment installer
        </Link>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '13px',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          Plus tard
        </button>
      </div>
    )
  }

  if (!visible) return null

  const handleActivate = async () => {
    if (!pushSupported()) return
    const permission = await Notification.requestPermission()
    setVisible(false)
    if (permission === 'granted' && canRegisterPush) {
      await ensurePushSubscription(clubId)
    }
  }

  return <PromptCard activateLabel="Activer" onActivate={handleActivate} onDismiss={handleDismiss} />
}
