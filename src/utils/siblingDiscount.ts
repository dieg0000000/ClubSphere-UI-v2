import { supabase } from '../lib/supabase'

export interface SiblingDiscountResult {
  pct: number
  amount: number
  siblingCount: number
}

interface FinanceConfigInput {
  fratrie_discount_2?: number
  fratrie_discount_3?: number
  fratrie_discount_4?: number
  fratrie_max_age?: number
}

interface FeeConfigInput {
  category_id: string
  amount: number
}

export async function computeSiblingDiscounts(
  seasonId: string,
  batchMemberIds: Set<string>,
  financeConfig: FinanceConfigInput,
  feeConfigs: FeeConfigInput[]
): Promise<Record<string, SiblingDiscountResult>> {
  const { data: allMembersRaw } = await supabase
    .from('members')
    .select(`
      id, first_name, last_name, birth_date,
      address, legal_rep1_email, legal_rep2_email,
      profile_id,
      team_id,
      team:teams!team_id(
        id, name, category_id,
        category:team_categories(id, name, type)
      )
    `)
    .eq('licence_status', 'actif')
    .is('groupement_id', null)
    .or('status.is.null,status.neq.groupement')

  const allMembers = allMembersRaw?.map(m => ({
    ...m,
    team: Array.isArray(m.team) ? m.team[0] : m.team
  })) || []

  const { data: existingInvoices } = await supabase
    .from('invoices')
    .select('member_id, fratrie_discount_pct, fratrie_discount_amount')
    .eq('season_id', seasonId)
    .neq('status', 'cancelled')

  const invoicedMemberIds = new Set(
    existingInvoices?.map(i => i.member_id) || []
  )

  const invoiceByMemberId: Record<string, { fratrie_discount_amount: number }> = {}
  existingInvoices?.forEach(inv => {
    invoiceByMemberId[inv.member_id] = {
      fratrie_discount_amount: inv.fratrie_discount_amount || 0
    }
  })

  const getFee = (member: any) => {
    const catId = member.team?.category_id
    return feeConfigs.find(f => f.category_id === catId)?.amount || 0
  }

  const maxAge = financeConfig.fratrie_max_age || 18

  const isEligible = (member: any) => {
    if (!(member.legal_rep1_email || member.legal_rep2_email)) return false
    if (member.team?.category?.type !== 'junior') return false
    if (member.birth_date) {
      const age = new Date().getFullYear() - new Date(member.birth_date).getFullYear()
      if (age > maxAge) return false
    }
    return true
  }

  // Build union-find to group siblings by shared legal-rep emails (cross rep1/rep2)
  const parent: Record<string, string> = {}
  const find = (x: string): string => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }
  const union = (a: string, b: string) => { parent[find(a)] = find(b) }

  const emailToMembers: Record<string, string[]> = {}
  allMembers.forEach(m => {
    parent[m.id] = m.id
    const emails = [
      m.legal_rep1_email?.trim().toLowerCase(),
      m.legal_rep2_email?.trim().toLowerCase()
    ].filter(Boolean) as string[]
    for (const email of emails) {
      if (!emailToMembers[email]) emailToMembers[email] = []
      emailToMembers[email].push(m.id)
    }
  })
  for (const ids of Object.values(emailToMembers)) {
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])
  }

  // Also group by parent_members (shared parent account)
  const { data: pmLinks } = await supabase
    .from('parent_members')
    .select('parent_user_id, member_id')
  const parentToChildren: Record<string, string[]> = {}
  for (const link of (pmLinks || [])) {
    if (!parentToChildren[link.parent_user_id]) parentToChildren[link.parent_user_id] = []
    parentToChildren[link.parent_user_id].push(link.member_id)
  }
  const memberIdSet = new Set(allMembers.map(m => m.id))
  for (const children of Object.values(parentToChildren)) {
    const relevant = children.filter(id => memberIdSet.has(id) && parent[id])
    for (let i = 1; i < relevant.length; i++) union(relevant[0], relevant[i])
  }

  const siblingGroups: Record<string, any[]> = {}
  allMembers.forEach(m => {
    if (!parent[m.id]) return
    const root = find(m.id)
    if (!siblingGroups[root]) siblingGroups[root] = []
    siblingGroups[root].push(m)
  })

  const discountMap: Record<string, SiblingDiscountResult> = {}

  for (const group of Object.values(siblingGroups)) {
    const eligible = group.filter(m => isEligible(m))
    if (eligible.length < 2) {
      eligible.forEach(m => { discountMap[m.id] = { pct: 0, amount: 0, siblingCount: eligible.length } })
      continue
    }

    const count = eligible.length
    const discountPct =
      count === 2 ? (financeConfig.fratrie_discount_2 || 20) :
      count === 3 ? (financeConfig.fratrie_discount_3 || 30) :
      (financeConfig.fratrie_discount_4 || 40)

    const sorted = [...eligible].sort((a, b) => {
      const feeDiff = getFee(a) - getFee(b)
      if (feeDiff !== 0) return feeDiff
      return (b.birth_date || '').localeCompare(a.birth_date || '')
    })

    const alreadyDiscounted = eligible.some(m => {
      const inv = invoiceByMemberId[m.id]
      return inv && inv.fratrie_discount_amount > 0
    })

    if (alreadyDiscounted) {
      eligible.forEach(m => { discountMap[m.id] = { pct: 0, amount: 0, siblingCount: count } })
      continue
    }

    const beneficiaryFee = getFee(sorted[0])
    const discountAmount = Math.round(beneficiaryFee * discountPct / 100 * 100) / 100

    let assigned = false
    for (const m of sorted) {
      if (!invoicedMemberIds.has(m.id) && batchMemberIds.has(m.id)) {
        discountMap[m.id] = { pct: discountPct, amount: discountAmount, siblingCount: count }
        assigned = true
        break
      }
    }

    eligible.forEach(m => {
      if (!discountMap[m.id]) {
        discountMap[m.id] = { pct: 0, amount: 0, siblingCount: count }
      }
    })
  }

  return discountMap
}
