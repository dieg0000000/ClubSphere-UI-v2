import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Users, Award, Building2, ExternalLink } from 'lucide-react'
import { Tabs } from '../components/ui/Tabs'
import { supabase } from '../lib/supabase'
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'
import { ZoomablePhoto } from '../components/PhotoViewer'

interface DirectoryEntry {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  committee_function: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  is_committee: boolean
  sort_order: number | null
}

interface ConfrerieEntry {
  first_name: string | null
  last_name: string | null
  member_since: string | null
  email: string | null
  phone: string | null
}

interface SponsorEntry {
  id: string
  company_name: string
  logo_url: string | null
  website_url: string | null
}

type AnnuaireTab = 'comite' | 'confrerie' | 'sponsors'

export default function AnnuaireMember() {
  const [params, setParams] = useSearchParams()
  const [directory, setDirectory] = useState<DirectoryEntry[]>([])
  const [confrerie, setConfrerie] = useState<ConfrerieEntry[]>([])
  const [sponsors, setSponsors] = useState<SponsorEntry[]>([])
  const [confrerieLabel, setConfrerieLabel] = useState('Confrérie')
  const [loadedComite, setLoadedComite] = useState(false)
  const [loadedConfrerie, setLoadedConfrerie] = useState(false)
  const [loadedSponsors, setLoadedSponsors] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const raw = params.get('tab')
  const tab: AnnuaireTab =
    raw === 'confrerie' ? 'confrerie' :
    raw === 'sponsors' ? 'sponsors' :
    'comite'

  const setTab = (t: AnnuaireTab) => {
    const next = new URLSearchParams(params)
    if (t === 'comite') next.delete('tab')
    else next.set('tab', t)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    supabase
      .from('club_settings')
      .select('confrerie_label')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { reportLoadError('AnnuaireMember', error); setLoadFailed(true); return }
        if (data?.confrerie_label) setConfrerieLabel(data.confrerie_label)
      })
  }, [retryKey])

  useEffect(() => {
    if (tab === 'comite' && !loadedComite) {
      supabase.rpc('get_committee_directory').then(({ data, error }) => {
        if (error) { reportLoadError('AnnuaireMember', error); setLoadFailed(true); return }
        if (data) setDirectory(data)
        setLoadedComite(true)
      })
    }
  }, [tab, loadedComite])

  useEffect(() => {
    if (tab === 'confrerie' && !loadedConfrerie) {
      supabase.rpc('get_confrerie_directory').then(({ data, error }) => {
        if (error) { reportLoadError('AnnuaireMember', error); setLoadFailed(true); return }
        if (data) setConfrerie(data)
        setLoadedConfrerie(true)
      })
    }
  }, [tab, loadedConfrerie])

  useEffect(() => {
    if (tab === 'sponsors' && !loadedSponsors) {
      supabase
        .from('sponsors')
        .select('id, company_name, logo_url, website_url')
        .eq('active', true)
        .order('company_name')
        .then(({ data, error }) => {
          if (error) { reportLoadError('AnnuaireMember', error); setLoadFailed(true); return }
          if (data) setSponsors(data)
          setLoadedSponsors(true)
        })
    }
  }, [tab, loadedSponsors])

  const tabItems = [
    { key: 'comite' as const, label: 'Comité', icon: <Users size={15} /> },
    { key: 'confrerie' as const, label: confrerieLabel, icon: <Award size={15} /> },
    { key: 'sponsors' as const, label: 'Sponsors', icon: <Building2 size={15} /> },
  ]

  return (
    <div>
      <Tabs
        items={tabItems}
        value={tab}
        onChange={(k) => setTab(k as AnnuaireTab)}
        className="mb-6"
      />

      {loadFailed && <LoadError onRetry={() => { setLoadFailed(false); setRetryKey(k => k + 1) }} />}

      {tab === 'comite' && <ComiteTab directory={directory} />}
      {tab === 'confrerie' && <ConfrerieTab entries={confrerie} />}
      {tab === 'sponsors' && <SponsorsTab sponsors={sponsors} />}
    </div>
  )
}

