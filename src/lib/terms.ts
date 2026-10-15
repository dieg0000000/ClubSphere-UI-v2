import { supabase } from './supabase'

export type TermsSource =
  | 'login'
  | 'signup'
  | 'invite'
  | 'coach_activation'
  | 'committee_activation'
  | 'settings'

export interface TermsStatus {
  version: string
  title: string | null
  url: string | null
  published_at: string | null
  accepted: boolean
  accepted_at: string | null
}

// terms_status() needs a session; forms shown before sign-in link to the published text.
export const PUBLIC_TERMS_URL = 'https://clubsphere.ch/cgu-v1.1.html'
export const SIGNUP_TERMS_VERSION = '1.1'

const statusByUser = new Map<string, Promise<TermsStatus>>()

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null
}

async function fetchTermsStatus(): Promise<TermsStatus> {
  const { data, error } = await supabase.rpc('terms_status')
  if (error) throw error
  const row = firstRow(data)
  if (!row) {
    return { version: '', title: null, url: null, published_at: null, accepted: true, accepted_at: null }
  }
  if (typeof row.version !== 'string') throw new Error('terms_status: invalid response')
  return {
    version: row.version,
    title: (row.title as string) ?? null,
    url: (row.url as string) ?? null,
    published_at: (row.published_at as string) ?? null,
    accepted: row.accepted === true,
    accepted_at: (row.accepted_at as string) ?? null,
  }
}

export function getTermsStatus(userId: string): Promise<TermsStatus> {
  const cached = statusByUser.get(userId)
  if (cached) return cached
  const promise = fetchTermsStatus()
  statusByUser.set(userId, promise)
  promise.catch(() => {
    if (statusByUser.get(userId) === promise) statusByUser.delete(userId)
  })
  return promise
}

export function clearTermsCache(): void {
  statusByUser.clear()
}

export async function acceptTerms(userId: string, status: TermsStatus, source: TermsSource): Promise<TermsStatus> {
  const { data, error } = await supabase.rpc('accept_terms', {
    p_version: status.version,
    p_source: source,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
  const row = firstRow(data)
  if (!row || row.accepted !== true) throw new Error('accept_terms: not accepted')
  const next: TermsStatus = {
    ...status,
    version: typeof row.version === 'string' ? row.version : status.version,
    accepted: true,
    accepted_at: (row.accepted_at as string) ?? new Date().toISOString(),
  }
  statusByUser.set(userId, Promise.resolve(next))
  return next
}

export function signupTermsMetadata(): { terms_accepted_version: string; terms_accepted_at: string } {
  return { terms_accepted_version: SIGNUP_TERMS_VERSION, terms_accepted_at: new Date().toISOString() }
}

// Records the box ticked at sign-up, from the signed-in account's own metadata only.
export async function applySignupMetadataAcceptance(userId: string, status: TermsStatus): Promise<TermsStatus> {
  if (status.accepted) return status
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user || session.user.id !== userId) return status
    if (session.user.user_metadata?.terms_accepted_version !== status.version) return status
    return await acceptTerms(userId, status, 'signup')
  } catch {
    return status
  }
}

export async function recordSignupAcceptance(source: TermsSource): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const status = await getTermsStatus(session.user.id)
    if (!status.accepted) await acceptTerms(session.user.id, status, source)
  } catch {
    // Non-blocking: the sign-in terms page will ask again.
  }
}
