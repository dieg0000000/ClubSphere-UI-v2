import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, ChevronDown, ChevronRight, BookOpen, Paperclip, Send, X, Wrench, Lightbulb } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/invokeFunction'
import { useAuth } from '../context/AuthContext'
import { Tabs } from '../components/ui/Tabs'
import { StatusPill } from '../components/ui/StatusPill'
import { Badge } from '../components/ui/Badge'
import { canViewHelpArticle } from '../utils/helpAudience'

interface HelpArticle {
  id: string
  section: string
  section_order: number
  title: string
  body: string
  roles: string[]
  display_order: number
  active: boolean
  updated_at: string
}

interface SupportTicket {
  id: string
  ticket_number: number
  created_at: string
  requester_name: string | null
  requester_email: string | null
  title: string
  description: string
  attachments: { path: string; name: string }[] | null
  status: string
  ticket_type?: 'incident' | 'improvement'
  closed_at: string | null
  closure_message: string | null
}

function isAdminOrCommittee(effectiveRole: string | null): boolean {
  if (!effectiveRole) return false
  const allowed = ['admin', 'president', 'vice_president', 'committee', 'responsable_technique', 'responsable_competitions']
  return allowed.includes(effectiveRole)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function MarkdownBody({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactElement[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.match(/^\d+\.\s/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-1 my-2">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    if (line.match(/^[-*]\s/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        items.push(lines[i].replace(/^[-*]\s/, ''))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-2">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} className="h-2" />)
    } else {
      elements.push(<p key={`p-${i}`} className="my-1">{renderInline(line)}</p>)
    }
    i++
  }

  return <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{elements}</div>
}

function renderInline(text: string): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>)
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export function HelpCenter() {
  const { effectiveRole, clubRoles, user } = useAuth()
  const showSupportTab = isAdminOrCommittee(effectiveRole)
  const [activeTab, setActiveTab] = useState<'help' | 'support'>('help')

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen size={28} style={{ color: 'var(--accent)' }} />
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Aide et support
        </h1>
      </div>

      {showSupportTab && (
        <div className="mb-6">
          <Tabs
            items={[
              { key: 'help', label: 'Centre d\'aide' },
              { key: 'support', label: 'Demandes de support' },
            ]}
            value={activeTab}
            onChange={(k) => setActiveTab(k as 'help' | 'support')}
          />
        </div>
      )}

      {activeTab === 'help' ? (
        <HelpArticlesTab clubRoles={clubRoles} />
      ) : (
        <SupportTicketsTab user={user} />
      )}
    </div>
  )
}

