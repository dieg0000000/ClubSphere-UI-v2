import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, Trash2, RotateCcw, CalendarDays, MapPin, ChevronLeft, ChevronRight, CircleCheck, CircleX, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import { LoadError } from '../components/LoadError'
import { Badge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { ConfirmModal } from '../components/ConfirmModal'
import { StandardModal } from '../components/StandardModal'
import { Alert } from '../components/ui/Alert'

interface Option {
  id: string
  starts_at: string
  ends_at: string | null
  position: number
  yes: number
  no: number
  my_answer: 'yes' | 'no' | null
}

interface Invitee {
  user_id: string
  name: string
  reason: string | null
  answers: Record<string, 'yes' | 'no'>
}

interface PollDetail {
  id: string
  kind: 'single' | 'dates'
  title: string
  description: string | null
  location: string | null
  status: 'open' | 'closed'
  final_option_id: string | null
  created_at: string
  closed_at: string | null
  created_by_name: string
  can_manage: boolean
  is_invitee: boolean
  options: Option[]
  invitees: Invitee[]
  audience?: {
    all_coaches: boolean
    committee: boolean
    operational: boolean
    teams: { team_id: string; name: string; staff: boolean; players: boolean; parents: boolean }[]
  }
}

const fmtRange = (iso: string, endIso: string | null) => {
  const d = new Date(iso)
  const date = d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' })
  const time = d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
  if (endIso) {
    const e = new Date(endIso)
    const eTime = e.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
    return `${date} · ${time} – ${eTime}`
  }
  return `${date} · ${time}`
}

const pillBase: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 10px',
  borderRadius: '999px',
  fontWeight: 600,
  fontSize: '13px',
  textAlign: 'center',
  lineHeight: 1.3,
  whiteSpace: 'normal',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
}