function ComiteRow({ entry, showOperationnelBadge }: { entry: DirectoryEntry; showOperationnelBadge?: boolean }) {
  const firstName = entry.first_name || ''
  const lastName = entry.last_name || ''
  const displayName = firstName || lastName
    ? `${firstName} ${lastName}`.trim()
    : entry.full_name || ''
  const initials = (firstName?.[0] || displayName?.[0] || '') + (lastName?.[0] || '')

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '16px 20px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}
    >
      {entry.avatar_url ? (
        <ZoomablePhoto
          src={entry.avatar_url}
          caption={displayName}
          alt=""
          style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--bg-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: '16px',
          fontWeight: '600',
          flexShrink: 0
        }}>
          {initials.toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
          {entry.committee_function && (
            <span style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: '600' }}>
              {entry.committee_function}
            </span>
          )}
          <h3 style={{ color: 'var(--text-primary)', margin: '0', fontSize: '16px', fontWeight: '700' }}>
            {displayName}
          </h3>
          {showOperationnelBadge && (
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
              background: 'var(--bg-hover)', color: 'var(--text-muted)', whiteSpace: 'nowrap',
            }}>
              Opérationnel
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {entry.email && (
            <a href={`mailto:${entry.email}`} style={{ color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none' }}>
              {entry.email}
            </a>
          )}
          {entry.phone && (
            <a href={`tel:${entry.phone}`} style={{ color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none' }}>
              {entry.phone}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function ComiteTab({ directory }: { directory: DirectoryEntry[] }) {
  const comite = directory.filter(e => e.is_committee)
  const responsables = directory.filter(e => !e.is_committee)

  if (directory.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
        Aucun membre du comité
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {comite.length > 0 && (
        <div>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', margin: '0 0 12px' }}>Comité</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {comite.map(entry => <ComiteRow key={entry.id} entry={entry} showOperationnelBadge={!entry.is_committee} />)}
          </div>
        </div>
      )}
      {responsables.length > 0 && (
        <div>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', margin: '0 0 12px' }}>Responsables</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {responsables.map(entry => <ComiteRow key={entry.id} entry={entry} showOperationnelBadge={!entry.is_committee} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function ConfrerieTab({ entries }: { entries: ConfrerieEntry[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {entries.map((entry, idx) => {
        const firstName = entry.first_name || ''
        const lastName = entry.last_name || ''
        const displayName = `${firstName} ${lastName}`.trim() || '—'
        const initials = (firstName?.[0] || '') + (lastName?.[0] || '')
        const memberYear = entry.member_since ? new Date(entry.member_since).getFullYear() : null

        return (
          <div
            key={`${entry.last_name}-${idx}`}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '16px 20px',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: '16px',
              fontWeight: '600',
              flexShrink: 0
            }}>
              {initials.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <h3 style={{ color: 'var(--text-primary)', margin: '0', fontSize: '16px', fontWeight: '700' }}>
                  {displayName}
                </h3>
                {memberYear && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500' }}>
                    membre depuis {memberYear}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {entry.email && (
                  <a href={`mailto:${entry.email}`} style={{ color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none' }}>
                    {entry.email}
                  </a>
                )}
                {entry.phone && (
                  <a href={`tel:${entry.phone}`} style={{ color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none' }}>
                    {entry.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
      {entries.length === 0 && (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
          Aucun membre
        </div>
      )}
    </div>
  )
}

function SponsorsTab({ sponsors }: { sponsors: SponsorEntry[] }) {
  if (sponsors.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
        Aucun sponsor
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
      {sponsors.map((sponsor) => (
        <div
          key={sponsor.id}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {sponsor.logo_url ? (
            <ZoomablePhoto
              src={sponsor.logo_url}
              caption={sponsor.company_name}
              alt={sponsor.company_name}
              style={{ width: '56px', height: '56px', objectFit: 'contain', borderRadius: '8px', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '8px',
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '20px',
              fontWeight: '700',
              flexShrink: 0,
            }}>
              {sponsor.company_name[0]?.toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 4px', fontSize: '15px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sponsor.company_name}
            </h3>
            {sponsor.website_url && (
              <a
                href={sponsor.website_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)', fontSize: '13px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                Visiter le site <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
