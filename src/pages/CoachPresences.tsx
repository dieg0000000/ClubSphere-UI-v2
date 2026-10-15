import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ClipboardCheck, Calendar, ChevronRight } from 'lucide-react'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'

interface CoachTeam {
  id: string
  name: string
}

interface TodaySession {
  id: string
  session_date: string
  team_id: string
  team_name: string
}

export default function CoachPresences() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<CoachTeam[]>([])
  const [todaySessions, setTodaySessions] = useState<TodaySession[]>([])
  const [redirected, setRedirected] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (user) loadCoachData()
  }, [user])

  useEffect(() => {
    if (!loading && !redirected && todaySessions.length === 1) {
      setRedirected(true)
      navigate(`/mes-equipes/presences/${todaySessions[0].team_id}`, { replace: true, state: { fromPresencesTab: true } })
    }
  }, [loading, todaySessions, redirected])

  const loadCoachData = async () => {
    try {
      setLoadFailed(false)
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser?.email) { setLoading(false); return }

      const { data: coachData } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', authUser.id)
        .maybeSingle()

      if (!coachData) { setLoading(false); return }

      const { data: staffRows } = await supabase
        .from('team_staff')
        .select('teams(id, name)')
        .eq('coach_id', coachData.id)
        .order('sort_order')
        .order('teams(name)')
      const teamsData = (staffRows || []).map((r: any) => r.teams).filter(Boolean)

      const coachTeams: CoachTeam[] = teamsData || []
      setTeams(coachTeams)

      if (coachTeams.length === 0) { setLoading(false); return }

      const today = new Date().toISOString().split('T')[0]
      const teamIds = coachTeams.map(t => t.id)

      const { data: sessions } = await supabase
        .from('training_sessions')
        .select('id, session_date, team_id')
        .in('team_id', teamIds)
        .eq('session_date', today)
        .eq('cancelled', false)

      const mapped: TodaySession[] = (sessions || []).map(s => ({
        ...s,
        team_name: coachTeams.find(t => t.id === s.team_id)?.name || ''
      }))
      setTodaySessions(mapped)
    } catch (err) {
      reportLoadError('CoachPresences', err)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading || (todaySessions.length === 1 && !redirected)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    )
  }

  if (loadFailed) {
    return (
      <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
        <LoadError onRetry={loadCoachData} />
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
      <h1
        className="text-2xl font-bold mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Présences
      </h1>

      {todaySessions.length > 1 && (
        <div
          style={{
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: 'var(--accent-text)',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          <Calendar size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
          {todaySessions.length} séances aujourd'hui — choisissez une équipe ci-dessous.
        </div>
      )}

      {todaySessions.length === 0 && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            color: 'var(--text-secondary)',
            fontSize: '14px',
            textAlign: 'center'
          }}
        >
          Pas de séance aujourd'hui
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {teams.map(team => {
          const hasToday = todaySessions.some(s => s.team_id === team.id)
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => navigate(`/mes-equipes/presences/${team.id}`, { state: { fromPresencesTab: true } })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                background: 'var(--bg-card)',
                border: `1px solid ${hasToday ? 'var(--accent)' : 'var(--border-color)'}`,
                borderRadius: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.15s ease'
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: hasToday ? 'var(--accent-soft)' : 'var(--bg-hover)',
                  color: hasToday ? 'var(--accent)' : 'var(--text-secondary)',
                  flexShrink: 0
                }}
              >
                <ClipboardCheck size={20} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '15px',
                    color: 'var(--text-primary)'
                  }}
                >
                  {team.name}
                </span>
                {hasToday && (
                  <span style={{ fontSize: '12px', color: 'var(--accent-text)', fontWeight: 500 }}>
                    Séance aujourd'hui
                  </span>
                )}
              </span>
              <ChevronRight size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
