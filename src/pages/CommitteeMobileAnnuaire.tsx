import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'
import { Phone, Mail, ChevronRight } from 'lucide-react'
import SearchInput from '../components/ui/SearchInput'
import { Badge } from '../components/ui/Badge'
import type { BadgeVariant } from '../components/ui/Badge'
import { ZoomablePhoto } from '../components/PhotoViewer'

type PersonType = 'joueur' | 'entraineur' | 'comite' | 'supporter' | 'arbitre' | 'confrerie'
type FilterKey = PersonType | 'tous'

function buildTypeConfig(confrerieLabel: string): Record<PersonType, { label: string; variant: BadgeVariant }> {
  return {
    joueur:     { label: 'Joueur',        variant: 'blue' },
    entraineur: { label: 'Entraîneur',    variant: 'green' },
    comite:     { label: 'Comité',        variant: 'orange' },
    supporter:  { label: 'Supporter',     variant: 'sky' },
    arbitre:    { label: 'Arbitre',       variant: 'yellow' },
    confrerie:  { label: confrerieLabel,  variant: 'violet' },
  }
}

function buildFilterOptions(confrerieLabel: string): { key: FilterKey; label: string }[] {
  return [
    { key: 'tous',       label: 'Tous' },
    { key: 'joueur',     label: 'Joueurs' },
    { key: 'entraineur', label: 'Entraîneurs' },
    { key: 'comite',     label: 'Comité' },
    { key: 'supporter',  label: 'Supporters' },
    { key: 'arbitre',    label: 'Arbitres' },
    { key: 'confrerie',  label: confrerieLabel },
  ]
}

const PHOTO_PRIORITY: PersonType[] = ['comite', 'joueur', 'entraineur', 'supporter', 'arbitre', 'confrerie']

