import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/invokeFunction'
import { useTenant } from '../context/TenantContext'
import {
  ChevronLeft, ChevronDown, Loader as Loader2,
  Monitor as DesktopIcon, FileText, ShieldCheck, Search, X, Check, AlertTriangle,
} from 'lucide-react'

/* ─── category helpers ─── */
const CATEGORY_LABELS: Record<string, string> = {
  charte_joueurs: 'Charte joueurs',
  charte_joueurs_mineurs: 'Charte joueurs mineurs',
  charte_entraineurs: 'Charte entraîneurs',
}

function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? (value.charAt(0).toUpperCase() + value.slice(1))
}

const CHARTE_CATS = new Set(['charte_joueurs', 'charte_joueurs_mineurs', 'charte_entraineurs'])

type CatFilter = 'all' | 'chartes' | 'others'
type Tab = 'documents' | 'chartes'

/* ─── types ─── */
interface Season { id: string; name: string; active: boolean }

interface Doc {
  id: string
  title: string
  description: string | null
  file_name: string
  category: string
  created_at: string
  target_team_ids: string[] | null
}

interface CharteTeam {
  team_id: string
  team_name: string
  expected: number
  validated: number
  missing: { member_id: string; name: string }[]
}

interface CharteDoc {
  id: string
  title: string
  category: string
  created_at: string
  expected: number
  validated: number
  teams?: CharteTeam[]
  missing?: { coach_id: string; name: string }[]
}

interface CharteBundle {
  season: { id: string; name: string; active: boolean }
  documents: CharteDoc[]
}

