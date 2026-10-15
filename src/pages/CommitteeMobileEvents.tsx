import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { ChevronLeft, Loader as Loader2, Monitor as DesktopIcon, MapPin, Calendar, Users, Ticket } from 'lucide-react'
import { Badge } from '../components/ui/Badge'

/* ── types ── */

interface EventRow {
  id: string
  title: string
  date: string
  location: string
  type: string
  description: string
  needs_volunteers: boolean
  is_registerable: boolean
  registration_deadline: string | null
  cancellation_deadline_days: number | null
  payment_modes: string[] | null
  compte: string | null
  has_price_options: boolean
  reg_count: number
  vol_count: number
}

interface PriceOption {
  id: string
  label: string
  seats: number
  price: number
}

interface PubReg {
  option_label: string
  option_seats: number
  quantity: number
  total_amount: number
  source: string | null
  status: string
}

interface VolunteerAgg {
  event_id: string
  count: number
}

interface PostAgg {
  event_id: string
  required: number
}

/* ── helpers ── */

function formatCHF(v: number): string {
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' })
}

type Tab = 'upcoming' | 'past'

/* ── component ── */

export default function CommitteeMobileEvents() {
  const { clubId } = useTenant()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('upcoming')
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!clubId) return
    setLoading(true)

    const now = new Date().toISOString()
    const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString()

    let q = supabase
      .from('events')
      .select('id, title, date, location, type, description, needs_volunteers, is_registerable, registration_deadline, cancellation_deadline_days, payment_modes, compte')
      .eq('club_id', clubId)

    if (tab === 'upcoming') {
      q = q.gte('date', now).order('date', { ascending: true })
    } else {
      q = q.lt('date', now).gte('date', oneYearAgo).order('date', { ascending: false })
    }

    const { data: evData } = await q
    if (!evData || evData.length === 0) {
      setEvents([])
      setLoading(false)
      return
    }

    const eventIds = evData.map(e => e.id)

    const [priceRes, pubRegRes, volRes] = await Promise.all([
      supabase
        .from('event_price_options')
        .select('event_id')
        .in('event_id', eventIds)
        .eq('active', true),
      supabase
        .from('event_public_registrations')
        .select('event_id, quantity')
        .in('event_id', eventIds)
        .neq('status', 'cancelled'),
      supabase
        .from('event_volunteers')
        .select('event_id')
        .in('event_id', eventIds)
        .neq('status', 'cancelled'),
    ])

    const priceSet = new Set((priceRes.data || []).map(r => r.event_id))

    const regCounts: Record<string, number> = {}
    for (const r of (pubRegRes.data || [])) {
      regCounts[r.event_id] = (regCounts[r.event_id] || 0) + (r.quantity || 1)
    }

    const volCounts: Record<string, number> = {}
    for (const r of (volRes.data || [])) {
      volCounts[r.event_id] = (volCounts[r.event_id] || 0) + 1
    }

    setEvents(evData.map(e => ({
      ...e,
      needs_volunteers: e.needs_volunteers || false,
      is_registerable: e.is_registerable || false,
      has_price_options: priceSet.has(e.id),
      reg_count: regCounts[e.id] || 0,
      vol_count: volCounts[e.id] || 0,
    })))
    setLoading(false)
  }, [clubId, tab])

  useEffect(() => { load() }, [load])

  const selected = selectedId ? events.find(e => e.id === selectedId) || null : null

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
          Événements
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {([['upcoming', 'À venir'], ['past', 'Passés']] as [Tab, string][]).map(([val, label]) => {
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
      ) : events.length === 0 ? (
        <EmptyCard />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {events.map(ev => (
            <button
              key={ev.id}
              type="button"
              onClick={() => setSelectedId(ev.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', borderRadius: '12px',
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {formatDateTime(ev.date)}{ev.location ? ` · ${ev.location}` : ''}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
                  {ev.has_price_options && <Badge variant="blue">Payant</Badge>}
                  {ev.needs_volunteers && <Badge variant="orange">Bénévoles</Badge>}
                  {ev.is_registerable && ev.registration_deadline && new Date(ev.registration_deadline) >= new Date() && (
                    <Badge variant="green">Inscriptions ouvertes</Badge>
                  )}
                  {(ev as any).publish_on_site && (
                    <Badge variant="blue">Sur le site</Badge>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap' }}>
                  {ev.reg_count} inscrit{ev.reg_count !== 1 ? 's' : ''}
                </p>
                {ev.needs_volunteers && (
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', whiteSpace: 'nowrap' }}>
                    {ev.vol_count} bénévole{ev.vol_count !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <EventDetailPage event={selected} onBack={() => setSelectedId(null)} />}
    </div>
  )
}

/* ── empty ── */

function EmptyCard() {
  return (
    <div style={{
      padding: '32px 16px', borderRadius: '12px', background: 'var(--bg-card)',
      border: '1px solid var(--border-color)', textAlign: 'center',
    }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Aucun événement</p>
    </div>
  )
}

/* ── detail page (full screen overlay) ── */

function EventDetailPage({ event: ev, onBack }: { event: EventRow; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [priceOptions, setPriceOptions] = useState<PriceOption[]>([])
  const [pubRegs, setPubRegs] = useState<PubReg[]>([])
  const [freeParticipants, setFreeParticipants] = useState(0)
  const [volRegistered, setVolRegistered] = useState(0)
  const [volRequired, setVolRequired] = useState(0)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    ;(async () => {
      const [poRes, prRes, erRes, volRes, postRes] = await Promise.all([
        supabase.from('event_price_options').select('id, label, seats, price').eq('event_id', ev.id).eq('active', true).order('display_order'),
        supabase.from('event_public_registrations').select('option_label, option_seats, quantity, total_amount, source, status').eq('event_id', ev.id).neq('status', 'cancelled'),
        supabase.from('event_registrations').select('id').eq('event_id', ev.id).eq('is_volunteer', false),
        supabase.from('event_volunteers').select('id').eq('event_id', ev.id).neq('status', 'cancelled'),
        supabase.from('event_volunteer_posts').select('required_count').eq('event_id', ev.id),
      ])
      setPriceOptions((poRes.data || []) as PriceOption[])
      setPubRegs((prRes.data || []) as PubReg[])
      setFreeParticipants(erRes.data?.length || 0)
      setVolRegistered(volRes.data?.length || 0)
      setVolRequired((postRes.data || []).reduce((s, p) => s + (p.required_count || 0), 0))
      setLoading(false)
    })()
    return () => { document.body.style.overflow = '' }
  }, [ev.id])

  const memberRegs = pubRegs.filter(r => r.source === 'member')
  const publicRegs = pubRegs.filter(r => r.source !== 'member')

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
            {ev.title}
          </h1>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Loader2 size={26} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : (
          <>
            {/* Détails card */}
            <Card title="Détails">
              <InfoRow icon={Calendar} text={formatDateTime(ev.date)} />
              {ev.location && <InfoRow icon={MapPin} text={ev.location} />}
              {ev.type && <DetailRow label="Type" value={ev.type} />}
              {ev.description && (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {ev.description}
                </p>
              )}
              {ev.registration_deadline && <DetailRow label="Délai d'inscription" value={formatDateShort(ev.registration_deadline)} />}
              {ev.cancellation_deadline_days != null && ev.cancellation_deadline_days > 0 && (
                <DetailRow label="Délai d'annulation" value={`${ev.cancellation_deadline_days} jour${ev.cancellation_deadline_days > 1 ? 's' : ''} avant`} />
              )}
              {ev.payment_modes && ev.payment_modes.length > 0 && (
                <DetailRow label="Modes de paiement" value={ev.payment_modes.map((m: string) => m === 'invoice' ? 'Facture' : m === 'cash_card' ? 'Sur place' : m).join(', ')} />
              )}
              {ev.compte && <DetailRow label="Compte" value={ev.compte} />}
              {priceOptions.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>
                    Tarifs
                  </p>
                  {priceOptions.map(po => (
                    <p key={po.id} style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '2px 0', lineHeight: 1.5 }}>
                      {po.label} · {po.seats} place{po.seats > 1 ? 's' : ''} · CHF {formatCHF(po.price)}
                    </p>
                  ))}
                </div>
              )}
            </Card>

            {/* Inscriptions card */}
            <Card title="Inscriptions">
              {pubRegs.length === 0 && freeParticipants === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Aucune inscription</p>
              ) : (
                <>
                  {memberRegs.length > 0 && <RegBlock label="Membres du club" regs={memberRegs} />}
                  {publicRegs.length > 0 && <RegBlock label="Public" regs={publicRegs} />}
                  {pubRegs.length > 0 && (memberRegs.length > 0 && publicRegs.length > 0) && (
                    <TotalLine regs={pubRegs} bold label="Total général" />
                  )}
                  {freeParticipants > 0 && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                      Participants (gratuit) : {freeParticipants}
                    </p>
                  )}
                </>
              )}
            </Card>

            {/* Bénévoles card */}
            {ev.needs_volunteers && (
              <Card title="Bénévoles">
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  <strong>{volRegistered}</strong> bénévole{volRegistered !== 1 ? 's' : ''} inscrit{volRegistered !== 1 ? 's' : ''}
                </p>
                {volRequired > 0 && (
                  <>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                      {volRequired} poste{volRequired > 1 ? 's' : ''} à pourvoir
                    </p>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--border-color)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${Math.min(100, (volRegistered / volRequired) * 100)}%`,
                        background: volRegistered >= volRequired ? 'var(--success, #059669)' : 'var(--accent, #2563eb)',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </>
                )}
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
                Création, tarifs, listes nominatives et attribution des bénévoles se gèrent depuis un ordinateur.
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

interface GroupedOption {
  label: string
  count: number
  places: number
  amount: number
}

function groupByOption(regs: PubReg[]): GroupedOption[] {
  const map = new Map<string, GroupedOption>()
  for (const r of regs) {
    const key = r.option_label || '(sans tarif)'
    const g = map.get(key) || { label: key, count: 0, places: 0, amount: 0 }
    g.count += 1
    g.places += (r.quantity || 1) * (r.option_seats || 1)
    g.amount += r.total_amount || 0
    map.set(key, g)
  }
  return Array.from(map.values())
}

function RegBlock({ label, regs }: { label: string; regs: PubReg[] }) {
  const groups = groupByOption(regs)
  const totalCount = regs.length
  const totalPlaces = groups.reduce((s, g) => s + g.places, 0)
  const totalAmount = groups.reduce((s, g) => s + g.amount, 0)

  return (
    <div style={{ marginBottom: '10px' }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>
        {label}
      </p>
      {groups.map(g => (
        <p key={g.label} style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0', lineHeight: 1.5 }}>
          {g.label} — {g.count} inscription{g.count > 1 ? 's' : ''} · {g.places} place{g.places > 1 ? 's' : ''} · CHF {formatCHF(g.amount)}
        </p>
      ))}
      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0 0' }}>
        Total {label.toLowerCase()} : {totalCount} · {totalPlaces} place{totalPlaces > 1 ? 's' : ''} · CHF {formatCHF(totalAmount)}
      </p>
    </div>
  )
}

function TotalLine({ regs, bold, label }: { regs: PubReg[]; bold?: boolean; label: string }) {
  const count = regs.length
  const places = regs.reduce((s, r) => s + (r.quantity || 1) * (r.option_seats || 1), 0)
  const amount = regs.reduce((s, r) => s + (r.total_amount || 0), 0)
  return (
    <div style={{ borderTop: '1.5px solid var(--border-color)', paddingTop: '6px', marginTop: '4px' }}>
      <p style={{ fontSize: '13px', fontWeight: bold ? 700 : 600, color: 'var(--text-primary)', margin: 0 }}>
        {label} : {count} inscription{count > 1 ? 's' : ''} · {places} place{places > 1 ? 's' : ''} · CHF {formatCHF(amount)}
      </p>
    </div>
  )
}
