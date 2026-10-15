import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import Button from '../components/ui/Button'
import { ConfirmModal } from '../components/ConfirmModal'

interface DateLine {
  id: string | null
  date: string
  startTime: string
  endTime: string
}

interface AvailableTeam {
  id: string
  name: string
  parents_allowed: boolean
}

interface TeamFlags {
  checked: boolean
  staff: boolean
  players: boolean
  parents: boolean
}

interface EditPayload {
  kind: 'single' | 'dates'
  title: string
  description: string | null
  location: string | null
  options: { id: string; starts_at: string; ends_at: string | null; position: number }[]
  audience: {
    all_coaches: boolean
    committee: boolean
    operational: boolean
    teams: { team_id: string; name: string; staff: boolean; players: boolean; parents: boolean }[]
  }
}

function isoToDateLine(opt: { id: string; starts_at: string; ends_at: string | null }): DateLine {
  const s = new Date(opt.starts_at)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const date = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`
  const startTime = `${pad(s.getHours())}:${pad(s.getMinutes())}`
  let endTime = ''
  if (opt.ends_at) {
    const e = new Date(opt.ends_at)
    endTime = `${pad(e.getHours())}:${pad(e.getMinutes())}`
  }
  return { id: opt.id, date, startTime, endTime }
}

export default function PollCreate() {
  const navigate = useNavigate()
  const { id: editId } = useParams<{ id: string }>()
  const locationState = useLocation().state as { edit?: EditPayload } | null
  const isEdit = !!editId && !!locationState?.edit

  const { user } = useAuth()
  const { clubId } = useTenant()
  const { toast, showToast } = useToast()

  const editData = locationState?.edit

  const [kind, setKind] = useState<'single' | 'dates'>(editData?.kind ?? 'single')
  const [title, setTitle] = useState(editData?.title ?? '')
  const [description, setDescription] = useState(editData?.description ?? '')
  const [location, setLocation] = useState(editData?.location ?? '')
  const [dates, setDates] = useState<DateLine[]>(() => {
    if (editData?.options?.length) {
      return [...editData.options]
        .sort((a, b) => a.position - b.position)
        .map(o => isoToDateLine(o))
    }
    return [{ id: null, date: '', startTime: '', endTime: '' }]
  })
  const [originalDates] = useState<DateLine[]>(() => {
    if (editData?.options?.length) {
      return [...editData.options]
        .sort((a, b) => a.position - b.position)
        .map(o => isoToDateLine(o))
    }
    return []
  })
  const [allCoaches, setAllCoaches] = useState(editData?.audience?.all_coaches ?? false)
  const [committee, setCommittee] = useState(editData?.audience?.committee ?? false)
  const [operational, setOperational] = useState(editData?.audience?.operational ?? false)
  const [teamFlags, setTeamFlags] = useState<Record<string, TeamFlags>>({})
  const [availableTeams, setAvailableTeams] = useState<AvailableTeam[]>([])
  const [saving, setSaving] = useState(false)
  const [clubWide, setClubWide] = useState(false)
  const [showDateConfirm, setShowDateConfirm] = useState(false)

  useEffect(() => {
    document.title = isEdit ? 'Modifier le sondage - ClubSphere' : 'Nouveau sondage - ClubSphere'
  }, [isEdit])

  useEffect(() => {
    if (!clubId || !user) return
    const loadPermissions = async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_poll_permissions', { p_club_id: clubId })
        if (error) throw error
        if (data?.club_wide) setClubWide(true)
        const rpcTeams: AvailableTeam[] = (data?.teams ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          parents_allowed: !!t.parents_allowed,
        }))
        setAvailableTeams(rpcTeams)

        if (editData?.audience?.teams?.length) {
          const parentsMap = new Map(rpcTeams.map(t => [t.id, t.parents_allowed]))
          const initial: Record<string, TeamFlags> = {}
          for (const at of editData.audience.teams) {
            initial[at.team_id] = {
              checked: true,
              staff: at.staff,
              players: at.players,
              parents: parentsMap.get(at.team_id) ? at.parents : false,
            }
          }
          setTeamFlags(initial)
        }
      } catch (err) {
        console.error('[Sondages]', err)
      }
    }
    loadPermissions()
  }, [clubId, user])

  const addDate = () => {
    if (dates.length >= 10) return
    setDates([...dates, { id: null, date: '', startTime: '', endTime: '' }])
  }

  const removeDate = (idx: number) => {
    if (dates.length <= (kind === 'single' ? 1 : 2)) return
    setDates(dates.filter((_, i) => i !== idx))
  }

  const updateDate = (idx: number, field: keyof Omit<DateLine, 'id'>, value: string) => {
    setDates(dates.map((d, i) => i === idx ? { ...d, [field]: value } : d))
  }

  const toggleTeam = (teamId: string) => {
    setTeamFlags(prev => {
      const cur = prev[teamId]
      if (cur?.checked) {
        const next = { ...prev }
        delete next[teamId]
        return next
      }
      return { ...prev, [teamId]: { checked: true, staff: false, players: false, parents: false } }
    })
  }

  const uncheckAllTeams = () => {
    setTeamFlags({})
  }

  const updateTeamFlag = (teamId: string, flag: 'staff' | 'players' | 'parents', value: boolean) => {
    setTeamFlags(prev => ({
      ...prev,
      [teamId]: { ...prev[teamId], [flag]: value },
    }))
  }

  const checkedTeamIds = Object.keys(teamFlags).filter(id => teamFlags[id]?.checked)

  useEffect(() => {
    if (kind === 'single' && dates.length > 1) setDates([dates[0]])
    if (kind === 'dates' && dates.length < 2) setDates([...dates, { id: null, date: '', startTime: '', endTime: '' }])
  }, [kind])

  const toIso = (d: DateLine) => {
    const dt = new Date(`${d.date}T${d.startTime}`)
    return {
      id: d.id,
      starts_at: dt.toISOString(),
      ends_at: d.endTime ? new Date(`${d.date}T${d.endTime}`).toISOString() : null,
    }
  }

  const buildAudienceTeams = () =>
    checkedTeamIds
      .filter(id => {
        const f = teamFlags[id]
        return f.staff || f.players || f.parents
      })
      .map(id => {
        const f = teamFlags[id]
        return { team_id: id, staff: f.staff, players: f.players, parents: f.parents }
      })

  const validate = () => {
    if (!title.trim()) { showToast('Le titre est requis.', 'warning'); return false }
    if (title.length > 150) { showToast('Le titre ne doit pas dépasser 150 caractères.', 'warning'); return false }
    if (description.length > 2000) { showToast('La description ne doit pas dépasser 2000 caractères.', 'warning'); return false }
    if (location.length > 200) { showToast('Le lieu ne doit pas dépasser 200 caractères.', 'warning'); return false }
    for (const d of dates) {
      if (!d.date || !d.startTime) { showToast('Chaque date doit avoir une date et une heure de début.', 'warning'); return false }
      if (d.endTime && d.endTime <= d.startTime) { showToast('L\'heure de fin doit être après l\'heure de début.', 'warning'); return false }
    }
    if (kind === 'dates' && dates.length < 2) { showToast('Un sondage de dates nécessite au moins 2 dates.', 'warning'); return false }
    const audienceTeams = buildAudienceTeams()
    const hasAudience = allCoaches || committee || operational || audienceTeams.length > 0
    if (!hasAudience) { showToast('Sélectionnez au moins un destinataire.', 'warning'); return false }
    for (const id of checkedTeamIds) {
      const f = teamFlags[id]
      if (!f.staff && !f.players && !f.parents) {
        showToast('Choisissez Staff, Joueurs ou Parents pour chaque équipe cochée.', 'warning')
        return false
      }
    }
    return true
  }

  const hasDatesChanged = () => {
    if (!isEdit) return false
    if (dates.length !== originalDates.length) return true
    for (let i = 0; i < dates.length; i++) {
      const cur = dates[i]
      const orig = originalDates[i]
      if (!cur.id || cur.id !== orig.id) return true
      if (cur.date !== orig.date || cur.startTime !== orig.startTime || cur.endTime !== orig.endTime) return true
    }
    return false
  }

  const handleSubmit = async () => {
    if (!validate() || !clubId) return

    if (isEdit && hasDatesChanged() && !showDateConfirm) {
      setShowDateConfirm(true)
      return
    }
    setShowDateConfirm(false)
    setSaving(true)

    const audiencePayload = {
      all_coaches: allCoaches,
      committee,
      operational,
      teams: buildAudienceTeams(),
    }

    try {
      if (isEdit) {
        const { data, error } = await supabase.rpc('update_poll', {
          p_poll_id: editId,
          p_title: title.trim(),
          p_description: description.trim() || null,
          p_location: location.trim() || null,
          p_options: dates.map(d => toIso(d)),
          p_audience: audiencePayload,
        })
        if (error) throw error
        const result = data as any
        let msg = 'Sondage modifié'
        if (result.added > 0) msg += ` · ${result.added} nouveau(x) destinataire(s) prévenu(s)`
        if (result.date_changed) msg += ' · invités prévenus du changement de date'
        showToast(msg, 'success')
        navigate(`/sondages/${editId}`, { replace: true })
      } else {
        const { data, error } = await supabase.rpc('create_poll', {
          p_club_id: clubId,
          p_kind: kind,
          p_title: title.trim(),
          p_description: description.trim() || null,
          p_location: location.trim() || null,
          p_options: dates.map(d => toIso(d)),
          p_audience: audiencePayload,
        })
        if (error) throw error
        const result = data as any
        showToast(`Envoyé à ${result.invitees} personne(s)`, 'success')
        navigate(`/sondages/${result.id}`, { replace: true })
      }
    } catch (err: any) {
      console.error('[Sondages]', err)
      showToast(err.message || 'Erreur lors de la sauvegarde', 'error')
    } finally {
      setSaving(false)
    }
  }

  const backPath = isEdit ? `/sondages/${editId}` : '/sondages'

  return (
    <div style={{ maxWidth: '640px' }}>
      <button
        onClick={() => navigate(backPath)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: '14px', marginBottom: '16px', padding: 0 }}
      >
        <ArrowLeft size={18} /> {isEdit ? 'Retour au sondage' : 'Sondages'}
      </button>

      <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '24px' }}>
        {isEdit ? 'Modifier le sondage' : 'Nouveau sondage'}
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Kind */}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Type</legend>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([['single', 'Invitation (une date)'], ['dates', 'Sondage de dates (2 à 10)']] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => !isEdit && setKind(k)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                  cursor: isEdit ? 'default' : 'pointer', textAlign: 'center', border: '1px solid var(--border-color)',
                  background: kind === k ? 'var(--accent-soft)' : 'var(--bg-sidebar)',
                  color: kind === k ? 'var(--accent)' : 'var(--text-secondary)',
                  opacity: isEdit && kind !== k ? 0.4 : 1,
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Title */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
            Titre *
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={150}
            placeholder="Ex : Match amical, Assemblée générale..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '14px' }}
          />
          <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{title.length}/150</div>
        </div>

        {/* Description */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '14px', resize: 'vertical' }}
          />
        </div>

        {/* Location */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
            Lieu
          </label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            maxLength={200}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '14px' }}
          />
        </div>

        {/* Dates */}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            {kind === 'single' ? 'Date' : 'Dates proposées'}
          </legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {dates.map((d, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="date" value={d.date} onChange={e => updateDate(idx, 'date', e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '14px', flex: '1 1 140px' }} />
                <input type="time" value={d.startTime} onChange={e => updateDate(idx, 'startTime', e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '14px', width: '110px' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>–</span>
                <input type="time" value={d.endTime} onChange={e => updateDate(idx, 'endTime', e.target.value)} placeholder="Fin" style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '14px', width: '110px' }} />
                {kind === 'dates' && dates.length > 2 && (
                  <button type="button" onClick={() => removeDate(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-text)', padding: '4px' }}>
                    <X size={18} />
                  </button>
                )}
              </div>
            ))}
            {kind === 'dates' && dates.length < 10 && (
              <Button variant="ghost" size="sm" onClick={addDate} leftIcon={<Plus size={16} />}>
                Ajouter une date
              </Button>
            )}
          </div>
        </fieldset>

        {/* Audience */}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Destinataires</legend>

          {clubWide && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <label htmlFor="poll-audience-coaches" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input id="poll-audience-coaches" type="checkbox" checked={allCoaches} onChange={e => setAllCoaches(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Tous les entraîneurs</span>
              </label>
              <label htmlFor="poll-audience-committee" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input id="poll-audience-committee" type="checkbox" checked={committee} onChange={e => setCommittee(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Comité</span>
              </label>
              <label htmlFor="poll-audience-operational" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input id="poll-audience-operational" type="checkbox" checked={operational} onChange={e => setOperational(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Opérationnel</span>
              </label>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Équipes</div>
            {checkedTeamIds.length > 0 && (
              <Button variant="ghost" size="sm" onClick={uncheckAllTeams}>
                Tout décocher
              </Button>
            )}
          </div>
          {availableTeams.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Aucune équipe disponible.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {availableTeams.map(at => {
                const flags = teamFlags[at.id]
                const isChecked = !!flags?.checked
                return (
                  <div key={at.id} style={{ background: isChecked ? 'var(--bg-hover)' : 'var(--bg-sidebar)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px' }}>
                    <label htmlFor={`poll-team-${at.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: isChecked ? '8px' : 0 }}>
                      <input
                        id={`poll-team-${at.id}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTeam(at.id)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{at.name}</span>
                    </label>
                    {isChecked && (
                      <div style={{ display: 'flex', gap: '16px', paddingLeft: '28px' }}>
                        <label htmlFor={`poll-team-${at.id}-staff`} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <input id={`poll-team-${at.id}-staff`} type="checkbox" checked={flags.staff} onChange={e => updateTeamFlag(at.id, 'staff', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }} />
                          Staff
                        </label>
                        <label htmlFor={`poll-team-${at.id}-players`} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <input id={`poll-team-${at.id}-players`} type="checkbox" checked={flags.players} onChange={e => updateTeamFlag(at.id, 'players', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }} />
                          Joueurs
                        </label>
                        {at.parents_allowed && (
                          <label htmlFor={`poll-team-${at.id}-parents`} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <input id={`poll-team-${at.id}-parents`} type="checkbox" checked={flags.parents} onChange={e => updateTeamFlag(at.id, 'parents', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }} />
                            Parents
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </fieldset>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '8px', paddingBottom: '24px' }}>
          <Button variant="ghost" onClick={() => navigate(backPath)} disabled={saving}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={saving} loading={saving}>
            {isEdit ? 'Enregistrer' : 'Créer le sondage'}
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDateConfirm}
        title="Dates modifiées"
        message="Les réponses sur les dates modifiées ou supprimées seront effacées et les invités seront prévenus. Continuer ?"
        confirmLabel="Continuer"
        cancelLabel="Annuler"
        confirmStyle="warning"
        loading={saving}
        loadingLabel="Enregistrement..."
        onConfirm={handleSubmit}
        onCancel={() => setShowDateConfirm(false)}
      />

      <Toast toast={toast} />
    </div>
  )
}
