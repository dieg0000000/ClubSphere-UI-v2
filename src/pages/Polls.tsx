import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardList, Plus, CalendarDays, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import { LoadError } from '../components/LoadError'
import Button from '../components/ui/Button'

interface PollOption {
  id: string
  starts_at: string
  ends_at: string | null
  position: number
}

interface Poll {
  id: string
  kind: 'single' | 'dates'
  title: string
  status: 'open' | 'closed'
  created_at: string
  closed_at: string | null
  final_option_id: string | null
  poll_options: PollOption[]
}

const zurichFmt = (iso: string) => {
  const d = new Date(iso)
  const date = d.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Zurich' })
  const time = d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
  return { date, time }
}

function formatOptionRange(opt: PollOption) {
  const s = zurichFmt(opt.starts_at)
  if (opt.ends_at) {
    const e = zurichFmt(opt.ends_at)
    return `${s.date} · ${s.time} – ${e.time}`
  }
  return `${s.date} · ${s.time}`
}

export default function Polls() {
  const { user } = useAuth()
  const { clubId } = useTenant()
  const navigate = useNavigate()
  const [polls, setPolls] = useState<Poll[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filter, setFilter] = useState<'open' | 'closed'>('open')
  const [canCreate, setCanCreate] = useState(false)

  const fetchPolls = useCallback(async () => {
    if (!clubId || !user) return
    setLoadFailed(false)
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('polls')
        .select('id, kind, title, status, created_at, closed_at, final_option_id, poll_options!poll_options_poll_id_fkey(id, starts_at, ends_at, position)')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
      if (error) throw error

      const [invRes, respRes] = await Promise.all([
        supabase.from('poll_invitees').select('poll_id').eq('user_id', user.id),
        supabase.from('poll_responses').select('poll_id').eq('user_id', user.id),
      ])
      const invitedIds = new Set((invRes.data ?? []).map((r: any) => r.poll_id))
      const respondedIds = new Set((respRes.data ?? []).map((r: any) => r.poll_id))
      const pending = new Set<string>()
      for (const id of invitedIds) {
        const poll = (data ?? []).find((p: Poll) => p.id === id)
        if (poll && poll.status === 'open' && !respondedIds.has(id)) {
          pending.add(id)
        }
      }
      setPendingIds(pending)
      setPolls(data ?? [])
    } catch (err) {
      console.error('[Sondages]', err)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [clubId, user])

  useEffect(() => { fetchPolls() }, [fetchPolls])

  useEffect(() => {
    if (!clubId || !user) return
    const checkCreate = async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_poll_permissions', { p_club_id: clubId })
        if (error) throw error
        if (data?.can_create) setCanCreate(true)
      } catch (err) {
        console.error('[Sondages]', err)
      }
    }
    checkCreate()
  }, [clubId, user])

  useEffect(() => { document.title = 'Sondages - ClubSphere' }, [])

  const filtered = polls.filter(p => p.status === filter)

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

  if (loadFailed) return <LoadError onRetry={fetchPolls} />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <ClipboardList className="w-5 h-5" />
            Sondages
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Invitations et sondages de dates</p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/sondages/nouveau')} leftIcon={<Plus size={20} />}>
            Nouveau sondage
          </Button>
        )}
      </div>

      <Tabs
        items={[
          { key: 'open', label: 'En cours' },
          { key: 'closed', label: 'Terminés' },
        ]}
        value={filter}
        onChange={(k) => setFilter(k as 'open' | 'closed')}
      />

      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-secondary)' }}>
            Aucun sondage pour le moment.
          </div>
        ) : (
          filtered.map(poll => {
            const sortedOpts = [...poll.poll_options].sort((a, b) => a.position - b.position)
            const firstOpt = sortedOpts[0]
            return (
              <Link
                key={poll.id}
                to={`/sondages/${poll.id}`}
                style={{
                  display: 'block',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  textDecoration: 'none',
                  transition: 'box-shadow 150ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <Badge variant={poll.kind === 'single' ? 'blue' : 'orange'}>
                    {poll.kind === 'single' ? 'Invitation' : 'Sondage de dates'}
                  </Badge>
                  {pendingIds.has(poll.id) && <Badge variant="red">À répondre</Badge>}
                  {poll.status === 'closed' && <Badge variant="neutral">Terminé</Badge>}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {poll.title}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {poll.kind === 'single' && firstOpt ? (
                    <><CalendarDays size={14} /> {formatOptionRange(firstOpt)}</>
                  ) : (
                    <><Users size={14} /> {sortedOpts.length} dates proposées</>
                  )}
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
