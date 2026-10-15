import type { InvoiceDot } from '../hooks/useInvoiceNotification'

export interface DashboardCacheData {
  avatarUrl: string | null
  displayName: string
  memberGender: string | null
  isVolunteer: boolean
  isEventOrganizer: boolean
  hasPendingCharte: boolean
  financeEnabled: boolean
  websiteEnabled: boolean
  invoiceDot: InvoiceDot
  shopUrl: string | null
  memberTeamName: string | null
  sponsors: {
    id: string
    company_name: string
    logo_url: string | null
    website_url: string | null
    sponsoring_amount: number | null
  }[]
}

let cache: DashboardCacheData | null = null

let bundlePromise: Promise<void> | null = null
let resolveBundle: (() => void) | null = null

export function startBundleFetch(): void {
  if (bundlePromise) return
  bundlePromise = new Promise<void>(r => { resolveBundle = r })
}

export function completeBundleFetch(data: DashboardCacheData): void {
  cache = data
  resolveBundle?.()
  resolveBundle = null
}

export function clearDashboardCache(): void {
  cache = null
  bundlePromise = null
  resolveBundle = null
}

export async function waitForBundleIfPending(): Promise<DashboardCacheData | null> {
  if (bundlePromise) await bundlePromise
  return cache
}

export function getDashboardCache(): DashboardCacheData | null {
  return cache
}
