import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface FamilyLinksResult {
  parent_roles?: number
  child_links?: number
  member_roles?: number
  coach_roles?: number
  has_any_role?: boolean
}

export interface ClaimOutcome {
  data: FamilyLinksResult | null
  error: PostgrestError | null
  fresh: boolean
}

const STORAGE_PREFIX = 'claim_family_links_done:'
const doneFor = new Map<string, FamilyLinksResult | null>()
const inflightFor = new Map<string, Promise<ClaimOutcome>>()
let generation = 0

function readStored(userId: string): FamilyLinksResult | null | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + userId)
    return raw === null ? undefined : (JSON.parse(raw) as FamilyLinksResult | null)
  } catch {
    return undefined
  }
}

function remember(userId: string, data: FamilyLinksResult | null, gen: number) {
  if (gen !== generation) return
  doneFor.set(userId, data)
  try { sessionStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(data)) } catch {}
}

export function resetFamilyLinksClaims() {
  generation++
  doneFor.clear()
  inflightFor.clear()
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key)
    }
  } catch {}
}

export function claimFamilyLinksOnce(userId: string): Promise<ClaimOutcome> {
  if (doneFor.has(userId)) {
    return Promise.resolve({ data: doneFor.get(userId) ?? null, error: null, fresh: false })
  }
  const stored = readStored(userId)
  if (stored !== undefined) {
    doneFor.set(userId, stored)
    return Promise.resolve({ data: stored, error: null, fresh: false })
  }
  const existing = inflightFor.get(userId)
  if (existing) return existing

  const gen = generation
  const promise = (async (): Promise<ClaimOutcome> => {
    try {
      const { data, error, status } = await supabase.rpc('claim_family_links')
      if (status === 409) {
        // The per-call insert counts cannot be recovered; only role presence is re-read.
        const { count, error: rolesErr } = await supabase
          .from('profile_roles')
          .select('role', { count: 'exact', head: true })
          .eq('profile_id', userId)
        if (rolesErr) return { data: null, error: rolesErr, fresh: true }
        const result: FamilyLinksResult = { has_any_role: (count ?? 0) > 0 }
        remember(userId, result, gen)
        return { data: result, error: null, fresh: true }
      }
      if (error) return { data: null, error, fresh: true }
      const result = (data ?? null) as FamilyLinksResult | null
      remember(userId, result, gen)
      return { data: result, error: null, fresh: true }
    } finally {
      if (gen === generation) inflightFor.delete(userId)
    }
  })()
  inflightFor.set(userId, promise)
  return promise
}