interface PersonRow {
  key: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  photoUrl: string | null
  types: PersonType[]
  subtitle: string | null
  isOperationnel?: boolean
  address: string | null
  sourceId: string
  sourceType: PersonType
  _subtitleParts?: Map<PersonType, string>
  _photoParts?: Map<PersonType, string>
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function matchesSearch(person: PersonRow, query: string): boolean {
  if (!query) return true
  const nq = normalize(query)
  if (!nq) return true
  const tokens = nq.split(' ').filter(Boolean)
  if (tokens.length === 0) return true
  const fwd = normalize(`${person.firstName} ${person.lastName}`)
  const rev = normalize(`${person.lastName} ${person.firstName}`)
  return tokens.every(t => fwd.includes(t) || rev.includes(t))
}

export default function CommitteeMobileAnnuaire() {
  const { clubId } = useTenant()
  const [search, setSearch] = useState('')
  const [allPeople, setAllPeople] = useState<PersonRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('tous')
  const [selectedPerson, setSelectedPerson] = useState<PersonRow | null>(null)
  const [confrerieLabel, setConfrerieLabel] = useState('Club des 500')

  useEffect(() => {
    if (!clubId) return
    supabase.from('club_settings').select('confrerie_label').eq('club_id', clubId).maybeSingle()
      .then(({ data }) => { if (data?.confrerie_label) setConfrerieLabel(data.confrerie_label) })
  }, [clubId])

  const typeConfig = useMemo(() => buildTypeConfig(confrerieLabel), [confrerieLabel])
  const filterOptions = useMemo(() => buildFilterOptions(confrerieLabel), [confrerieLabel])

  const fetchAll = useCallback(async () => {
    if (!clubId) return

    const [membersRes, coachesRes, committeeRpcRes, committeeLinkRes, supportersRes, refereesRes, confrerieRes] = await Promise.all([
      supabase
        .from('members')
        .select('id, first_name, last_name, email, phone, address, street_number, postal_code, city, team_id, photo_url, teams(name)')
        .eq('club_id', clubId)
        .is('departure_date', null),
      supabase
        .from('coaches')
        .select('id, first_name, last_name, email, phone, address, postal_code, city, avatar_url')
        .eq('club_id', clubId)
        .is('self_deleted_at', null),
      supabase.rpc('get_committee_directory'),
      supabase
        .from('committee_members')
        .select('id, coach_id, member_id, profile_id')
        .eq('club_id', clubId),
      supabase
        .from('supporters')
        .select('id, first_name, last_name, email, phone, address, postal_code, city')
        .eq('club_id', clubId),
      supabase
        .from('referees')
        .select('id, first_name, last_name, email, phone, active, profile_photo_url')
        .eq('club_id', clubId)
        .eq('active', true),
      supabase
        .from('confrerie_members')
        .select('id, first_name, last_name, email, phone, address, postal_code, city, active')
        .eq('club_id', clubId)
        .eq('active', true),
    ])

    const coachTeamMap = new Map<string, string>()
    const coachIds = (coachesRes.data || []).map((c: any) => c.id)
    if (coachIds.length > 0) {
      const { data: teamLinks } = await supabase
        .from('teams')
        .select('name, coach_id, assistant_coach_id')
        .eq('club_id', clubId)
        .eq('active', true)
        .or(`coach_id.in.(${coachIds.join(',')}),assistant_coach_id.in.(${coachIds.join(',')})`)
      for (const t of teamLinks || []) {
        if (t.coach_id && coachIds.includes(t.coach_id)) {
          coachTeamMap.set(t.coach_id, t.name)
        }
        if (t.assistant_coach_id && coachIds.includes(t.assistant_coach_id)) {
          coachTeamMap.set(t.assistant_coach_id, t.name)
        }
      }
    }

    const rows: PersonRow[] = []

    const addRow = (
      id: string,
      type: PersonType,
      firstName: string,
      lastName: string,
      email: string | null,
      phone: string | null,
      subtitle: string | null,
      address: string | null,
      photo: string | null,
    ) => {
      const parts = new Map<PersonType, string>()
      if (subtitle) parts.set(type, subtitle)
      const photoParts = new Map<PersonType, string>()
      if (photo) photoParts.set(type, photo)
      rows.push({
        key: `${type}-${id}`,
        firstName,
        lastName,
        email: email?.toLowerCase() || null,
        phone,
        photoUrl: photo,
        types: [type],
        subtitle,
        address,
        sourceId: id,
        sourceType: type,
        _subtitleParts: parts,
        _photoParts: photoParts,
        isOperationnel: false,
      })
    }

    const buildAddress = (...parts: (string | null | undefined)[]) =>
      parts.filter(Boolean).join(', ') || null

    for (const m of membersRes.data || []) {
      const t = (m as any).teams
      addRow(m.id, 'joueur', m.first_name, m.last_name, m.email, m.phone,
        t?.name || null,
        buildAddress(m.address, (m as any).street_number, m.postal_code, m.city),
        (m as any).photo_url || null)
    }
    for (const c of coachesRes.data || []) {
      addRow(c.id, 'entraineur', c.first_name, c.last_name, c.email, c.phone,
        coachTeamMap.get(c.id) || null,
        buildAddress(c.address, c.postal_code, c.city),
        (c as any).avatar_url || null)
    }
    const committeeLinkMap = new Map<string, { coachId: string | null; memberId: string | null; profileId: string | null }>()
    for (const link of committeeLinkRes.data || []) {
      committeeLinkMap.set(link.id, {
        coachId: (link as any).coach_id || null,
        memberId: (link as any).member_id || null,
        profileId: (link as any).profile_id || null,
      })
    }
    for (const c of committeeRpcRes.data || []) {
      addRow(c.id, 'comite', c.first_name, c.last_name, c.email, c.phone,
        (c as any).committee_function || null,
        null,
        (c as any).avatar_url || null)
      if ((c as any).is_committee === false) {
        rows[rows.length - 1].isOperationnel = true
      }
    }
    for (const s of supportersRes.data || []) {
      addRow(s.id, 'supporter', s.first_name, s.last_name, s.email, s.phone,
        null,
        buildAddress(s.address, s.postal_code, s.city),
        null)
    }
    for (const r of refereesRes.data || []) {
      addRow(r.id, 'arbitre', r.first_name, r.last_name, r.email, r.phone, null, null,
        (r as any).profile_photo_url || null)
    }
    for (const c of confrerieRes.data || []) {
      addRow(c.id, 'confrerie', c.first_name, c.last_name, c.email, c.phone,
        null,
        buildAddress(c.address, c.postal_code, c.city),
        null)
    }

    const merged = deduplicatePeople(rows, committeeLinkMap)
    merged.sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName, 'fr')
      return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName, 'fr')
    })

    setAllPeople(merged)
    setLoaded(true)
  }, [clubId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const trimmedSearch = search.trim()

  const filtered = useMemo(() => {
    let list = allPeople
    if (filter !== 'tous') {
      list = list.filter(p => p.types.includes(filter))
    }
    if (trimmedSearch) {
      list = list.filter(p => matchesSearch(p, trimmedSearch))
    }
    return list
  }, [allPeople, filter, trimmedSearch])

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
        Annuaire du club
      </h1>

      <div style={{ marginBottom: '12px' }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher..."
        />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {filterOptions.map(opt => {
          const active = filter === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              style={{
                padding: '5px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid',
                borderColor: active ? 'var(--accent)' : 'var(--border-color)',
                background: active ? 'var(--accent)' : 'var(--bg-card)',
                color: active ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Results */}
      {!loaded ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="animate-spin" style={{ width: 24, height: 24, border: '2.5px solid var(--border-color)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>
          Aucun résultat
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          {filtered.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setSelectedPerson(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 14px', background: 'var(--bg-card)',
                border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              {p.photoUrl ? (
                <ZoomablePhoto
                  src={p.photoUrl}
                  caption={`${p.firstName} ${p.lastName}`}
                  alt=""
                  style={{
                    width: 38, height: 38, borderRadius: '50%',
                    objectFit: 'cover', flexShrink: 0,
                  }}
                />
              ) : (
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'var(--accent-soft, rgba(0,100,200,0.08))',
                  color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 700, flexShrink: 0,
                }}>
                  {(p.firstName[0] || '').toUpperCase()}{(p.lastName[0] || '').toUpperCase()}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.firstName} {p.lastName}
                </p>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                  {p.types.map(t => (
                    <Badge key={t} variant={typeConfig[t].variant}>{typeConfig[t].label}</Badge>
                  ))}
                  {p.isOperationnel && <Badge variant="neutral">Opérationnel</Badge>}
                </div>
                {p.subtitle && (
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.subtitle}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
                {p.phone && (
                  <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--accent)', padding: '4px' }}>
                    <Phone size={16} />
                  </a>
                )}
                {p.email && (
                  <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--accent)', padding: '4px' }}>
                    <Mail size={16} />
                  </a>
                )}
                <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Count */}
      {loaded && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '10px' }}>
          {filtered.length} personne{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {selectedPerson && (
        <PersonDrawer person={selectedPerson} onClose={() => setSelectedPerson(null)} typeConfig={typeConfig} />
      )}
    </div>
  )
}

function buildMergedSubtitle(parts: Map<PersonType, string>): string | null {
  const segments: string[] = []
  if (parts.has('comite')) segments.push(parts.get('comite')!)
  for (const [type, value] of parts) {
    if (type !== 'comite' && !segments.includes(value)) segments.push(value)
  }
  return segments.length > 0 ? segments.join(' · ') : null
}

function deduplicatePeople(
  rows: PersonRow[],
  committeeLinks: Map<string, { coachId: string | null; memberId: string | null; profileId: string | null }>,
): PersonRow[] {
  const parent: number[] = rows.map((_, i) => i)
  function find(i: number): number {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const byEmail = new Map<string, number>()
  const byMemberId = new Map<string, number>()
  const byCoachId = new Map<string, number>()

  rows.forEach((row, i) => {
    if (row.sourceType === 'joueur') byMemberId.set(row.sourceId, i)
    if (row.sourceType === 'entraineur') byCoachId.set(row.sourceId, i)
  })

  rows.forEach((row, i) => {
    if (row.sourceType === 'comite') {
      const links = committeeLinks.get(row.sourceId)
      if (links) {
        if (links.memberId) {
          const j = byMemberId.get(links.memberId)
          if (j !== undefined) union(i, j)
        }
        if (links.coachId) {
          const j = byCoachId.get(links.coachId)
          if (j !== undefined) union(i, j)
        }
      }
    }
    if (row.email) {
      const existing = byEmail.get(row.email)
      if (existing !== undefined) union(existing, i)
      else byEmail.set(row.email, i)
    }
  })

  const groups = new Map<number, number[]>()
  rows.forEach((_, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  })

  const result: PersonRow[] = []
  for (const indices of groups.values()) {
    const first = rows[indices[0]]
    const merged: PersonRow = {
      ...first,
      _subtitleParts: new Map(first._subtitleParts),
      _photoParts: new Map(first._photoParts),
      types: [...first.types],
    }
    for (let k = 1; k < indices.length; k++) {
      const row = rows[indices[k]]
      for (const t of row.types) {
        if (!merged.types.includes(t)) merged.types.push(t)
      }
      if (!merged.phone && row.phone) merged.phone = row.phone
      if (!merged.email && row.email) merged.email = row.email
      if (!merged.address && row.address) merged.address = row.address
      if (row.isOperationnel) merged.isOperationnel = true
      if (row._photoParts) {
        for (const [pt, v] of row._photoParts) {
          if (!merged._photoParts!.has(pt)) merged._photoParts!.set(pt, v)
        }
      }
      if (row._subtitleParts) {
        for (const [pt, v] of row._subtitleParts) {
          if (!merged._subtitleParts!.has(pt)) merged._subtitleParts!.set(pt, v)
        }
      }
    }
    if (merged._subtitleParts && merged._subtitleParts.size > 0) {
      merged.subtitle = buildMergedSubtitle(merged._subtitleParts)
    }
    if (merged._photoParts && merged._photoParts.size > 0) {
      merged.photoUrl = null
      for (const type of PHOTO_PRIORITY) {
        const url = merged._photoParts.get(type)
        if (url) { merged.photoUrl = url; break }
      }
    }
    result.push(merged)
  }
  return result
}

function PersonDrawer({ person, onClose, typeConfig }: { person: PersonRow; onClose: () => void; typeConfig: Record<PersonType, { label: string; variant: BadgeVariant }> }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div
        style={{
          position: 'relative', marginTop: 'auto', background: 'var(--bg-card)',
          borderRadius: '16px 16px 0 0', padding: '20px', maxHeight: '80vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-color)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          {person.photoUrl ? (
            <ZoomablePhoto
              src={person.photoUrl}
              caption={`${person.firstName} ${person.lastName}`}
              alt=""
              style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--accent-soft, rgba(0,100,200,0.08))',
              color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', fontWeight: 700, flexShrink: 0,
            }}>
              {(person.firstName[0] || '').toUpperCase()}{(person.lastName[0] || '').toUpperCase()}
            </div>
          )}
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {person.firstName} {person.lastName}
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {person.types.map(t => (
            <Badge key={t} variant={typeConfig[t].variant}>{typeConfig[t].label}</Badge>
          ))}
          {person.isOperationnel && <Badge variant="neutral">Opérationnel</Badge>}
        </div>

        {person.subtitle && <InfoRow label="Fonction / Équipe" value={person.subtitle} />}
        {person.email && <InfoRow label="Email" value={person.email} href={`mailto:${person.email}`} />}
        {person.phone && <InfoRow label="Téléphone" value={person.phone} href={`tel:${person.phone}`} />}
        {person.address && <InfoRow label="Adresse" value={person.address} />}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '16px', width: '100%', padding: '12px',
            background: 'var(--bg-hover)', color: 'var(--text-primary)',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
      {href ? (
        <a href={href} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
          {value}
        </a>
      ) : (
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>
          {value}
        </span>
      )}
    </div>
  )
}
