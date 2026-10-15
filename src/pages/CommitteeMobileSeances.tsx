import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { ChevronLeft, Loader as Loader2, Monitor as DesktopIcon, MapPin, Calendar, FileText, Vote, Users } from 'lucide-react'
import { Badge, type BadgeVariant } from '../components/ui/Badge'

/* ── types ── */

interface MeetingRow {
  id: string
  title: string
  date: string
  location: string | null
  status: string
  type: string
  previous_pv_approved: boolean
  notes: string | null
  attendee_count: number
}

interface Attendee {
  id: string
  status: 'present' | 'absent' | 'excuse'
  signed_at: string | null
  committee_member: {
    first_name: string
    last_name: string
    role: string | null
  }
}

interface AgendaItem {
  id: string
  order_number: number
  title: string
  description: string | null
  responsible: { first_name: string; last_name: string } | null
  due_date: string | null
  status: string
  decisions: Decision[]
}

interface Decision {
  id: string
  decision_text: string
  is_vote: boolean
  votes_for: number
  votes_against: number
  votes_abstention: number
}

interface MeetingDoc {
  id: string
  name: string
  file_url: string
  signed_url?: string | null
}

type Tab = 'upcoming' | 'past'

/* ── mappings ── */

const MEETING_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  brouillon: { label: 'Brouillon', variant: 'yellow' },
  finalise: { label: 'Finalisé', variant: 'blue' },
  approuve: { label: 'Approuvé', variant: 'green' },
}

const AGENDA_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  ouvert: { label: 'Ouvert', variant: 'blue' },
  en_cours: { label: 'En cours', variant: 'orange' },
  clos: { label: 'Clos', variant: 'green' },
  reporte: { label: 'Reporté', variant: 'neutral' },
}

const ATTENDEE_STATUS: Record<string, string> = {
  present: 'Présent',
  excuse: 'Excusé',
  absent: 'Absent',
}

const ATTENDEE_VARIANT: Record<string, BadgeVariant> = {
  present: 'green',
  excuse: 'orange',
  absent: 'red',
}

/* ── helpers ── */

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* ── component ── */

