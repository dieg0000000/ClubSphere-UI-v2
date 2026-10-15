import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Button from './ui/Button'
import { Alert } from './ui/Alert'
import { useToast } from '../hooks/useToast'
import { Toast } from './Toast'

const OWN_GOAL = 'own_goal'

export interface SavedGoal {
  goal_index: number
  own_goal: boolean
  scorer_member_id: string | null
  scorer_name: string | null
  assist_member_id: string | null
  assist_name: string | null
}

interface GoalRow {
  scorer: string
  assist: string
}

interface PlayerOption {
  id: string
  label: string
}

interface SaveMeta {
  createdAt: string
  authorName: string | null
}

export async function fetchGoals(matchId: string): Promise<SavedGoal[] | null> {
  const { data, error } = await supabase.rpc('get_match_goals', { p_match_id: matchId })
  if (error || !Array.isArray(data)) return null
  return (data as SavedGoal[]).slice().sort((a, b) => a.goal_index - b.goal_index)
}

async function fetchSaveMeta(matchId: string): Promise<SaveMeta | null> {
  const { data, error } = await supabase
    .from('match_goals')
    .select('created_at, created_by')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  let authorName: string | null = null
  if (data.created_by) {
    const { data: names } = await supabase.rpc('get_sender_display_names', { user_ids: [data.created_by] })
    if (Array.isArray(names) && names[0]?.full_name) authorName = names[0].full_name
  }
  return { createdAt: data.created_at, authorName }
}

