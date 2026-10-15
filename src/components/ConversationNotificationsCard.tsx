import { useEffect, useState } from 'react'
import { Toggle } from './Toggle'
import { ProfileCard } from './ProfileLayout'
import { Alert } from './ui/Alert'
import { ConversationTypeBadge } from './ConversationList'
import {
  type ConversationNotificationSetting,
  conversationSettingLabel,
  fetchConversationNotificationSettings,
  setConversationNotifications,
} from '../lib/conversationNotifications'

export function ConversationNotificationsCard() {
  const [settings, setSettings] = useState<ConversationNotificationSetting[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetchConversationNotificationSettings().then((rows) => {
      if (cancelled) return
      if (rows === null) {
        setLoadFailed(true)
        setSettings([])
      } else {
        setSettings(rows)
      }
    })
    return () => { cancelled = true }
  }, [])

  function applyEnabled(conversationId: string, enabled: boolean) {
    setSettings((prev) =>
      prev ? prev.map((s) => (s.conversation_id === conversationId ? { ...s, enabled } : s)) : prev
    )
  }

  async function handleToggle(setting: ConversationNotificationSetting, enabled: boolean) {
    const id = setting.conversation_id
    if (pending.has(id)) return
    setSaveError(false)
    applyEnabled(id, enabled)
    setPending((prev) => new Set(prev).add(id))
    const ok = await setConversationNotifications(id, enabled)
    setPending((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (!ok) {
      applyEnabled(id, !enabled)
      setSaveError(true)
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <ProfileCard>
        <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          Mes conversations
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>
          Choisissez les conversations pour lesquelles vous recevez des notifications. Les annonces du club sont toujours notifiées.
        </p>

        {saveError && (
          <Alert variant="danger" className="mt-3 mb-1" onClose={() => setSaveError(false)}>
            Impossible de modifier ce réglage.
          </Alert>
        )}

        {settings === null ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            Chargement...
          </div>
        ) : loadFailed ? (
          <Alert variant="danger" className="mt-3">
            Impossible de charger vos conversations.
          </Alert>
        ) : settings.length === 0 ? (
          <p style={{ padding: '24px 4px 8px', textAlign: 'center', fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            Aucune conversation pour le moment.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {settings.map((setting, i) => {
              const locked = !setting.lockable
              return (
                <div
                  key={setting.conversation_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '14px 4px',
                    borderBottom: i < settings.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: 'var(--text-primary)',
                        margin: 0,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {conversationSettingLabel(setting)}
                    </p>
                    {setting.type === 'team_full' && setting.team_category && (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                        {setting.team_category}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      <ConversationTypeBadge type={setting.type} name={setting.name} />
                      {locked && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Toujours activé</span>
                      )}
                    </div>
                  </div>
                  <Toggle
                    checked={locked ? true : setting.enabled}
                    disabled={locked}
                    onChange={(val) => handleToggle(setting, val)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </ProfileCard>
    </div>
  )
}
