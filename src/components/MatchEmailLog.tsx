import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { StatusPill } from './ui/StatusPill'
import { Alert } from './ui/Alert'

interface EmailLogRow {
  member_id: string
  member_name: string
  recipient_email: string
  recipient_name: string | null
  recipient_kind: string
  email_kind: string
  sent_at: string
  status: string
  status_at: string | null
  detail: string | null
}

interface Envoi {
  key: string
  emailKind: string
  sentAt: string
  rows: EmailLogRow[]
  delivered: number
  bounced: number
}

const dateFmt = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hour12: false })

const formatDate = (iso: string) => dateFmt.format(new Date(iso))
const formatTime = (iso: string) => timeFmt.format(new Date(iso))

function bounceReason(detail: string | null): string {
  const d = detail ?? ''
  if (/full|quota|insufficient storage/i.test(d)) return 'boîte de réception pleine'
  if (/does not exist|no such user|unknown user|user unknown|not found|invalid recipient|unknown recipient/i.test(d)) return 'adresse inexistante'
  return 'e-mail refusé'
}

function recipientName(row: EmailLogRow): string {
  return row.recipient_name || row.recipient_email
}

function bouncedLabel(row: EmailLogRow): string {
  return row.recipient_kind === 'parent' ? `${recipientName(row)} (parent de ${row.member_name})` : recipientName(row)
}

function statusPill(status: string) {
  if (status === 'delivered') return <StatusPill variant="green">Livré</StatusPill>
  if (status === 'opened') return <StatusPill variant="green">Ouvert</StatusPill>
  if (status === 'bounced') return <StatusPill variant="red">Non reçu</StatusPill>
  return <StatusPill variant="neutral">Inconnu</StatusPill>
}

function groupEnvois(rows: EmailLogRow[]): Envoi[] {
  const map = new Map<string, Envoi>()
  for (const row of rows) {
    const minute = Math.floor(new Date(row.sent_at).getTime() / 60000)
    const key = `${row.email_kind}|${minute}`
    let envoi = map.get(key)
    if (!envoi) {
      envoi = { key, emailKind: row.email_kind, sentAt: row.sent_at, rows: [], delivered: 0, bounced: 0 }
      map.set(key, envoi)
    }
    envoi.rows.push(row)
  }
  const envois = Array.from(map.values())
  for (const envoi of envois) {
    const delivered = new Set<string>()
    const bounced = new Set<string>()
    for (const r of envoi.rows) {
      if (r.status === 'delivered' || r.status === 'opened') delivered.add(r.recipient_email)
      else if (r.status === 'bounced') bounced.add(r.recipient_email)
    }
    envoi.delivered = delivered.size
    envoi.bounced = bounced.size
  }
  return envois.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
}

function groupByPlayer(rows: EmailLogRow[]) {
  const map = new Map<string, { name: string; recipients: Map<string, EmailLogRow> }>()
  for (const r of rows) {
    const key = r.member_id ?? r.member_name
    let player = map.get(key)
    if (!player) {
      player = { name: r.member_name, recipients: new Map() }
      map.set(key, player)
    }
    if (!player.recipients.has(r.recipient_email)) player.recipients.set(r.recipient_email, r)
  }
  return Array.from(map.entries()).map(([key, p]) => ({ key, name: p.name, recipients: Array.from(p.recipients.values()) }))
}

export default function MatchEmailLog({ matchId }: { matchId: string }) {
  const [rows, setRows] = useState<EmailLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    supabase.rpc('match_email_log', { p_match_id: matchId }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        setError(true)
        setRows([])
      } else {
        setRows(Array.isArray(data) ? (data as EmailLogRow[]) : [])
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [matchId])

  const envois = useMemo(() => groupEnvois(rows), [rows])

  const bouncedRecipients = useMemo(() => {
    const seen = new Map<string, EmailLogRow>()
    for (const r of rows) {
      if (r.status === 'bounced' && !seen.has(r.recipient_email)) seen.set(r.recipient_email, r)
    }
    return Array.from(seen.values())
  }, [rows])

  const latest = envois[0]

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden', marginTop: '24px' }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v) } }}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 20px', cursor: 'pointer', borderBottom: expanded ? '1px solid var(--border-color)' : 'none' }}
      >
        <Mail size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>Envois</span>
        <ChevronDown size={18} style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
      </div>

      {loading ? (
        <p style={{ padding: '0 20px 16px', fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Chargement…</p>
      ) : error ? (
        <div style={{ padding: '0 20px 16px' }}>
          <Alert variant="danger">Impossible de charger l'historique des envois.</Alert>
        </div>
      ) : !latest ? (
        <p style={{ padding: '0 20px 16px', fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Aucun e-mail enregistré pour ce match.</p>
      ) : !expanded ? (
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            {bouncedRecipients.length > 0 && (
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0, display: 'inline-block', transform: 'translateY(-1px)' }} />
            )}
            <span>
              {latest.emailKind} — envoi du {formatDate(latest.sentAt)} à {formatTime(latest.sentAt)} — {latest.delivered} {latest.delivered > 1 ? 'livrés' : 'livré'}, {latest.bounced} {latest.bounced > 1 ? 'non reçus' : 'non reçu'}
            </span>
          </p>
          {bouncedRecipients.map(r => (
            <p key={r.recipient_email} style={{ margin: 0, fontSize: '13px', color: 'var(--danger-text)', overflowWrap: 'anywhere' }}>
              Non reçu : {bouncedLabel(r)} — {bounceReason(r.detail)}. À prévenir autrement.
            </p>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {envois.map((envoi, i) => (
            <div key={envoi.key} style={{ padding: '16px 20px', borderTop: i > 0 ? '1px solid var(--border-color)' : 'none' }}>
              <p style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {envoi.emailKind} — {formatDate(envoi.sentAt)} à {formatTime(envoi.sentAt)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {groupByPlayer(envoi.rows).map(player => (
                  <div key={player.key}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{player.name}</p>
                    {player.recipients.map(r => (
                      <div key={r.recipient_email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                        <span style={{ fontSize: '13px', overflowWrap: 'anywhere', minWidth: 0, flex: '1 1 160px' }}>
                          <span style={{ color: 'var(--text-primary)' }}>{recipientName(r)}</span>
                          {recipientName(r) !== r.recipient_email && (
                            <>{' '}<span style={{ color: 'var(--text-muted)' }}>{r.recipient_email}</span></>
                          )}
                        </span>
                        {statusPill(r.status)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