export default function CommitteeMobileSeances() {
  const { clubId } = useTenant()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('upcoming')
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!clubId) return
    setLoading(true)
    const now = new Date().toISOString()
    const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString()

    let q = supabase
      .from('meetings')
      .select('id, title, date, location, status, type, previous_pv_approved, notes, meeting_attendees(count)')
      .eq('club_id', clubId)

    if (tab === 'upcoming') {
      q = q.gte('date', now).order('date', { ascending: true })
    } else {
      q = q.lt('date', now).gte('date', twoYearsAgo).order('date', { ascending: false })
    }

    const { data } = await q
    setMeetings((data || []).map((m: any) => ({
      ...m,
      attendee_count: m.meeting_attendees?.[0]?.count || 0,
    })))
    setLoading(false)
  }, [clubId, tab])

  useEffect(() => { load() }, [load])

  // auto-switch to "past" if upcoming is empty on first load
  const [autoSwitched, setAutoSwitched] = useState(false)
  useEffect(() => {
    if (!loading && meetings.length === 0 && tab === 'upcoming' && !autoSwitched) {
      setAutoSwitched(true)
      setTab('past')
    }
  }, [loading, meetings.length, tab, autoSwitched])

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: '10px', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <ChevronLeft size={20} style={{ color: 'var(--text-primary)' }} />
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, flex: 1 }}>
          Séances du comité
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {([['upcoming', 'À venir'], ['past', 'Passées']] as [Tab, string][]).map(([val, label]) => {
          const active = tab === val
          return (
            <button
              key={val}
              type="button"
              onClick={() => { setTab(val); setSelectedId(null) }}
              style={{
                padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                border: active ? '1.5px solid var(--accent, #2563eb)' : '1px solid var(--border-color)',
                background: active ? 'var(--accent-soft, rgba(37,99,235,0.08))' : 'var(--bg-card)',
                color: active ? 'var(--accent, #2563eb)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={26} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : meetings.length === 0 ? (
        <div style={{
          padding: '32px 16px', borderRadius: '12px', background: 'var(--bg-card)',
          border: '1px solid var(--border-color)', textAlign: 'center',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Aucune séance</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {meetings.map(m => {
            const st = MEETING_STATUS[m.status] || MEETING_STATUS.brouillon
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 14px', borderRadius: '12px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.title}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {formatDateTime(m.date)}
                    {m.location ? ` · ${m.location}` : ''}
                  </p>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '5px', alignItems: 'center' }}>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.type}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectedId && <MeetingDetailPage meetingId={selectedId} onBack={() => setSelectedId(null)} />}
    </div>
  )
}

/* ── detail page ── */

function MeetingDetailPage({ meetingId, onBack }: { meetingId: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [meeting, setMeeting] = useState<any>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([])
  const [documents, setDocuments] = useState<MeetingDoc[]>([])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    ;(async () => {
      const [mRes, attRes, agRes, docRes] = await Promise.all([
        supabase.from('meetings').select('*, secretary:committee_members!secretary_id(first_name, last_name)').eq('id', meetingId).single(),
        supabase.from('meeting_attendees').select('id, status, signed_at, committee_member:committee_members(first_name, last_name, role)').eq('meeting_id', meetingId),
        supabase.from('meeting_agenda_items').select('id, order_number, title, description, due_date, status, responsible:committee_members!responsible_id(first_name, last_name)').eq('meeting_id', meetingId).order('order_number'),
        supabase.from('meeting_documents').select('id, name, file_url').eq('meeting_id', meetingId).is('agenda_item_id', null),
      ])

      setMeeting(mRes.data)
      setAttendees((attRes.data || []).map((a: any) => ({
        ...a,
        committee_member: Array.isArray(a.committee_member) ? a.committee_member[0] : a.committee_member,
      })) as Attendee[])

      // fetch decisions for each agenda item
      const items = (agRes.data || []) as any[]
      if (items.length > 0) {
        const itemIds = items.map(i => i.id)
        const { data: allDecisions } = await supabase
          .from('meeting_decisions')
          .select('*')
          .in('agenda_item_id', itemIds)
        const decMap = new Map<string, Decision[]>()
        for (const d of (allDecisions || [])) {
          const arr = decMap.get(d.agenda_item_id) || []
          arr.push(d)
          decMap.set(d.agenda_item_id, arr)
        }
        setAgendaItems(items.map(i => ({ ...i, decisions: decMap.get(i.id) || [] })))
      } else {
        setAgendaItems([])
      }

      // signed URLs for docs
      const docs = (docRes.data || []) as MeetingDoc[]
      const withUrls = await Promise.all(
        docs.map(async d => {
          if (d.file_url.startsWith('http')) return d
          const { data: signed } = await supabase.storage.from('documents').createSignedUrl(d.file_url, 3600)
          return { ...d, signed_url: signed?.signedUrl ?? null }
        })
      )
      setDocuments(withUrls)
      setLoading(false)
    })()
    return () => { document.body.style.overflow = '' }
  }, [meetingId])

  const st = meeting ? (MEETING_STATUS[meeting.status] || MEETING_STATUS.brouillon) : MEETING_STATUS.brouillon

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'var(--bg-page, #f5f5f5)', overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: '10px', border: '1px solid var(--border-color)',
              background: 'var(--bg-card)', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <ChevronLeft size={20} style={{ color: 'var(--text-primary)' }} />
          </button>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meeting?.title || 'Séance'}
          </h1>
        </div>

        {loading || !meeting ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Loader2 size={26} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : (
          <>
            {/* Info card */}
            <Card title="Informations">
              <InfoRow icon={Calendar} text={formatDateTime(meeting.date)} />
              {meeting.location && <InfoRow icon={MapPin} text={meeting.location} />}
              <DetailRow label="Type" value={meeting.type} />
              <div style={{ margin: '6px 0' }}><Badge variant={st.variant}>{st.label}</Badge></div>
              <DetailRow label="PV précédent approuvé" value={meeting.previous_pv_approved ? 'Oui' : 'Non'} />
              {meeting.secretary && (
                <DetailRow label="Secrétaire" value={`${meeting.secretary.first_name} ${meeting.secretary.last_name}`} />
              )}
            </Card>

            {/* Ordre du jour */}
            <Card title="Ordre du jour">
              {agendaItems.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Aucun point à l'ordre du jour</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {agendaItems.map(item => {
                    const as2 = AGENDA_STATUS[item.status] || AGENDA_STATUS.ouvert
                    return (
                      <div key={item.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            {item.order_number}. {item.title}
                          </p>
                          <Badge variant={as2.variant}>{as2.label}</Badge>
                        </div>
                        {item.description && (
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {item.description}
                          </p>
                        )}
                        {item.responsible && (
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                            Responsable : {item.responsible.first_name} {item.responsible.last_name}
                          </p>
                        )}
                        {item.due_date && (
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                            Échéance : {formatDateShort(item.due_date)}
                          </p>
                        )}
                        {item.decisions.length > 0 && (
                          <div style={{ marginTop: '6px', paddingLeft: '10px', borderLeft: '2px solid var(--accent, #2563eb)' }}>
                            {item.decisions.map(dec => (
                              <div key={dec.id} style={{ marginBottom: '4px' }}>
                                <p style={{ fontSize: '12px', color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
                                  {dec.decision_text}
                                </p>
                                {dec.is_vote && (
                                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                                    Pour {dec.votes_for} · Contre {dec.votes_against} · Abst. {dec.votes_abstention}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* Présences */}
            <Card title="Présences">
              {attendees.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Aucune présence enregistrée</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {attendees.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                          {a.committee_member.first_name} {a.committee_member.last_name}
                        </p>
                        {a.committee_member.role && (
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0' }}>{a.committee_member.role}</p>
                        )}
                        {a.signed_at && (
                          <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '1px 0 0' }}>
                            Signé le {formatDateShort(a.signed_at)}
                          </p>
                        )}
                      </div>
                      <Badge variant={ATTENDEE_VARIANT[a.status] || 'neutral'}>
                        {ATTENDEE_STATUS[a.status] || a.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Documents */}
            {documents.length > 0 && (
              <Card title="Documents">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {documents.map(d => (
                    <a
                      key={d.id}
                      href={d.signed_url || d.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid var(--border-color)', background: 'var(--bg-page, var(--bg-card))',
                        textDecoration: 'none', color: 'var(--accent, #2563eb)', fontSize: '13px', fontWeight: 500,
                      }}
                    >
                      <FileText size={15} style={{ flexShrink: 0 }} />
                      {d.name}
                    </a>
                  ))}
                </div>
              </Card>
            )}

            {/* Desktop CTA */}
            <div style={{
              padding: '14px 16px', borderRadius: '12px',
              background: 'var(--accent-soft, rgba(0,100,200,0.06))',
              border: '1px solid var(--accent, #2563eb)',
            }}>
              <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent)', margin: '0 0 4px' }}>
                <DesktopIcon size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                Poste de travail complet sur ordinateur
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Rédaction du PV, décisions et signatures se font depuis un ordinateur.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── sub-components ── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)',
      background: 'var(--bg-card)', marginBottom: '14px',
    }}>
      <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function InfoRow({ icon: Icon, text }: { icon: typeof Calendar; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
      <Icon size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{text}</span>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}
