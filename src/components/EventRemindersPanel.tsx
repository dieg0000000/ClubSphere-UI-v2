import { useEffect, useState, useCallback } from 'react'
import { Bell, Send, CircleCheck as CheckCircle2, Loader as Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Button from './ui/Button'
import { Badge } from './ui/Badge'

interface Props {
  eventId: string
  onUpdated?: () => void
}

interface EventState {
  type: string | null
  is_registerable: boolean | null
}

const FALLBACK_DAYS = [1, 3, 8]

function classifyType(t: string | null | undefined): 'repas' | 'tournoi' | 'ag' | 'evenement' {
  const x = (t || '').toLowerCase()
  if (x.includes('repas') || x.includes('support meal') || x.includes('soutien')) return 'repas'
  if (x.includes('tournoi') || x.includes('tournament')) return 'tournoi'
  if (x.includes('ag') || x.includes('assembl') || x.includes('general assembly')) return 'ag'
  return 'evenement'
}

export default function EventRemindersPanel({ eventId, onUpdated }: Props) {
  const [event, setEvent] = useState<EventState | null>(null)
  const [reminderDays, setReminderDays] = useState<number[]>(FALLBACK_DAYS)
  const [configEnabled, setConfigEnabled] = useState<boolean>(true)
  const [sentMap, setSentMap] = useState<Record<number, string>>({})
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ day: number; current: number; total: number; status: 'sending' | 'success' | 'error' } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    const [{ data: ev }, { data: cfg }, { data: sent }] = await Promise.all([
      supabase.from('events').select('type, is_registerable').eq('id', eventId).maybeSingle(),
      supabase
        .from('club_notification_config')
        .select('enabled, reminder_days_array')
        .eq('notification_type', 'event_reminder')
        .maybeSingle(),
      supabase
        .from('event_reminders_sent')
        .select('days_before, sent_at')
        .eq('event_id', eventId),
    ])

    setEvent(ev as EventState | null)

    if (cfg) {
      setConfigEnabled(!!cfg.enabled)
      const days = Array.isArray(cfg.reminder_days_array) && cfg.reminder_days_array.length > 0
        ? [...cfg.reminder_days_array].sort((a: number, b: number) => b - a)
        : FALLBACK_DAYS
      setReminderDays(days)
    }

    const map: Record<number, string> = {}
    for (const row of sent || []) {
      map[row.days_before] = row.sent_at
    }
    setSentMap(map)

    if (!ev) {
      setRecipientCount(0)
      return
    }

    const cat = classifyType(ev.type)
    let count = 0

    if (cat === 'repas') {
      const { count: c } = await supabase
        .from('event_public_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'confirmed')
      count = c || 0
    } else if (cat === 'tournoi') {
      const { count: vc } = await supabase
        .from('event_volunteers')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .neq('status', 'refused')
      const { count: sc } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .in('role', ['admin', 'committee', 'president', 'vice_president'])
        .not('email', 'is', null)
      count = (vc || 0) + (sc || 0)
    } else if (cat === 'ag') {
      const { count: c } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .in('role', ['member', 'parent', 'admin', 'committee', 'president', 'vice_president'])
        .not('email', 'is', null)
      count = c || 0
    } else {
      if (ev.is_registerable) {
        const { count: c } = await supabase
          .from('event_public_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('status', 'confirmed')
        count = c || 0
        if (count === 0) {
          const { count: ac } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .not('email', 'is', null)
          count = ac || 0
        }
      } else {
        const { count: ac } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .not('email', 'is', null)
        count = ac || 0
      }
    }
    setRecipientCount(count)
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const sendReminder = async (days_before: number) => {
    setSending(days_before)
    const total = Math.max(1, recipientCount ?? 1)
    setProgress({ day: days_before, current: 0, total, status: 'sending' })
    const estimatedMs = Math.max(800, Math.ceil(total / 4) * 1000)
    const startedAt = Date.now()
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const ratio = Math.min(0.95, elapsed / estimatedMs)
      setProgress(prev => prev
        ? { ...prev, current: Math.min(prev.total - 1, Math.floor(ratio * prev.total)) }
        : prev)
    }, 150)
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-event-reminder`
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event_id: eventId, days_before, force: true }),
      })
      const json = await resp.json()
      window.clearInterval(tick)
      if (!resp.ok) throw new Error(json.error || 'Erreur')
      const sent = json.sent_count || 0
      const skipped = json.skipped_count || 0
      setProgress({ day: days_before, current: sent + skipped, total: Math.max(total, sent + skipped), status: skipped > 0 ? 'error' : 'success' })
      showToast(`Rappel envoye a ${sent} destinataire(s)${skipped > 0 ? ` (${skipped} ignore(s))` : ''}${json.simulated ? ' (mode simule)' : ''}`)
      await load()
      onUpdated?.()
    } catch (err) {
      window.clearInterval(tick)
      setProgress({ day: days_before, current: 0, total, status: 'error' })
      showToast(err instanceof Error ? err.message : 'Erreur lors de l\'envoi', 'error')
    } finally {
      setSending(null)
      window.setTimeout(() => setProgress(null), 1500)
    }
  }

  const formatSentAt = (iso: string | null) => {
    if (!iso) return null
    return new Date(iso).toLocaleString('fr-CH', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (!event) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Bell size={16} style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Rappels automatiques</h3>
        {!configEnabled && (
          <Badge variant="neutral">Desactive</Badge>
        )}
        {recipientCount !== null && (
          <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{recipientCount}</strong> destinataire{recipientCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {reminderDays.length === 0 ? (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          Aucun rappel configure. Definir les jours dans Admin &gt; Notifications.
        </p>
      ) : (
        <div className="space-y-2">
          {reminderDays.map((day) => {
            const sentFormatted = formatSentAt(sentMap[day] || null)
            const isSending = sending === day
            const label = day === 1 ? 'J-1 (la veille)' : `J-${day} (${day} jours avant)`
            return (
              <div
                key={day}
                className="flex items-center justify-between rounded-lg px-4 py-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', minWidth: '170px' }}>
                    {label}
                  </span>
                  {sentFormatted ? (
                    <Badge variant="green" icon={<CheckCircle2 size={12} />}>
                      Envoye le {sentFormatted}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">Non envoye</Badge>
                  )}
                </div>
                {progress && progress.day === day ? (
                  <div style={{ minWidth: '200px' }}>
                    <div
                      className="relative overflow-hidden rounded-full"
                      style={{ height: '24px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.round((progress.current / Math.max(1, progress.total)) * 100))}%`,
                          background: progress.status === 'error'
                            ? 'var(--danger)'
                            : progress.status === 'success'
                              ? 'var(--success)'
                              : 'var(--accent)',
                        }}
                      />
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}
                      >
                        {progress.status === 'success'
                          ? `Envoye (${progress.current} / ${progress.total})`
                          : progress.status === 'error'
                            ? `Erreur (${progress.current} / ${progress.total})`
                            : `Envoi... ${progress.current} / ${progress.total}`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => sendReminder(day)}
                    disabled={isSending}
                    leftIcon={isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  >
                    {sentFormatted ? 'Renvoyer' : 'Envoyer maintenant'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div
          className="px-3 py-2 rounded-lg text-xs"
          style={{
            background: toast.type === 'success' ? 'var(--success-soft)' : 'var(--danger-soft)',
            border: `1px solid ${toast.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
            color: toast.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
