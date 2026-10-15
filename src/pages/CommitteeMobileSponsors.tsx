import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { ChevronLeft, Loader as Loader2, Monitor as DesktopIcon, X, ExternalLink } from 'lucide-react'
import { ZoomablePhoto } from '../components/PhotoViewer'

/* ── types ── */

interface SponsorRow {
  id: string
  company_name: string
  contact_first_name: string | null
  contact_last_name: string | null
  sponsoring_type: string | null
  sponsoring_since: string | null
  logo_url: string | null
  website_url: string | null
  status: string | null
}

interface ImpressionRow {
  sponsor_id: string
  date: string
  count: number
}

type Period = '30j' | 'saison' | 'tout'

/* ── helpers ── */

function fmtNum(n: number): string {
  return n.toLocaleString('fr-CH')
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* ── component ── */

export default function CommitteeMobileSponsors() {
  const { clubId } = useTenant()
  const navigate = useNavigate()

  const [period, setPeriod] = useState<Period>('30j')
  const [sponsors, setSponsors] = useState<SponsorRow[]>([])
  const [impressions, setImpressions] = useState<ImpressionRow[]>([])
  const [seasonStart, setSeasonStart] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSponsor, setSelectedSponsor] = useState<SponsorRow | null>(null)

  const load = useCallback(async () => {
    if (!clubId) return
    setLoading(true)

    const [spRes, impRes, seasonRes] = await Promise.all([
      supabase
        .from('sponsors')
        .select('id, company_name, contact_first_name, contact_last_name, sponsoring_type, sponsoring_since, logo_url, website_url, status')
        .eq('club_id', clubId)
        .eq('status', 'actif'),
      supabase
        .from('sponsor_impressions')
        .select('sponsor_id, date, count'),
      supabase
        .from('seasons')
        .select('start_date')
        .eq('active', true)
        .limit(1)
        .maybeSingle(),
    ])

    setSponsors(spRes.data || [])
    setImpressions(impRes.data || [])
    setSeasonStart(seasonRes.data?.start_date || null)
    setLoading(false)
  }, [clubId])

  useEffect(() => { load() }, [load])

  const cutoff = useMemo(() => {
    if (period === 'tout') return null
    if (period === 'saison' && seasonStart) return seasonStart
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  }, [period, seasonStart])

  const { ranked, total, maxCount } = useMemo(() => {
    const sponsorIds = new Set(sponsors.map(s => s.id))
    const map = new Map<string, number>()
    for (const r of impressions) {
      if (!sponsorIds.has(r.sponsor_id)) continue
      if (cutoff && r.date < cutoff) continue
      map.set(r.sponsor_id, (map.get(r.sponsor_id) || 0) + r.count)
    }
    let totalCount = 0
    let mx = 0
    const rows = sponsors.map(s => {
      const count = map.get(s.id) || 0
      totalCount += count
      if (count > mx) mx = count
      return { sponsor: s, count }
    })
    rows.sort((a, b) => b.count - a.count)
    return { ranked: rows, total: totalCount, maxCount: mx }
  }, [sponsors, impressions, cutoff])

  const computeForPeriod = useCallback((sponsorId: string, p: Period): number => {
    let c: string | null = null
    if (p === 'saison' && seasonStart) c = seasonStart
    else if (p === '30j') {
      const d = new Date(); d.setDate(d.getDate() - 30); c = d.toISOString().split('T')[0]
    }
    let sum = 0
    for (const r of impressions) {
      if (r.sponsor_id !== sponsorId) continue
      if (c && r.date < c) continue
      sum += r.count
    }
    return sum
  }, [impressions, seasonStart])

  const PERIODS: [Period, string][] = [['30j', '30 jours'], ['saison', 'Saison'], ['tout', 'Tout']]

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
          Sponsors
        </h1>
      </div>

      {/* Period chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {PERIODS.map(([val, label]) => {
          const active = period === val
          return (
            <button
              key={val}
              type="button"
              onClick={() => setPeriod(val)}
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
      ) : sponsors.length === 0 ? (
        <div style={{
          padding: '32px 16px', borderRadius: '12px', background: 'var(--bg-card)',
          border: '1px solid var(--border-color)', textAlign: 'center',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Aucun sponsor actif</p>
        </div>
      ) : (
        <>
          {/* Total banner */}
          <div style={{
            padding: '10px 14px', borderRadius: '10px', marginBottom: '10px',
            background: 'var(--accent-soft, rgba(37,99,235,0.06))',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent, #2563eb)' }}>
              {fmtNum(total)} affichages sur la période
            </span>
          </div>

          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {ranked.map(({ sponsor: s, count }) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSponsor(s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: '12px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                {/* Logo / initials */}
                {s.logo_url ? (
                  <ZoomablePhoto
                    src={s.logo_url}
                    caption={s.company_name}
                    alt=""
                    style={{ width: 38, height: 38, borderRadius: '8px', objectFit: 'contain', flexShrink: 0, background: '#fff' }}
                  />
                ) : (
                  <div style={{
                    width: 38, height: 38, borderRadius: '8px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--accent-soft, rgba(37,99,235,0.08))', color: 'var(--accent, #2563eb)',
                    fontSize: '14px', fontWeight: 700,
                  }}>
                    {initials(s.company_name)}
                  </div>
                )}

                {/* Name + type */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.company_name}
                  </p>
                  {s.sponsoring_type && (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0' }}>{s.sponsoring_type}</p>
                  )}
                  {/* Bar */}
                  {maxCount > 0 && (
                    <div style={{ marginTop: '4px', height: '3px', borderRadius: '2px', background: 'var(--border-color)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '2px',
                        background: 'var(--accent, #2563eb)',
                        width: `${Math.max((count / maxCount) * 100, count > 0 ? 2 : 0)}%`,
                      }} />
                    </div>
                  )}
                </div>

                {/* Count */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {fmtNum(count)}
                  </p>
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>affichages</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Desktop CTA */}
      <div style={{
        marginTop: '18px', padding: '14px 16px', borderRadius: '12px',
        background: 'var(--accent-soft, rgba(0,100,200,0.06))',
        border: '1px solid var(--accent, #2563eb)',
      }}>
        <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent)', margin: '0 0 4px' }}>
          <DesktopIcon size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
          Poste de travail complet sur ordinateur
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Logos, contrats et gestion des sponsors se font depuis un ordinateur.
        </p>
      </div>

      {/* Detail sheet */}
      {selectedSponsor && (
        <SponsorSheet
          sponsor={selectedSponsor}
          computeForPeriod={computeForPeriod}
          onClose={() => setSelectedSponsor(null)}
        />
      )}
    </div>
  )
}

/* ── detail sheet ── */

function SponsorSheet({
  sponsor: s,
  computeForPeriod,
  onClose,
}: {
  sponsor: SponsorRow
  computeForPeriod: (id: string, p: Period) => number
  onClose: () => void
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const periods: [Period, string][] = [['30j', '30 jours'], ['saison', 'Saison'], ['tout', 'Tout']]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)' }}
      />
      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
        background: 'var(--bg-card)', borderRadius: '16px 16px 0 0',
        padding: '20px 20px 32px', maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      }}>
        {/* Close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
          <button type="button" onClick={onClose} style={{
            width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: 'var(--bg-hover)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          {s.logo_url ? (
            <ZoomablePhoto
              src={s.logo_url}
              caption={s.company_name}
              alt=""
              style={{ width: 46, height: 46, borderRadius: '10px', objectFit: 'contain', background: '#fff' }}
            />
          ) : (
            <div style={{
              width: 46, height: 46, borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: '16px', fontWeight: 700,
            }}>
              {initials(s.company_name)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {s.company_name}
            </p>
            {(s.contact_first_name || s.contact_last_name) && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {[s.contact_first_name, s.contact_last_name].filter(Boolean).join(' ')}
              </p>
            )}
          </div>
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          {s.website_url && (
            <a
              href={s.website_url.startsWith('http') ? s.website_url : `https://${s.website_url}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '13px', color: 'var(--accent, #2563eb)',
                display: 'flex', alignItems: 'center', gap: '4px',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={13} />
              {s.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}
          {s.sponsoring_since && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Sponsor depuis le {formatDate(s.sponsoring_since)}
            </p>
          )}
          {s.sponsoring_type && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Type : {s.sponsoring_type}
            </p>
          )}
        </div>

        {/* Impressions per period */}
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          Affichages
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          {periods.map(([p, label]) => {
            const val = computeForPeriod(s.id, p)
            return (
              <div
                key={p}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: '10px',
                  background: 'var(--bg-page, var(--bg-card))',
                  border: '1px solid var(--border-color)', textAlign: 'center',
                }}
              >
                <p style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  {fmtNum(val)}
                </p>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{label}</p>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
