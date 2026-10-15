import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startBundleFetch, completeBundleFetch, clearDashboardCache, type DashboardCacheData } from '../lib/dashboardCache'
import { setFinanceModuleEnabledCache } from './useFinanceModuleEnabled'
import { setWebsiteModuleEnabledCache } from './useWebsiteModuleEnabled'
import { seedInvoiceDotCache, type InvoiceDot } from './useInvoiceNotification'
import { calcAge } from '../utils/charteHelpers'
import { reportLoadError } from '../utils/reportLoadError'

export interface DashboardBundle {
  members: Array<{
    id: string
    first_name: string
    last_name: string
    gender: string | null
    birth_date: string | null
    legal_rep1_firstname: string | null
    legal_rep1_lastname: string | null
    legal_rep1_email: string | null
    legal_rep2_firstname: string | null
    legal_rep2_email: string | null
    team_id: string | null
    is_self: boolean
  }>
  member_teams: Array<{ member_id: string; team_id: string }>
  teams: Array<{ id: string; name: string; category_name: string | null }>
  finance_module_enabled: boolean
  website_module_enabled?: boolean
  active_season: { id: string; name: string } | null
  open_invoices: Array<{
    id: string; invoice_number: string; member_id: string
    status: string; due_date: string; total_amount: number; balance: number
  }>
  charter_documents: Array<{
    id: string; title: string; category: string
    season_id: string; target_team_ids: string[] | null; season_name: string
  }>
  charter_acknowledgements: Array<{
    document_id: string; member_id: string | null; user_id: string | null
  }>
  next_matches: Array<{
    id: string; team_id: string; team_name: string; match_date: string
    match_time: string | null; opponent_name: string; is_home: boolean
    status: string; venue_name: string | null; venue_city: string | null
  }>
  match_attendance: Array<{
    id: string; match_id: string; member_id: string
    status: string; absence_reason: string | null
  }>
  convocations: Array<{ id: string; match_id: string; status: string }>
  convocation_players: Array<{
    id: string; convocation_id: string; member_id: string
  }>
  next_sessions: Array<{
    id: string; team_id: string; session_date: string
    cancelled: boolean; cancelled_reason: string | null
    start_time: string | null; end_time: string | null
    terrain_name: string | null
    base_start_time?: string | null; base_end_time?: string | null
    base_terrain_name?: string | null
    rain_applied?: boolean | null; rain_plan_defined?: boolean | null; rain_note?: string | null
  }>
  training_attendance: Array<{
    session_id: string; member_id: string; status: string
    present: boolean | null; responded_at: string | null
    absence_reason: string | null
  }>
  recent_messages: Array<{
    id: string; body: string; created_at: string; sender_id: string
    conversation_id: string; conversation_name: string
    team_name: string | null; sender_name: string; sender_role: string | null
  }>
  news: Array<{
    id: string; title: string; body: string | null
    category: string; image_url: string | null; published_at: string
  }>
  events: Array<{
    id: string; title: string; date: string
    location: string | null; type: string
  }>
  sponsors: Array<{
    id: string; company_name: string; logo_url: string | null
    website_url: string | null; sponsoring_amount: number | null
  }>
  is_volunteer: boolean
  is_event_committee: boolean
  profile: {
    full_name: string | null
    avatar_url: string | null
    email: string | null
    theme: string | null
    shop_url: string | null
  } | null
}

function buildCacheData(b: DashboardBundle, userId: string): DashboardCacheData {
  const financeEnabled = b.finance_module_enabled !== false
  const websiteEnabled = b.website_module_enabled === true

  const openInvoices = b.open_invoices || []
  let invoiceDot: InvoiceDot = null
  if (openInvoices.length > 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let hasOverdue = false
    let hasToPay = false
    for (const inv of openInvoices) {
      const due = inv.due_date ? new Date(inv.due_date) : null
      if (due && due < today) hasOverdue = true
      else hasToPay = true
    }
    invoiceDot = hasOverdue ? 'red' : hasToPay ? 'green' : null
  }

  const members = b.members || []
  const primary = members[0]
  const memberGender = primary?.gender ?? null
  const profileFirstName = b.profile?.full_name?.split(' ')[0] || ''
  const displayName = profileFirstName

  const selfMemberTeamId = primary?.team_id ?? null
  const memberTeamName = selfMemberTeamId
    ? (b.teams || []).find(t => t.id === selfMemberTeamId)?.name ?? null
    : null

  const docs = b.charter_documents || []
  const acks = b.charter_acknowledgements || []
  let hasPendingCharte = false
  if (docs.length > 0) {
    const selfMember = members.find(m => m.is_self)
    const childMembers = members.filter(m => !m.is_self)
    const joueurAdultDoc = docs.find(d => d.category === 'charte_joueurs')
    const joueurMinorDoc = docs.find(d => d.category === 'charte_joueurs_mineurs')
    if (joueurAdultDoc && selfMember) {
      const age = calcAge(selfMember.birth_date)
      if (age !== null && age >= 18) {
        if (!acks.some(a => a.document_id === joueurAdultDoc.id && a.member_id === selfMember.id)) {
          hasPendingCharte = true
        }
      }
    }
    if (joueurMinorDoc && !hasPendingCharte) {
      for (const child of childMembers) {
        const age = calcAge(child.birth_date)
        if (age === null || age < 18) {
          if (!acks.some(a => a.document_id === joueurMinorDoc.id && a.member_id === child.id)) {
            hasPendingCharte = true
            break
          }
        }
      }
    }
  }

  return {
    avatarUrl: b.profile?.avatar_url ?? null,
    displayName,
    memberGender,
    isVolunteer: b.is_volunteer ?? false,
    isEventOrganizer: b.is_event_committee ?? false,
    hasPendingCharte,
    financeEnabled,
    websiteEnabled,
    invoiceDot,
    shopUrl: b.profile?.shop_url ?? null,
    memberTeamName,
    sponsors: b.sponsors || [],
  }
}

export function useDashboardBundle() {
  useState(() => { startBundleFetch() })

  const [bundle, setBundle] = useState<DashboardBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const called = useRef(false)

  const fetchBundle = () => {
    setLoading(true)
    setError(null)

    const today = new Date().toISOString().split('T')[0]
    supabase
      .rpc('get_dashboard_bundle', { p_today: today })
      .then(({ data, error: rpcError }) => {
        if (rpcError) {
          reportLoadError('DashboardBundle', rpcError)
          setError(rpcError.message)
          completeBundleFetch({
            avatarUrl: null, displayName: '', memberGender: null,
            isVolunteer: false, isEventOrganizer: false, hasPendingCharte: false,
            financeEnabled: true, websiteEnabled: false, invoiceDot: null, shopUrl: null, memberTeamName: null, sponsors: [],
          })
        } else {
          const b = data as unknown as DashboardBundle
          const userId = '' // will be overridden by auth context in component
          const cacheData = buildCacheData(b, userId)
          completeBundleFetch(cacheData)
          setFinanceModuleEnabledCache(cacheData.financeEnabled)
          setWebsiteModuleEnabledCache(cacheData.websiteEnabled)
          seedInvoiceDotCache('__bundle__', 'parent', cacheData.invoiceDot)
          seedInvoiceDotCache('__bundle__', 'member', cacheData.invoiceDot)
          setBundle(b)
        }
        setLoading(false)
      })
  }

  useEffect(() => {
    if (called.current) return
    called.current = true
    fetchBundle()

    return () => { clearDashboardCache() }
  }, [])

  const reload = () => {
    called.current = false
    fetchBundle()
  }

  return { bundle, loading, error, reload }
}
