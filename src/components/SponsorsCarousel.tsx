import { useEffect, useRef, useState, useMemo } from 'react'
import { ExternalLink, Handshake } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { waitForBundleIfPending } from '../lib/dashboardCache'

const ACCENT = 'var(--accent)'
const ROTATION_INTERVAL_MS = 3000

interface SponsorWithWeight {
  id: string
  company_name: string
  logo_url: string | null
  website_url: string | null
  weight: number
}

interface Props {
  accentColor?: string
}

function weightedShuffle(items: SponsorWithWeight[]): SponsorWithWeight[] {
  if (items.length <= 1) return [...items]
  return [...items]
    .map(item => ({ item, key: -Math.log(Math.random()) / Math.max(item.weight, 1) }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item)
}

async function trackImpression(sponsorId: string) {
  try {
    await supabase.rpc('track_sponsor_impression', { p_sponsor_id: sponsorId })
  } catch (e) {
    console.warn('Impression tracking failed', e)
  }
}

export function SponsorsCarousel({ accentColor = ACCENT }: Props) {
  const [sponsors, setSponsors] = useState<SponsorWithWeight[]>([])
  const [index, setIndex] = useState(0)
  const [sliding, setSliding] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right'>('left')
  const [visibleCount, setVisibleCount] = useState(3)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hovered = useRef(false)

  useEffect(() => {
    async function load() {
      let raw: SponsorWithWeight[] = []

      const cached = await waitForBundleIfPending()
      if (cached && cached.sponsors.length > 0) {
        raw = cached.sponsors.map((s: any) => ({
          id: s.id,
          company_name: s.company_name,
          logo_url: s.logo_url,
          website_url: s.website_url,
          weight: s.display_weight || Math.max(500, s.sponsoring_amount || 0),
        }))
      } else {
        const { data } = await supabase.rpc('get_sponsor_carousel')
        if (!data || data.length === 0) return
        raw = data.map((s: any) => ({
          id: s.id,
          company_name: s.company_name,
          logo_url: s.logo_url,
          website_url: s.website_url,
          weight: s.display_weight,
        }))
      }

      setSponsors(weightedShuffle(raw))
    }
    load()

    const handleResize = () => setVisibleCount(window.innerWidth < 640 ? 1 : 3)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const advance = () => {
    setDirection('left')
    setSliding(true)
    setTimeout(() => {
      setIndex(prev => (prev + 1) % Math.max(sponsors.length, 1))
      setSliding(false)
    }, 400)
  }

  const startInterval = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      if (!hovered.current) advance()
    }, ROTATION_INTERVAL_MS)
  }

  useEffect(() => {
    if (sponsors.length <= 1) return
    startInterval()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [sponsors.length])

  useEffect(() => {
    if (sponsors.length === 0) return
    const visible = Array.from(
      { length: Math.min(visibleCount, sponsors.length) },
      (_, i) => sponsors[(index + i) % sponsors.length]
    )
    visible.forEach(s => trackImpression(s.id))
  }, [index, sponsors, visibleCount])

  if (sponsors.length === 0) return null

  const visibleSponsors = Array.from({ length: Math.min(visibleCount, sponsors.length) }, (_, i) =>
    sponsors[(index + i) % sponsors.length]
  )

  const translateX = sliding
    ? direction === 'left' ? '-100%' : '100%'
    : '0%'

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        padding: '20px',
      }}
      onMouseEnter={() => { hovered.current = true }}
      onMouseLeave={() => { hovered.current = false }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <Handshake className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        <span style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '15px' }}>Nos Sponsors</span>
      </div>

      <div style={{ overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            gap: '12px',
            transform: `translateX(${translateX})`,
            transition: sliding ? 'transform 0.4s ease' : 'none',
          }}
        >
          {visibleSponsors.map((sponsor, i) => {
            const clickable = !!sponsor.website_url
            return (
              <div
                key={`${sponsor.id}-${i}`}
                onClick={() => clickable && window.open(sponsor.website_url!, '_blank', 'noopener,noreferrer')}
                style={{
                  flex: `0 0 calc(${100 / visibleSponsors.length}% - ${(12 * (visibleSponsors.length - 1)) / visibleSponsors.length}px)`,
                  cursor: clickable ? 'pointer' : 'default',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div style={{
                  background: 'var(--bg-card)',
                  borderRadius: '10px',
                  padding: '12px 20px',
                  width: '100%',
                  height: '120px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  transition: 'box-shadow 0.2s',
                }}
                  onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 2px ${accentColor}66` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
                >
                  {sponsor.logo_url ? (
                    <img
                      src={sponsor.logo_url}
                      alt={sponsor.company_name}
                      style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '700', textAlign: 'center' }}>
                      {sponsor.company_name}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600', textAlign: 'center' }}>
                    {sponsor.company_name}
                  </span>
                  {clickable && <ExternalLink size={12} style={{ color: accentColor, flexShrink: 0 }} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {sponsors.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '14px' }}>
          {sponsors.map((_, i) => (
            <button
              key={i}
              style={{
                width: i === index ? '20px' : '8px',
                height: '8px',
                borderRadius: '99px',
                background: i === index ? accentColor : 'var(--border-color)',
                border: 'none',
                cursor: 'default',
                padding: 0,
                transition: 'all 0.3s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