async function fetchConvokedPlayers(matchId: string): Promise<PlayerOption[]> {
  const { data: conv } = await supabase
    .from('match_convocations')
    .select('id')
    .eq('match_id', matchId)
    .maybeSingle()
  if (!conv) return []
  const { data: rows } = await supabase
    .from('v_match_convocation_players')
    .select('member_id, status')
    .eq('convocation_id', conv.id)
  const ids = ((rows as { member_id: string; status: string }[]) || [])
    .filter(r => r.status !== 'declined')
    .map(r => r.member_id)
  if (ids.length === 0) return []
  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name')
    .in('id', ids)
  return ((members as { id: string; first_name: string | null; last_name: string | null }[]) || [])
    .map(m => ({ id: m.id, label: `${m.last_name ?? ''} ${m.first_name ?? ''}`.trim() }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

function goalLine(g: SavedGoal): string {
  if (g.own_goal) return '⚽ Autogoal'
  return `⚽ ${g.scorer_name ?? ''}${g.assist_name ? ` (passe : ${g.assist_name})` : ''}`
}

function formatSavedAt(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} à ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toRows(goals: SavedGoal[]): GoalRow[] {
  return goals.map(g => ({
    scorer: g.own_goal ? OWN_GOAL : g.scorer_member_id ?? '',
    assist: g.own_goal ? '' : g.assist_member_id ?? '',
  }))
}

function resize(rows: GoalRow[], count: number): GoalRow[] {
  return Array.from({ length: count }, (_, i) => rows[i] ?? { scorer: '', assist: '' })
}

function GoalLines({ goals }: { goals: SavedGoal[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {goals.map(g => (
        <div key={g.goal_index} style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>
          {goalLine(g)}
        </div>
      ))}
    </div>
  )
}

export function MatchGoalsList({ matchId, scoreFor }: { matchId: string; scoreFor: number }) {
  const [goals, setGoals] = useState<SavedGoal[]>([])

  useEffect(() => {
    let cancelled = false
    fetchGoals(matchId).then(g => { if (!cancelled) setGoals(g ?? []) })
    return () => { cancelled = true }
  }, [matchId, scoreFor])

  if (goals.length === 0) return null
  return <div style={{ marginTop: 12 }}><GoalLines goals={goals} /></div>
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 14,
  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6,
}

export function MatchGoalsCard({ matchId, scoreFor, canEdit }: { matchId: string; scoreFor: number; canEdit: boolean }) {
  const { toast, showToast } = useToast()
  const [players, setPlayers] = useState<PlayerOption[]>([])
  const [saved, setSaved] = useState<SavedGoal[]>([])
  const [meta, setMeta] = useState<SaveMeta | null>(null)
  const [rows, setRows] = useState<GoalRow[]>([])
  const [mode, setMode] = useState<'summary' | 'edit'>('summary')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadSaved = useCallback(async () => {
    const [goals, saveMeta] = await Promise.all([fetchGoals(matchId), fetchSaveMeta(matchId)])
    const list = goals ?? []
    setSaved(list)
    setMeta(list.length > 0 ? saveMeta : null)
    setRows(toRows(list))
    return list
  }, [matchId])

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    Promise.all([canEdit ? fetchConvokedPlayers(matchId) : Promise.resolve([]), loadSaved()]).then(([convoked, list]) => {
      if (cancelled) return
      const options = [...convoked]
      for (const g of list) {
        for (const [id, name] of [[g.scorer_member_id, g.scorer_name], [g.assist_member_id, g.assist_name]] as const) {
          if (id && name && !options.some(o => o.id === id)) options.push({ id, label: name })
        }
      }
      setPlayers(options)
      setMode(canEdit && list.length === 0 ? 'edit' : 'summary')
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [matchId, canEdit, loadSaved])

  const sizedRows = useMemo(() => resize(rows, scoreFor), [rows, scoreFor])
  const savedRows = useMemo(() => toRows(saved), [saved])
  const dirty = JSON.stringify(sizedRows) !== JSON.stringify(savedRows)

  const updateRow = (index: number, patch: Partial<GoalRow>) => {
    const next = [...sizedRows]
    const row = { ...next[index], ...patch }
    if (row.scorer === OWN_GOAL || (row.assist && row.assist === row.scorer)) row.assist = ''
    next[index] = row
    setRows(next)
  }

  const cancelEdit = () => {
    setRows(savedRows)
    setError('')
    setMode('summary')
  }

  const save = async () => {
    if (sizedRows.some(r => !r.scorer)) {
      setError('Indiquez le buteur de chaque but.')
      return
    }
    setSaving(true)
    setError('')
    const payload = sizedRows.map(r => r.scorer === OWN_GOAL
      ? { own_goal: true }
      : { scorer_member_id: r.scorer, assist_member_id: r.assist || null })
    const { error: rpcError } = await supabase.rpc('set_match_goals', { p_match_id: matchId, p_goals: payload })
    if (rpcError) {
      setSaving(false)
      setError(rpcError.message || 'Erreur lors de l\'enregistrement des buts.')
      return
    }
    await loadSaved()
    setSaving(false)
    showToast('Buts enregistrés', 'success')
    setMode('summary')
  }

  if (scoreFor <= 0) return null

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 14, padding: 20, marginBottom: 24,
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Buts</div>
      {!loaded ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Chargement...</p>
      ) : mode === 'summary' ? (
        <>
          {saved.length > 0 ? (
            <>
              <GoalLines goals={saved} />
              {meta && (
                <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                  Enregistré le {formatSavedAt(meta.createdAt)}{meta.authorName ? ` par ${meta.authorName}` : ''}
                </p>
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucun buteur enregistré.</p>
          )}
          {canEdit && (
            <div style={{ marginTop: 16 }}>
              <Button variant="secondary" size="sm" leftIcon={<Pencil size={14} />} onClick={() => setMode('edit')}>
                Modifier
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {sizedRows.map((row, i) => {
              const assistDisabled = saving || row.scorer === OWN_GOAL
              return (
                <div key={i}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>But {i + 1}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <div>
                      <label style={labelStyle} htmlFor={`goal-scorer-${i}`}>Buteur</label>
                      <select
                        id={`goal-scorer-${i}`}
                        value={row.scorer}
                        disabled={saving}
                        onChange={e => updateRow(i, { scorer: e.target.value })}
                        style={selectStyle}
                      >
                        <option value="" disabled>Choisir le buteur...</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        <option value={OWN_GOAL}>Autogoal</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle} htmlFor={`goal-assist-${i}`}>Passe décisive</label>
                      <select
                        id={`goal-assist-${i}`}
                        value={row.assist}
                        disabled={assistDisabled}
                        onChange={e => updateRow(i, { assist: e.target.value })}
                        style={{ ...selectStyle, opacity: assistDisabled ? 0.5 : 1 }}
                      >
                        <option value="">Aucune</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {error && (
            <div style={{ marginTop: 16 }}>
              <Alert variant="danger" title="Erreur" onClose={() => setError('')}>{error}</Alert>
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Enregistrement...' : 'Enregistrer les buts'}
            </Button>
            {saved.length > 0 && (
              <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                Annuler
              </Button>
            )}
          </div>
        </>
      )}
      <Toast toast={toast} />
    </div>
  )
}
