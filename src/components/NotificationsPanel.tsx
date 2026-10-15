import { useState, useEffect } from 'react'
import { Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Toggle } from './Toggle'
import { ProfileCard } from './ProfileLayout'
import { ensurePushSubscription, reactivatePushSubscription, pushSupported } from '../lib/pushSubscription'
import { useTenant } from '../context/TenantContext'
import Button from './ui/Button'
import { Link } from 'react-router-dom'
import { isNativeApp } from '../lib/nativeApp'
import { useNativePush } from '../hooks/useNativePush'
import { readLauncherDiagnostics } from '../lib/nativePush'
import { ConversationNotificationsCard } from './ConversationNotificationsCard'

interface Pref {
  category: string
  enabled: boolean
}

const CATEGORIES = [
  {
    key: 'messages',
    title: 'Messages et annonces',
    description: 'Messagerie d\'équipe et annonces du club',
  },
  {
    key: 'convocations',
    title: 'Convocations et rappels',
    description: 'Convocations aux matchs et rappels d\'entraînement',
  },
  {
    key: 'evenements',
    title: 'Événements et comités',
    description: 'Inscriptions aux événements et comités d\'organisation',
  },
]

export default function NotificationsPanel() {
  const { user, canRegisterPush } = useAuth()
  const { clubId } = useTenant()
  const [prefs, setPrefs] = useState<Pref[]>([])
  const [loading, setLoading] = useState(true)
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('unsupported')

  const [reactivating, setReactivating] = useState(false)
  const [reactivated, setReactivated] = useState(false)
  const nativePush = useNativePush(clubId)
  const native = isNativeApp()
  const [launcherDiagnostics] = useState(() => (native ? readLauncherDiagnostics() : null))

  useEffect(() => {
    if (pushSupported()) {
      setPermissionState(Notification.permission)
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    loadPrefs()
  }, [user?.id])

  async function loadPrefs() {
    const { data } = await supabase
      .from('notification_preferences')
      .select('category, enabled')
      .eq('user_id', user!.id)
    setPrefs(data || [])
    setLoading(false)
  }

  function isEnabled(category: string): boolean {
    const row = prefs.find(p => p.category === category)
    return row ? row.enabled : true
  }

  async function handleToggle(category: string, enabled: boolean) {
    setPrefs(prev => {
      const existing = prev.find(p => p.category === category)
      if (existing) return prev.map(p => p.category === category ? { ...p, enabled } : p)
      return [...prev, { category, enabled }]
    })

    await supabase.from('notification_preferences').upsert(
      {
        user_id: user!.id,
        category,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,category' }
    )
  }

  async function handleActivateDevice() {
    if (!pushSupported()) return
    const result = await Notification.requestPermission()
    setPermissionState(result)
    if (result === 'granted' && canRegisterPush) {
      await ensurePushSubscription(clubId)
    }
  }

  async function handleReactivate() {
    if (!canRegisterPush) return
    setReactivating(true)
    setReactivated(false)
    const ok = await reactivatePushSubscription(clubId)
    setReactivating(false)
    if (ok) setReactivated(true)
  }

  return (
    <div>
      <ProfileCard>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            Chargement...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {CATEGORIES.map((cat, i) => (
              <div
                key={cat.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 4px',
                  borderBottom: i < CATEGORIES.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
                  <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                    {cat.title}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    {cat.description}
                  </p>
                </div>
                <Toggle
                  checked={isEnabled(cat.key)}
                  onChange={(val) => handleToggle(cat.key, val)}
                />
              </div>
            ))}
          </div>
        )}
      </ProfileCard>

      <ConversationNotificationsCard />

      <div
        style={{
          marginTop: 20,
          padding: '16px 20px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
        }}
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Les notifications nécessitent d'avoir autorisé les notifications sur cet appareil.
        </p>

        {native ? (
          nativePush.enabled ? (
            <p style={{ fontSize: 13, color: 'var(--success-text)', margin: 0, fontWeight: 500 }}>
              Notifications de l'application : activées
            </p>
          ) : (
            <Button size="sm" onClick={nativePush.activate} loading={nativePush.activating}>
              Activer les notifications
            </Button>
          )
        ) : (<>
        {permissionState === 'default' && (
          <Button size="sm" onClick={handleActivateDevice}>
            Activer sur cet appareil
          </Button>
        )}

        {permissionState === 'granted' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--success-text)', margin: 0, fontWeight: 500 }}>
              Notifications activées sur cet appareil.
            </p>
            {reactivated ? (
              <p style={{ fontSize: 13, color: 'var(--success-text)', margin: 0, fontWeight: 500 }}>
                Notifications réactivées sur cet appareil.
              </p>
            ) : (
              <Button size="sm" onClick={handleReactivate} disabled={reactivating}>
                {reactivating ? 'Réactivation…' : 'Réactiver les notifications sur cet appareil'}
              </Button>
            )}
          </div>
        )}

        {permissionState === 'denied' && (
          <p style={{ fontSize: 13, color: 'var(--danger-text)', margin: 0 }}>
            Les notifications sont bloquées dans les paramètres de votre navigateur.
          </p>
        )}
        </>)}
      </div>

      {!isNativeApp() && (
      <div
        style={{
          marginTop: 16,
          padding: '14px 20px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Smartphone size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, flex: 1 }}>
          Sur iPhone, les notifications ne fonctionnent que si l'app est installée.
        </p>
        <Link
          to="/aide/installer"
          style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          Comment installer
        </Link>
      </div>
      )}

      {native && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '16px 4px 0', wordBreak: 'break-all', lineHeight: 1.5 }}>
          Diagnostic app : {launcherDiagnostics}
        </p>
      )}
    </div>
  )
}
