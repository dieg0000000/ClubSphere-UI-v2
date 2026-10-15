import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/invokeFunction'
import { useTenant } from '../context/TenantContext'
import { ChevronLeft } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import type { BadgeVariant } from '../components/ui/Badge'

type CaseType = 'avs_not_found' | 'email_mismatch' | 'member_no_email' | 'parent_not_rep' | 'parent_avs_not_found'

const CASE_LABELS: Record<CaseType, string> = {
  avs_not_found: 'AVS introuvable',
  email_mismatch: 'Email différent',
  member_no_email: 'Membre sans email',
  parent_not_rep: 'Rattachement parent',
  parent_avs_not_found: 'Rattachement parent — enfant non identifié',
}

const CASE_BADGE_VARIANT: Record<CaseType, BadgeVariant> = {
  avs_not_found: 'red',
  email_mismatch: 'orange',
  member_no_email: 'yellow',
  parent_not_rep: 'blue',
  parent_avs_not_found: 'violet',
}

interface ActivationRow {
  id: string
  requester_email: string
  avs_input: string
  case_type: CaseType
  message: string | null
  member_id: string | null
  created_at: string
}

interface MemberInfo {
  first_name: string
  last_name: string
  team_name: string | null
}

const ACTION_FOR_CASE: Record<CaseType, string> = {
  member_no_email: 'resolve_set_email',
  email_mismatch: 'resolve_replace_email',
  avs_not_found: 'resolve_replace_email',
  parent_not_rep: 'resolve_link_parent',
  parent_avs_not_found: 'resolve_link_parent',
}

function actionForCaseType(ct: CaseType): string {
  return ACTION_FOR_CASE[ct] ?? 'resolve_replace_email'
}