/* ─── utilities ─── */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function shortTeamName(name: string): string {
  const idx = name.indexOf(' - ')
  return idx >= 0 ? name.slice(idx + 3) : name
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/* ─── component ─── */
export default function CommitteeMobileDocuments() {
  const navigate = useNavigate()
  const { clubId } = useTenant()

  const [tab, setTab] = useState<Tab>('documents')
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Documents tab
  const [docs, setDocs] = useState<Doc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [catFilter, setCatFilter] = useState<CatFilter>('all')

  // Chartes tab
  const [chartes, setChartes] = useState<CharteDoc[]>([])
  const [chartesLoading, setChartesLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  const activeSeason = seasons.find(s => s.active)
  const isArchived = seasonId != null && activeSeason != null && seasonId !== activeSeason.id

  /* ── Load seasons ── */
  useEffect(() => {
    if (!clubId) return
    ;(async () => {
      const { data } = await supabase
        .from('seasons')
        .select('id, name, active')
        .order('start_date', { ascending: false })
      if (data && data.length > 0) {
        setSeasons(data)
        const active = data.find(s => s.active) || data[0]
        setSeasonId(active.id)
      }
      setLoading(false)
    })()
  }, [clubId])

  /* ── Load documents ── */
  const loadDocs = useCallback(async () => {
    if (!seasonId || !clubId) return
    setDocsLoading(true)
    let q = supabase
      .from('documents')
      .select('id, title, description, file_name, category, created_at, target_team_ids')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (seasonId !== '__all__') {
      q = q.eq('season_id', seasonId)
    }

    const { data } = await q
    setDocs(data ?? [])
    setDocsLoading(false)
  }, [seasonId, clubId])

  /* ── Load chartes ── */
  const loadChartes = useCallback(async () => {
    if (!seasonId || seasonId === '__all__') return
    setChartesLoading(true)
    const { data, error } = await supabase.rpc('get_charte_followup', { p_season_id: seasonId })
    if (error) {
      console.error('get_charte_followup error:', error)
      setChartes([])
    } else {
      const bundle = data as unknown as CharteBundle
      setChartes(bundle?.documents ?? [])
    }
    setChartesLoading(false)
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) return
    if (tab === 'documents') loadDocs()
    else loadChartes()
  }, [seasonId, tab, loadDocs, loadChartes])

  /* ── Document open ── */
  const handleOpenDoc = async (docId: string) => {
    const { data, error } = await invokeFunction('get-document-url', {
      body: { document_id: docId },
    })
    if (error || !data?.signed_url) return
    window.open(data.signed_url, '_blank', 'noopener')
  }

  /* ── Filtered documents ── */
  const filteredDocs = useMemo(() => {
    if (catFilter === 'all') return docs
    if (catFilter === 'chartes') return docs.filter(d => CHARTE_CATS.has(d.category))
    return docs.filter(d => !CHARTE_CATS.has(d.category))
  }, [docs, catFilter])

  /* ── Search-filtered chartes ── */
  const searchNorm = stripAccents(search.trim().toLowerCase())

  const filteredChartes = useMemo(() => {
    if (!searchNorm) return chartes
    return chartes.map(ch => {
      const isCoach = ch.category === 'charte_entraineurs'
      if (isCoach) {
        const fm = ch.missing?.filter(c => stripAccents(c.name.toLowerCase()).includes(searchNorm))
        if (!fm || fm.length === 0) return null
        return { ...ch, missing: fm }
      }
      const filteredTeams = ch.teams?.map(t => {
        const fm = t.missing.filter(m => stripAccents(m.name.toLowerCase()).includes(searchNorm))
        if (fm.length === 0) return null
        return { ...t, missing: fm }
      }).filter(Boolean) as CharteTeam[] | undefined
      if (!filteredTeams || filteredTeams.length === 0) return null
      return { ...ch, teams: filteredTeams }
    }).filter(Boolean) as CharteDoc[]
  }, [chartes, searchNorm])

  const toggleExpanded = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const host = typeof window !== 'undefined' ? window.location.host : ''

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 36, height: 36, borderRadius: '10px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: 'pointer',
          }}
        >
          <ChevronLeft size={20} style={{ color: 'var(--text-primary)' }} />
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Documents &amp; chartes
        </h1>
      </div>

      {/* Season selector */}
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <select
          value={seasonId ?? ''}
          onChange={e => { setSeasonId(e.target.value); setExpanded({}) }}
          style={{
            width: '100%', padding: '10px 36px 10px 12px', fontSize: '14px', fontWeight: 600,
            borderRadius: '10px', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', color: 'var(--text-primary)',
            appearance: 'none', cursor: 'pointer',
          }}
        >
          {tab === 'documents' && (
            <option value="__all__">Toutes les saisons</option>
          )}
          {seasons.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.active ? ' (active)' : ''}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }}
        />
      </div>

      {/* Archived season banner */}
      {isArchived && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 12px', marginBottom: '14px', borderRadius: '10px',
          background: 'var(--warning-soft, rgba(234,179,8,0.1))',
          border: '1px solid var(--warning, #eab308)',
        }}>
          <AlertTriangle size={16} style={{ color: 'var(--warning, #eab308)', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--warning, #eab308)' }}>
            Saison archivée
          </span>
        </div>
      )}

      {/* Tab chips */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {([['documents', 'Documents'], ['chartes', 'Suivi des chartes']] as const).map(([key, label]) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => { setTab(key); setSearch('') }}
              style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
                background: active ? 'var(--accent-soft, var(--primary-opacity-20))' : 'var(--bg-card)',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ═══ Documents tab ═══ */}
      {tab === 'documents' && (
        <>
          {/* Category filter chips */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {([['all', 'Tous'], ['chartes', 'Chartes'], ['others', 'Autres']] as [CatFilter, string][]).map(([key, label]) => {
              const isActive = catFilter === key
              return (
                <button
                  key={key}
                  onClick={() => setCatFilter(key)}
                  style={{
                    padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                    border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border-color)'}`,
                    background: isActive ? 'var(--primary-opacity-20, rgba(59,130,246,0.1))' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {docsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : filteredDocs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <FileText size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', opacity: 0.5 }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
                Aucun document publié pour cette saison.<br />
                La publication se fait depuis le poste de travail sur ordinateur.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredDocs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => handleOpenDoc(doc.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    width: '100%', textAlign: 'left', padding: '12px',
                    borderRadius: '12px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)', cursor: 'pointer',
                  }}
                >
                  <FileText size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: '13px', fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}>
                      {doc.title}
                    </p>
                    {/* Category chip */}
                    <span style={{
                      display: 'inline-block', marginTop: 4, padding: '2px 8px',
                      borderRadius: 10, fontSize: 10, fontWeight: 600,
                      background: 'var(--primary-opacity-20, rgba(59,130,246,0.1))',
                      color: 'var(--primary)',
                    }}>
                      {categoryLabel(doc.category)}
                    </span>
                    {(doc as any).publish_on_site && (
                      <span style={{
                        display: 'inline-block', marginTop: 4, marginLeft: 4, padding: '2px 8px',
                        borderRadius: 10, fontSize: 10, fontWeight: 600,
                        background: 'var(--info-bg, rgba(59,130,246,0.1))',
                        color: 'var(--info-text)',
                      }}>
                        Sur le site
                      </span>
                    )}
                    {/* Description */}
                    {doc.description && (
                      <p style={{
                        margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)',
                        lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {doc.description}
                      </p>
                    )}
                    {/* Meta line */}
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatDate(doc.created_at)}
                      {' · '}
                      {doc.target_team_ids && doc.target_team_ids.length > 0
                        ? `Équipes ciblées : ${doc.target_team_ids.length}`
                        : 'Tout le club'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ Chartes tab ═══ */}
      {tab === 'chartes' && (
        <>
          {seasonId === '__all__' ? (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                Sélectionnez une saison pour voir le suivi des chartes.
              </p>
            </div>
          ) : (
            <>
              {/* Search */}
              <div style={{ position: 'relative', marginBottom: '14px' }}>
                <Search size={16} style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', pointerEvents: 'none',
                }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher une personne"
                  style={{
                    width: '100%', padding: '9px 34px 9px 32px', fontSize: '13px',
                    borderRadius: '10px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)', color: 'var(--text-primary)',
                  }}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                    }}
                  >
                    <X size={16} style={{ color: 'var(--text-muted)' }} />
                  </button>
                )}
              </div>

              {chartesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                  <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : filteredChartes.length === 0 && !searchNorm ? (
                <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                  <ShieldCheck size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', opacity: 0.5 }} />
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 6px', lineHeight: 1.5 }}>
                    Aucune charte publiée pour cette saison.
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                    Les chartes sont publiées depuis le poste de travail&nbsp;; pensez à les publier à chaque nouvelle saison.
                  </p>
                </div>
              ) : filteredChartes.length === 0 && searchNorm ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
                  Aucun résultat pour «&nbsp;{search.trim()}&nbsp;».
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredChartes.map(charte => {
                    const pct = charte.expected > 0 ? Math.round((charte.validated / charte.expected) * 100) : 0
                    const isCoach = charte.category === 'charte_entraineurs'
                    const hasTeams = !isCoach && charte.teams && charte.teams.length > 0

                    return (
                      <div
                        key={charte.id}
                        style={{
                          borderRadius: '12px', border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)', padding: '14px',
                        }}
                      >
                        {/* Title row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <ShieldCheck size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                            {charte.title}
                          </span>
                        </div>

                        {/* Category chip */}
                        <span style={{
                          display: 'inline-block', marginBottom: 8, padding: '2px 8px',
                          borderRadius: 10, fontSize: 10, fontWeight: 600,
                          background: 'var(--primary-opacity-20, rgba(59,130,246,0.1))',
                          color: 'var(--primary)',
                        }}>
                          {categoryLabel(charte.category)}
                        </span>

                        {/* Progress bar */}
                        <div style={{
                          height: 6, borderRadius: 3,
                          background: 'var(--bg-sidebar)', marginBottom: '6px', overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            width: `${pct}%`,
                            background: pct === 100 ? 'var(--success, #059669)' : 'var(--primary)',
                            transition: 'width 0.3s',
                          }} />
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {charte.validated} / {charte.expected} validées ({pct}&nbsp;%)
                        </p>

                        {/* Coach charte: missing list */}
                        {isCoach && charte.missing && charte.missing.length > 0 && (
                          <div style={{ marginTop: '10px' }}>
                            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                              Manquants :
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                              {[...charte.missing].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(c => c.name).join(', ')}
                            </p>
                          </div>
                        )}
                        {isCoach && (!charte.missing || charte.missing.length === 0) && charte.expected > 0 && (
                          <p style={{ fontSize: '12px', color: 'var(--success, #059669)', margin: '8px 0 0', fontWeight: 600 }}>
                            <Check size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                            Tous ont validé
                          </p>
                        )}

                        {/* Team chartes: accordion */}
                        {hasTeams && (
                          <div style={{ marginTop: '10px' }}>
                            {charte.teams!.map(team => {
                              const teamComplete = team.validated >= team.expected && team.expected > 0
                              const isOpen = expanded[`${charte.id}-${team.team_id}`]
                              const sortedMissing = [...team.missing].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
                              return (
                                <div key={team.team_id} style={{ marginBottom: '4px' }}>
                                  <button
                                    onClick={() => !teamComplete && toggleExpanded(`${charte.id}-${team.team_id}`)}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: '6px',
                                      width: '100%', textAlign: 'left', padding: '6px 0',
                                      background: 'transparent', border: 'none',
                                      cursor: teamComplete ? 'default' : 'pointer',
                                    }}
                                  >
                                    {teamComplete ? (
                                      <Check size={14} style={{ color: 'var(--success, #059669)', flexShrink: 0 }} />
                                    ) : (
                                      <ChevronDown
                                        size={14}
                                        style={{
                                          color: 'var(--text-muted)', flexShrink: 0,
                                          transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                          transition: 'transform 0.15s',
                                        }}
                                      />
                                    )}
                                    <span style={{
                                      fontSize: '13px', fontWeight: 600, flex: 1,
                                      color: teamComplete ? 'var(--success, #059669)' : 'var(--text-primary)',
                                    }}>
                                      {shortTeamName(team.team_name)}
                                    </span>
                                    <span style={{
                                      fontSize: '12px',
                                      color: teamComplete ? 'var(--success, #059669)' : 'var(--text-secondary)',
                                      fontWeight: 500,
                                    }}>
                                      {team.validated}/{team.expected}
                                    </span>
                                  </button>
                                  {isOpen && !teamComplete && (
                                    <div style={{ paddingLeft: '20px', paddingBottom: '6px' }}>
                                      {sortedMissing.length === 0 ? (
                                        <p style={{ fontSize: '12px', color: 'var(--success, #059669)', margin: 0, fontWeight: 600 }}>
                                          Tous ont validé
                                        </p>
                                      ) : (
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                                          Manquants : {sortedMissing.map(m => m.name).join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Desktop CTA */}
      <div style={{
        marginTop: '24px', padding: '14px', borderRadius: '12px',
        border: '1px solid var(--border-color)', background: 'var(--bg-card)',
        display: 'flex', alignItems: 'flex-start', gap: '10px',
      }}>
        <DesktopIcon size={20} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          La publication de documents, l'envoi de chartes et les relances se gèrent depuis un ordinateur : <strong>{host}</strong>
        </p>
      </div>
    </div>
  )
}