function HelpArticlesTab({ clubRoles }: { clubRoles: string[] }) {
  const [articles, setArticles] = useState<HelpArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null)

  useEffect(() => {
    async function fetchArticles() {
      const { data, error } = await supabase
        .from('help_articles')
        .select('*')
        .eq('active', true)
        .order('section_order', { ascending: true })
        .order('display_order', { ascending: true })

      if (error) {
        console.error('Error fetching help articles:', error)
        setLoading(false)
        return
      }
      setArticles(data || [])
      if (data && data.length > 0) {
        const sections = new Set(data.map((a: HelpArticle) => a.section))
        setExpandedSections(sections)
      }
      setLoading(false)
    }
    fetchArticles()
  }, [])

  const filteredArticles = useMemo(() => {
    let filtered = articles.filter(a => canViewHelpArticle(clubRoles, a.roles))
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        a => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [articles, clubRoles, search])

  const groupedBySection = useMemo(() => {
    const map = new Map<string, HelpArticle[]>()
    for (const article of filteredArticles) {
      if (!map.has(article.section)) {
        map.set(article.section, [])
      }
      map.get(article.section)!.push(article)
    }
    return map
  }, [filteredArticles])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const toggleArticle = (id: string) => {
    setExpandedArticle(prev => (prev === id ? null : id))
  }

  return (
    <>
      <div className="relative mb-6">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un article..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm transition-colors"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div
            className="w-8 h-8 border-3 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent)' }}
          />
        </div>
      )}

      {!loading && filteredArticles.length === 0 && (
        <div
          className="text-center py-12 rounded-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <p style={{ color: 'var(--text-secondary)' }}>
            {search ? 'Aucun article trouvé pour cette recherche.' : 'Aucun article disponible.'}
          </p>
        </div>
      )}

      {!loading && filteredArticles.length > 0 && (
        <div className="space-y-3">
          {Array.from(groupedBySection.entries()).map(([section, sectionArticles]) => (
            <div
              key={section}
              className="rounded-lg overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
            >
              <button
                onClick={() => toggleSection(section)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left font-semibold text-sm transition-colors hover:opacity-80"
                style={{ color: 'var(--text-primary)' }}
              >
                {expandedSections.has(section) ? (
                  <ChevronDown size={16} style={{ color: 'var(--accent)' }} />
                ) : (
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                )}
                <span>{section}</span>
                <span
                  className="ml-auto text-xs font-normal px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                >
                  {sectionArticles.length}
                </span>
              </button>

              {expandedSections.has(section) && (
                <div style={{ borderTop: '1px solid var(--border-color)' }}>
                  {sectionArticles.map(article => (
                    <div key={article.id}>
                      <button
                        onClick={() => toggleArticle(article.id)}
                        className="w-full flex items-center gap-2 px-5 py-2.5 text-left text-sm transition-colors hover:opacity-80"
                        style={{
                          color: expandedArticle === article.id ? 'var(--accent)' : 'var(--text-primary)',
                          background: expandedArticle === article.id ? 'var(--accent-soft)' : 'transparent',
                        }}
                      >
                        {expandedArticle === article.id ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                        )}
                        <span>{article.title}</span>
                      </button>

                      {expandedArticle === article.id && (
                        <div
                          className="px-5 pb-4 pt-2 ml-7"
                          style={{ borderTop: '1px solid var(--border-color)' }}
                        >
                          <MarkdownBody text={article.body} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function SupportTicketsTab({ user }: { user: any }) {
  const [ticketType, setTicketType] = useState<'incident' | 'improvement'>('incident')
  const [ticketTitle, setTicketTitle] = useState('')
  const [ticketDesc, setTicketDesc] = useState('')
  const [ticketFiles, setTicketFiles] = useState<File[]>([])
  const [ticketSending, setTicketSending] = useState(false)
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null)
  const [ticketError, setTicketError] = useState<string | null>(null)

  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true)
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('status', { ascending: false })
      .order('ticket_number', { ascending: true })

    if (!error && data) {
      setTickets(data)
    }
    setTicketsLoading(false)
  }, [])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  const filteredTickets = useMemo(() => {
    if (filter === 'all') return tickets
    return tickets.filter(t => filter === 'open' ? t.status === 'open' : t.status === 'closed')
  }, [tickets, filter])

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setTicketFiles(prev => [...prev, ...Array.from(files)].slice(0, 5))
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setTicketFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticketTitle.trim() || !ticketDesc.trim() || !user) return
    setTicketSending(true)
    setTicketError(null)
    setTicketSuccess(null)

    try {
      const attachments: { path: string; name: string }[] = []
      for (const file of ticketFiles) {
        if (file.size > 10 * 1024 * 1024) {
          setTicketError(`Le fichier "${file.name}" dépasse la limite de 10 MB.`)
          setTicketSending(false)
          return
        }
        const path = `${user.id}/${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('support-attachments')
          .upload(path, file)
        if (uploadError) {
          setTicketError(`Erreur upload "${file.name}": ${uploadError.message}`)
          setTicketSending(false)
          return
        }
        attachments.push({ path, name: file.name })
      }

      const { data, error: fnError } = await invokeFunction('submit-support-ticket', {
        body: { title: ticketTitle.trim(), description: ticketDesc.trim(), ticket_type: ticketType, attachments },
      })
      if (fnError) { setTicketError(fnError || 'Erreur lors de l\'envoi.'); setTicketSending(false); return }
      if (data?.error) { setTicketError(data.error); setTicketSending(false); return }

      setTicketSuccess(`Demande envoyée — n° ${data?.ticket_number || '?'}. Vous recevrez une réponse par email.`)
      setTicketType('incident')
      setTicketTitle('')
      setTicketDesc('')
      setTicketFiles([])
      fetchTickets()
    } catch (err: any) {
      setTicketError(err.message || 'Erreur inattendue.')
    } finally {
      setTicketSending(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Ticket creation form */}
      <div className="rounded-lg p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Nouvelle demande
        </h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          Décrivez votre problème ou question. Notre équipe vous répondra par email.
        </p>

        {ticketSuccess && (
          <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ background: 'var(--success-soft)', border: '1px solid var(--success)', color: 'var(--success-text)' }}>
            {ticketSuccess}
          </div>
        )}
        {ticketError && (
          <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', color: 'var(--danger-text)' }}>
            {ticketError}
          </div>
        )}

        <form onSubmit={handleSubmitTicket} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Type de demande</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTicketType('incident')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all`}
                style={{
                  background: ticketType === 'incident' ? 'var(--danger-soft)' : 'var(--bg-input)',
                  border: `1px solid ${ticketType === 'incident' ? 'var(--danger)' : 'var(--border-color)'}`,
                  color: ticketType === 'incident' ? 'var(--danger-text)' : 'var(--text-secondary)',
                  outline: ticketType === 'incident' ? '2px solid var(--danger)' : 'none',
                  outlineOffset: 1,
                }}>
                <Wrench className="w-4 h-4" /> Incident
              </button>
              <button type="button" onClick={() => setTicketType('improvement')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all`}
                style={{
                  background: ticketType === 'improvement' ? 'var(--accent-soft)' : 'var(--bg-input)',
                  border: `1px solid ${ticketType === 'improvement' ? 'var(--accent)' : 'var(--border-color)'}`,
                  color: ticketType === 'improvement' ? 'var(--accent)' : 'var(--text-secondary)',
                  outline: ticketType === 'improvement' ? '2px solid var(--accent)' : 'none',
                  outlineOffset: 1,
                }}>
                <Lightbulb className="w-4 h-4" /> Demande d'amélioration
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Titre *</label>
            <input type="text" value={ticketTitle} onChange={e => setTicketTitle(e.target.value)} required
              placeholder="Résumé de votre demande" className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Description *</label>
            <textarea value={ticketDesc} onChange={e => setTicketDesc(e.target.value)} required rows={5}
              placeholder="Décrivez en détail votre problème ou question..."
              className="w-full px-4 py-2.5 rounded-lg text-sm resize-y"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', minHeight: 100 }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Documents ou photos (max 5 fichiers, 10 MB chacun)
            </label>
            {ticketFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {ticketFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                    <Paperclip size={12} />
                    <span className="max-w-32 truncate">{file.name}</span>
                    <button type="button" onClick={() => removeFile(idx)} className="ml-1 hover:opacity-70"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            {ticketFiles.length < 5 && (
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-opacity hover:opacity-80"
                style={{ border: '1px dashed var(--border-color)', color: 'var(--text-secondary)' }}>
                <Paperclip size={14} />
                Ajouter des documents ou photos
                <input type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFileAdd} className="hidden" />
              </label>
            )}
          </div>
          <button type="submit" disabled={ticketSending || !ticketTitle.trim() || !ticketDesc.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}>
            <Send size={14} />
            {ticketSending ? 'Envoi en cours...' : 'Envoyer'}
          </button>
        </form>
      </div>

      {/* Tickets list */}
      <div className="rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Demandes du club
          </h2>
          <div className="flex gap-1">
            {(['all', 'open', 'closed'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: filter === f ? 'var(--accent-soft)' : 'transparent',
                  color: filter === f ? 'var(--accent-text)' : 'var(--text-muted)',
                  border: filter === f ? '1px solid var(--accent)' : '1px solid transparent',
                }}
              >
                {f === 'all' ? 'Tous' : f === 'open' ? 'Ouverts' : 'Clôturés'}
              </button>
            ))}
          </div>
        </div>

        {ticketsLoading ? (
          <div className="flex justify-center py-8">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent)' }}
            />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
            <p className="text-sm">Aucune demande {filter === 'open' ? 'ouverte' : filter === 'closed' ? 'clôturée' : ''} trouvée.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-table-header)' }}>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-table-header)' }}>N°</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-table-header)' }}>Date</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-table-header)' }}>Demandeur</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-table-header)' }}>Titre</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-table-header)' }}>Type</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-table-header)' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map(ticket => (
                  <React.Fragment key={ticket.id}>
                    <tr
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                      onClick={() => setExpandedId(prev => prev === ticket.id ? null : ticket.id)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '' }}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                        {ticket.ticket_number}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {formatDate(ticket.created_at)}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                        {ticket.requester_name || ticket.requester_email || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {ticket.title}
                      </td>
                      <td className="px-4 py-2.5">
                        {ticket.ticket_type === 'improvement'
                          ? <Badge variant="blue">Amélioration</Badge>
                          : <Badge variant="red">Incident</Badge>
                        }
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill variant={ticket.status === 'open' ? 'orange' : 'green'}>
                          {ticket.status === 'open' ? 'Ouvert' : 'Clôturé'}
                        </StatusPill>
                      </td>
                    </tr>

                    {expandedId === ticket.id && (
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td colSpan={6} className="px-6 py-4" style={{ background: 'var(--bg-hover)' }}>
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Description</p>
                              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                                {ticket.description}
                              </p>
                            </div>

                            {ticket.attachments && ticket.attachments.length > 0 && (
                              <div>
                                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Pièces jointes</p>
                                <div className="flex flex-wrap gap-2">
                                  {ticket.attachments.map((att, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
                                      <Paperclip size={10} />
                                      {att.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {ticket.status === 'closed' && ticket.closure_message && (
                              <div className="rounded-lg p-4 mt-2" style={{ background: 'var(--success-soft)', border: '1px solid var(--success)' }}>
                                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--success-text)' }}>
                                  Réponse du support {ticket.closed_at ? `— ${formatDate(ticket.closed_at)}` : ''}
                                </p>
                                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--success-text)' }}>
                                  {ticket.closure_message}
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