export default function PollDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast, showToast } = useToast()
  const [poll, setPoll] = useState<PollDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [acting, setActing] = useState(false)
  const [respondingOpt, setRespondingOpt] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [closeOptionId, setCloseOptionId] = useState<string | null>(null)
  const [mobileOptIdx, setMobileOptIdx] = useState(0)

  const load = useCallback(async () => {
    if (!id) return
    setLoadFailed(false)
    try {
      const { data, error } = await supabase.rpc('get_poll_detail', { p_poll_id: id })
      if (error) throw error
      setPoll(data as unknown as PollDetail)
    } catch (err) {
      console.error('[Sondages]', err)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onFocus = () => load()
    document.addEventListener('visibilitychange', () => { if (!document.hidden) onFocus() })
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [load])

  useEffect(() => {
    if (poll) document.title = `${poll.title} - ClubSphere`
  }, [poll])

  const respond = async (optionId: string, current: 'yes' | 'no' | null, desired: 'yes' | 'no') => {
    if (!poll) return
    const answer = current === desired ? null : desired

    const prevOptions = poll.options
    setPoll({
      ...poll,
      options: poll.options.map(o => {
        if (o.id !== optionId) return o
        let yes = o.yes
        let no = o.no
        if (current === 'yes') yes--
        if (current === 'no') no--
        if (answer === 'yes') yes++
        if (answer === 'no') no++
        return { ...o, my_answer: answer, yes, no }
      }),
    })
    setRespondingOpt(optionId)

    try {
      const { error } = await supabase.rpc('set_poll_response', { p_option_id: optionId, p_answer: answer })
      if (error) throw error
      await load()
      showToast(answer === null ? 'Votre réponse a été retirée' : 'Votre réponse a été enregistrée', 'success')
    } catch (err: any) {
      console.error('[Sondages]', err)
      showToast(err.message || 'Erreur', 'error')
      setPoll({ ...poll, options: prevOptions })
    } finally {
      setRespondingOpt(null)
    }
  }

  const handleClose = async () => {
    if (!poll) return
    setActing(true)
    try {
      const { error } = await supabase.rpc('close_poll', { p_poll_id: poll.id, p_final_option_id: closeOptionId })
      if (error) throw error
      setShowClose(false)
      await load()
      showToast('Sondage clôturé', 'success')
    } catch (err: any) {
      console.error('[Sondages]', err)
      showToast(err.message || 'Erreur', 'error')
    } finally {
      setActing(false)
    }
  }

  const handleReopen = async () => {
    if (!poll) return
    setActing(true)
    try {
      const { error } = await supabase.rpc('reopen_poll', { p_poll_id: poll.id })
      if (error) throw error
      await load()
      showToast('Sondage rouvert', 'success')
    } catch (err: any) {
      console.error('[Sondages]', err)
      showToast(err.message || 'Erreur', 'error')
    } finally {
      setActing(false)
    }
  }

  const handleDelete = async () => {
    if (!poll) return
    setActing(true)
    try {
      const { error } = await supabase.rpc('delete_poll', { p_poll_id: poll.id })
      if (error) throw error
      navigate('/sondages', { replace: true })
    } catch (err: any) {
      console.error('[Sondages]', err)
      showToast(err.message || 'Erreur', 'error')
      setActing(false)
    }
  }

  const handleEdit = () => {
    if (!poll) return
    navigate(`/sondages/${poll.id}/modifier`, {
      state: {
        edit: {
          kind: poll.kind,
          title: poll.title,
          description: poll.description,
          location: poll.location,
          options: poll.options,
          audience: poll.audience ?? { all_coaches: false, committee: false, operational: false, teams: [] },
        },
      },
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--accent)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
        </div>
      </div>
    )
  }

  if (loadFailed || !poll) return <LoadError onRetry={load} />

  const sortedOpts = [...poll.options].sort((a, b) => a.position - b.position)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const totalInvitees = poll.invitees.length
  const allAnswered = poll.is_invitee && sortedOpts.length > 0 && sortedOpts.every(o => o.my_answer !== null)
  const hasAnyAnswer = poll.is_invitee && sortedOpts.some(o => o.my_answer !== null)

  const finalOptionLabel = poll.final_option_id
    ? (() => { const fo = sortedOpts.find(o => o.id === poll.final_option_id); return fo ? fmtRange(fo.starts_at, fo.ends_at) : null })()
    : null

  return (
    <div>
      <button
        onClick={() => navigate('/sondages')}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: '14px', marginBottom: '16px', padding: 0 }}
      >
        <ArrowLeft size={18} /> Sondages
      </button>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <Badge variant={poll.kind === 'single' ? 'blue' : 'orange'}>
            {poll.kind === 'single' ? 'Invitation' : 'Sondage de dates'}
          </Badge>
          {poll.status === 'closed' && <Badge variant="neutral">Terminé</Badge>}
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>{poll.title}</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
          Organisé par {poll.created_by_name}
        </p>
        {poll.description && (
          <p style={{ fontSize: '14px', color: 'var(--text-primary)', margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{poll.description}</p>
        )}
        {poll.location && (
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={14} /> Lieu : {poll.location}
          </div>
        )}
      </div>

      {/* Status banner for invitees */}
      {poll.is_invitee && (
        <div style={{ marginBottom: '16px' }}>
          {poll.status === 'closed' ? (
            <Alert variant="info">
              Sondage terminé.{finalOptionLabel ? ` Date retenue : ${finalOptionLabel}` : ''}
            </Alert>
          ) : allAnswered ? (
            <Alert variant="success">
              Vous avez répondu. Vous pouvez modifier votre réponse jusqu'à la clôture.
            </Alert>
          ) : (
            <Alert variant="info">
              Vous n'avez pas encore répondu{hasAnyAnswer ? ' à toutes les dates' : ''}. Choisissez « Je participe » ou « Absent » pour chaque date.
            </Alert>
          )}
        </div>
      )}

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {sortedOpts.map(opt => {
          const isFinal = poll.final_option_id === opt.id
          const noAnswer = totalInvitees - opt.yes - opt.no
          const isResponding = respondingOpt === opt.id
          return (
            <div
              key={opt.id}
              style={{
                background: isFinal ? 'var(--success-soft)' : 'var(--bg-card)',
                border: `1px solid ${isFinal ? 'var(--success)' : 'var(--border-color)'}`,
                borderRadius: '12px',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <CalendarDays size={16} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {fmtRange(opt.starts_at, opt.ends_at)}
                </span>
                {isFinal && <Badge variant="green">Date retenue</Badge>}
              </div>

              {(() => { const c = fmtPollCount(opt.yes, opt.no, noAnswer); return (
              <div style={{ fontSize: '12px', marginBottom: poll.is_invitee && poll.status === 'open' ? '10px' : '0' }}>
                <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>{c.p}</span>
                {' · '}
                <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>{c.a}</span>
                {' · '}
                <span style={{ color: 'var(--text-muted)' }}>{c.n}</span>
              </div>
              ) })()}

              {poll.is_invitee && poll.status === 'open' && (
                <>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '6px' }}>
                    Ma réponse
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', width: '100%' }}>
                    <button
                      type="button"
                      disabled={isResponding}
                      onClick={() => respond(opt.id, opt.my_answer, 'yes')}
                      style={{
                        ...pillBase,
                        background: opt.my_answer === 'yes' ? 'var(--success-soft)' : 'transparent',
                        color: opt.my_answer === 'yes' ? 'var(--success-text)' : 'var(--text-secondary)',
                        border: `1px solid ${opt.my_answer === 'yes' ? 'var(--success)' : 'var(--border-color)'}`,
                        cursor: isResponding ? 'not-allowed' : 'pointer',
                        opacity: isResponding ? 0.6 : 1,
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CircleCheck size={12} aria-hidden="true" />Je participe
                      </span>
                      {opt.my_answer === 'yes' && (
                        <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.7 }}>annuler</span>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isResponding}
                      onClick={() => respond(opt.id, opt.my_answer, 'no')}
                      style={{
                        ...pillBase,
                        background: opt.my_answer === 'no' ? 'var(--danger-soft)' : 'transparent',
                        color: opt.my_answer === 'no' ? 'var(--danger-text)' : 'var(--text-secondary)',
                        border: `1px solid ${opt.my_answer === 'no' ? 'var(--danger)' : 'var(--border-color)'}`,
                        cursor: isResponding ? 'not-allowed' : 'pointer',
                        opacity: isResponding ? 0.6 : 1,
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CircleX size={12} aria-hidden="true" />Absent
                      </span>
                      {opt.my_answer === 'no' && (
                        <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.7 }}>annuler</span>
                      )}
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '8px', color: opt.my_answer === 'yes' ? 'var(--success-text)' : opt.my_answer === 'no' ? 'var(--danger-text)' : 'var(--text-muted)' }}>
                    {opt.my_answer === 'yes' ? 'Votre réponse : Je participe' : opt.my_answer === 'no' ? 'Votre réponse : Absent' : 'Vous n\'avez pas encore répondu'}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile totals per option */}
      {isMobile && sortedOpts.length > 0 && poll.invitees.length > 0 && (() => {
        const totals = optionTotals(poll.invitees, sortedOpts)
        return (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>Totaux</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {sortedOpts.map((opt, i) => {
                const h = fmtColumnHeader(opt.starts_at, opt.ends_at)
                const t = totals[i]
                return (
                  <div key={opt.id} style={{ fontSize: '12px', lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.fullDate}</span>
                    {' : '}
                    {(() => { const c = fmtPollCount(t.yes, t.no, t.none); return (<>
                    <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>{c.p}</span>
                    {' · '}
                    <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>{c.a}</span>
                    {' · '}
                    <span style={{ color: 'var(--text-muted)' }}>{c.n}</span>
                    </>) })()}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Responses table */}
      {poll.invitees.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>Réponses</h2>

          {isMobile && sortedOpts.length > 1 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <button disabled={mobileOptIdx === 0} onClick={() => setMobileOptIdx(i => i - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: mobileOptIdx === 0 ? 'var(--text-tertiary)' : 'var(--accent)' }}>
                  <ChevronLeft size={20} />
                </button>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {fmtColumnHeader(sortedOpts[mobileOptIdx].starts_at, sortedOpts[mobileOptIdx].ends_at).fullDate}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                    {fmtColumnHeader(sortedOpts[mobileOptIdx].starts_at, sortedOpts[mobileOptIdx].ends_at).timePart}
                  </div>
                </div>
                <button disabled={mobileOptIdx === sortedOpts.length - 1} onClick={() => setMobileOptIdx(i => i + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: mobileOptIdx === sortedOpts.length - 1 ? 'var(--text-tertiary)' : 'var(--accent)' }}>
                  <ChevronRight size={20} />
                </button>
              </div>
              {renderInviteeList(poll.invitees, [sortedOpts[mobileOptIdx]])}
            </>
          ) : (
            renderInviteeTable(poll.invitees, sortedOpts, poll.kind)
          )}
        </div>
      )}

      {/* Mobile: only show Modifier */}
      {isMobile && poll.can_manage && poll.status === 'open' && (
        <div style={{ marginBottom: '24px' }}>
          <Button
            variant="secondary"
            onClick={handleEdit}
            leftIcon={<Pencil size={18} />}
            disabled={acting}
          >
            Modifier
          </Button>
        </div>
      )}

      {/* Desktop: Organisateur management section */}
      {!isMobile && poll.can_manage && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Organisateur</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            Clôturer fige les réponses et fixe la date retenue. Les invités n'ont rien d'autre à faire après avoir répondu.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {poll.status === 'open' && (
              <>
                <Button
                  variant="secondary"
                  onClick={handleEdit}
                  leftIcon={<Pencil size={18} />}
                  disabled={acting}
                >
                  Modifier
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (poll.kind === 'dates') {
                      setCloseOptionId(null)
                      setShowClose(true)
                    } else {
                      handleCloseSimple()
                    }
                  }}
                  leftIcon={<Lock size={18} />}
                  disabled={acting}
                >
                  Clôturer
                </Button>
              </>
            )}
            {poll.status === 'closed' && (
              <Button variant="secondary" onClick={handleReopen} leftIcon={<RotateCcw size={18} />} disabled={acting}>
                Rouvrir
              </Button>
            )}
            <Button variant="danger" onClick={() => setShowDelete(true)} leftIcon={<Trash2 size={18} />} disabled={acting}>
              Supprimer
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDelete}
        title="Supprimer le sondage"
        message="Supprimer ce sondage et toutes les réponses ?"
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        confirmStyle="danger"
        loading={acting}
        loadingLabel="Suppression..."
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />

      {showClose && poll.kind === 'dates' && (
        <StandardModal isOpen title="Clôturer le sondage" subtitle="Choisir la date retenue (facultatif)" onClose={() => setShowClose(false)} width="480px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', background: closeOptionId === null ? 'var(--accent-soft)' : 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <input type="radio" name="finalOpt" checked={closeOptionId === null} onChange={() => setCloseOptionId(null)} style={{ accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Aucune</span>
            </label>
            {sortedOpts.map(opt => (
              <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', background: closeOptionId === opt.id ? 'var(--accent-soft)' : 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                <input type="radio" name="finalOpt" checked={closeOptionId === opt.id} onChange={() => setCloseOptionId(opt.id)} style={{ accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{fmtRange(opt.starts_at, opt.ends_at)}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{opt.yes} oui</span>
              </label>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px' }}>
              <Button variant="ghost" onClick={() => setShowClose(false)}>Annuler</Button>
              <Button onClick={handleClose} disabled={acting}>{acting ? 'Clôture...' : 'Clôturer'}</Button>
            </div>
          </div>
        </StandardModal>
      )}

      <Toast toast={toast} />
    </div>
  )

  function handleCloseSimple() {
    setActing(true)
    supabase.rpc('close_poll', { p_poll_id: poll!.id, p_final_option_id: null })
      .then(({ error }) => {
        if (error) { showToast(error.message, 'error'); setActing(false); return }
        load().then(() => { showToast('Sondage clôturé', 'success'); setActing(false) })
      })
  }
}

function fmtPollCount(participants: number, absents: number, noAnswer: number) {
  const p = participants >= 2 ? `${participants} participent` : `${participants} participe`
  const a = absents >= 2 ? `${absents} absents` : `${absents} absent`
  const n = `${noAnswer} sans réponse`
  return { p, a, n }
}

function fmtColumnHeader(iso: string, endIso: string | null) {
  const d = new Date(iso)
  const fullDate = d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' })
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'Europe/Zurich' }).replace(/\.?$/, '.')
  const startTime = d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
  let timePart = `${weekday} · ${startTime}`
  if (endIso) {
    const e = new Date(endIso)
    timePart += ` – ${e.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })}`
  }
  return { fullDate, timePart }
}

function AnswerPill({ answer }: { answer: 'yes' | 'no' | undefined }) {
  if (answer === 'yes') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: '999px', fontSize: '12px', fontWeight: 600,
      background: 'var(--success-soft)', color: 'var(--success-text)',
      whiteSpace: 'nowrap',
    }}>Participe</span>
  )
  if (answer === 'no') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: '999px', fontSize: '12px', fontWeight: 600,
      background: 'var(--danger-soft)', color: 'var(--danger-text)',
      whiteSpace: 'nowrap',
    }}>Absent</span>
  )
  return <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
}

function answerBg(a: 'yes' | 'no' | undefined): string | undefined {
  if (a === 'yes') return 'var(--success-soft)'
  if (a === 'no') return 'var(--danger-soft)'
  return undefined
}

function optionTotals(invitees: Invitee[], opts: Option[]) {
  return opts.map(opt => {
    let yes = 0
    let no = 0
    for (const inv of invitees) {
      const a = inv.answers[opt.id]
      if (a === 'yes') yes++
      else if (a === 'no') no++
    }
    return { yes, no, none: invitees.length - yes - no }
  })
}

function TotalsCell({ yes, no, none }: { yes: number; no: number; none: number }) {
  const c = fmtPollCount(yes, no, none)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '12px', lineHeight: 1.4 }}>
      <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>{c.p}</span>
      <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>{c.a}</span>
      <span style={{ color: 'var(--text-muted)' }}>{c.n}</span>
    </div>
  )
}

function renderInviteeTable(invitees: Invitee[], opts: Option[], kind: 'single' | 'dates') {
  const isSingle = kind === 'single'
  const totals = optionTotals(invitees, opts)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>Nom</th>
            {opts.map(opt => {
              const h = fmtColumnHeader(opt.starts_at, opt.ends_at)
              return (
                <th key={opt.id} style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '1px solid var(--border-color)', minWidth: '100px', verticalAlign: 'bottom' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.3 }}>{h.fullDate}</div>
                  <div style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.3 }}>{h.timePart}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {invitees.map(inv => {
            const singleAnswer = isSingle ? inv.answers[opts[0]?.id] : undefined
            const rowBg = isSingle ? answerBg(singleAnswer) : undefined
            return (
              <tr key={inv.user_id} style={{ background: rowBg }}>
                <td style={{ padding: '8px 12px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  {inv.name}
                  {inv.reason && <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)' }}>{inv.reason}</span>}
                </td>
                {opts.map(opt => {
                  const a = inv.answers[opt.id]
                  const cellBg = !isSingle ? answerBg(a) : undefined
                  return (
                    <td key={opt.id} style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '1px solid var(--border-color)', background: cellBg }}>
                      <AnswerPill answer={a} />
                    </td>
                  )
                })}
              </tr>
            )
          })}
          <tr style={{ borderTop: '2px solid var(--border-color)' }}>
            <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px' }}>Total</td>
            {totals.map((t, i) => (
              <td key={i} style={{ textAlign: 'center', padding: '10px 6px', verticalAlign: 'top' }}>
                <TotalsCell yes={t.yes} no={t.no} none={t.none} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function renderInviteeList(invitees: Invitee[], opts: Option[]) {
  const opt = opts[0]
  const totals = optionTotals(invitees, [opt])[0]
  return (
    <div>
      {invitees.map(inv => {
        const a = inv.answers[opt.id]
        return (
          <div key={inv.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: '1px', borderBottom: '1px solid var(--border-color)', borderRadius: '6px', background: answerBg(a) }}>
            <div>
              <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{inv.name}</span>
              {inv.reason && <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)' }}>{inv.reason}</span>}
            </div>
            <AnswerPill answer={a} />
          </div>
        )
      })}
      <div style={{ padding: '10px 0', fontSize: '12px', lineHeight: 1.6 }}>
        {(() => { const c = fmtPollCount(totals.yes, totals.no, totals.none); return (<>
        <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>{c.p}</span>
        {' · '}
        <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>{c.a}</span>
        {' · '}
        <span style={{ color: 'var(--text-muted)' }}>{c.n}</span>
        </>) })()}
      </div>
    </div>
  )
}