const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CommitteeMobileActivations() {
  const { clubId } = useTenant()
  const navigate = useNavigate()
  const [rows, setRows] = useState<ActivationRow[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ActivationRow | null>(null)

  const fetchData = useCallback(async () => {
    if (!clubId) return
    setLoading(true)

    const { data } = await supabase
      .from('activation_requests')
      .select('id, requester_email, avs_input, case_type, message, member_id, created_at')
      .eq('club_id', clubId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    const items = (data || []) as ActivationRow[]
    setRows(items)

    const memberIds = [...new Set(items.map(r => r.member_id).filter((v): v is string => !!v))]
    if (memberIds.length > 0) {
      const { data: members } = await supabase
        .from('members')
        .select('id, first_name, last_name, team_id')
        .in('id', memberIds)

      const teamIds = [...new Set((members || []).map((m: any) => m.team_id).filter((v: any): v is string => !!v))]
      let teamNameById: Record<string, string> = {}
      if (teamIds.length > 0) {
        const { data: teams } = await supabase.from('teams').select('id, name').in('id', teamIds)
        ;(teams || []).forEach((t: any) => { teamNameById[t.id] = t.name })
      }

      const map: Record<string, MemberInfo> = {}
      ;(members || []).forEach((m: any) => {
        map[m.id] = {
          first_name: m.first_name || '',
          last_name: m.last_name || '',
          team_name: m.team_id ? teamNameById[m.team_id] || null : null,
        }
      })
      setMemberMap(map)
    } else {
      setMemberMap({})
    }

    setLoading(false)
  }, [clubId])

  useEffect(() => { fetchData() }, [fetchData])

  const memberLabel = (memberId: string | null): string | null => {
    if (!memberId) return null
    const m = memberMap[memberId]
    if (!m) return null
    const name = `${m.first_name} ${m.last_name}`.trim()
    const team = m.team_name
    return team ? `${name} · ${team}` : name
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, marginBottom: '8px', padding: 0 }}
      >
        <ChevronLeft size={16} /> Accueil
      </button>

      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px' }}>
        Activations
      </h1>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="animate-spin" style={{ width: 24, height: 24, border: '2.5px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
        </div>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>
          Aucune demande en attente
        </p>
      ) : (
        <>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            {rows.length} demande{rows.length !== 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            {rows.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', background: 'var(--bg-card)',
                  border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'var(--accent-soft, rgba(0,100,200,0.08))',
                  color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 700, flexShrink: 0,
                }}>
                  {(r.requester_email[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.requester_email}
                  </p>
                  <div style={{ marginTop: '3px' }}>
                    <Badge variant={CASE_BADGE_VARIANT[r.case_type]}>{CASE_LABELS[r.case_type]}</Badge>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {fmtDateTime(r.created_at)}
                    {memberLabel(r.member_id) && ` · ${memberLabel(r.member_id)}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <DetailSheet
          row={selected}
          memberLabel={memberLabel(selected.member_id)}
          onClose={() => setSelected(null)}
          onResolved={() => {
            setSelected(null)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

function DetailSheet({ row, memberLabel, onClose, onResolved }: {
  row: ActivationRow
  memberLabel: string | null
  onClose: () => void
  onResolved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmReject, setConfirmReject] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const callResolve = async (approve: boolean) => {
    setBusy(true)
    setErrorMsg(null)
    try {
      const action = approve ? actionForCaseType(row.case_type) : 'reject'
      const { data, error: fnErr } = await invokeFunction('resolve-activation', {
        body: { requestId: row.id, action },
      })
      if (fnErr) {
        setErrorMsg(fnErr || "Erreur lors de l'action")
        setBusy(false)
        return
      }
      if (data?.error) {
        setErrorMsg(data.error)
        setBusy(false)
        return
      }
      const msg = approve
        ? 'Accès validé — un email a été envoyé au demandeur'
        : 'Demande rejetée'
      setToast({ type: 'success', text: msg })
      setTimeout(() => onResolved(), 1200)
    } catch {
      setErrorMsg("Erreur lors de l'action")
      setBusy(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div
        style={{
          position: 'relative', marginTop: 'auto', background: 'var(--bg-card)',
          borderRadius: '16px 16px 0 0', padding: '20px', maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '0 auto 16px' }} />

        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Demande d'activation
        </h2>
        <div style={{ marginBottom: '14px' }}>
          <Badge variant={CASE_BADGE_VARIANT[row.case_type]}>{CASE_LABELS[row.case_type]}</Badge>
        </div>

        <InfoRow label="Email du demandeur" value={row.requester_email} />
        <InfoRow label="N° AVS saisi" value={row.avs_input || '—'} />
        <InfoRow label="Date" value={fmtDateTime(row.created_at)} />
        <InfoRow
          label="Joueur identifié"
          value={memberLabel || 'Joueur non identifié — vérifiez le numéro AVS sur la fiche'}
          muted={!memberLabel}
        />
        {row.message && <InfoRow label="Message" value={row.message} />}

        {errorMsg && (
          <div style={{
            marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
            background: 'var(--danger-soft, rgba(220,38,38,0.08))',
            color: 'var(--danger)', fontSize: '13px', fontWeight: 600,
          }}>
            {errorMsg}
          </div>
        )}

        {toast && (
          <div style={{
            marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
            background: toast.type === 'success' ? 'var(--success-soft, rgba(34,197,94,0.08))' : 'var(--danger-soft, rgba(220,38,38,0.08))',
            color: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
            fontSize: '13px', fontWeight: 600,
          }}>
            {toast.text}
          </div>
        )}

        {!toast && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            <button
              type="button"
              disabled={busy || !row.member_id}
              onClick={() => callResolve(true)}
              style={{
                flex: 1, padding: '12px',
                borderRadius: '10px', border: 'none',
                background: !row.member_id ? 'var(--border-color)' : 'var(--accent)',
                color: !row.member_id ? 'var(--text-muted)' : 'var(--text-inverse, #fff)',
                fontSize: '14px', fontWeight: 600,
                cursor: busy || !row.member_id ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? '...' : 'Approuver'}
            </button>

            {!confirmReject ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmReject(true)}
                style={{
                  flex: 1, padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-primary)',
                  fontSize: '14px', fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Rejeter
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => callResolve(false)}
                style={{
                  flex: 1, padding: '12px',
                  borderRadius: '10px', border: 'none',
                  background: 'var(--danger)',
                  color: 'var(--text-inverse, #fff)',
                  fontSize: '14px', fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? '...' : 'Rejeter cette demande ?'}
              </button>
            )}
          </div>
        )}

        {!row.member_id && !toast && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
            Impossible d'approuver sans joueur identifié.
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '12px', width: '100%', padding: '12px',
            background: 'var(--bg-hover)', color: 'var(--text-primary)',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)', gap: '12px' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: '13px', fontWeight: 600,
        color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
        textAlign: 'right', wordBreak: 'break-word',
        fontStyle: muted ? 'italic' : 'normal',
      }}>
        {value}
      </span>
    </div>
  )
}
