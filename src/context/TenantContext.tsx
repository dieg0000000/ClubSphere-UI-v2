import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'

interface TenantContextType {
  clubId: string | null
  clubSlug: string | null
  clubName: string | null
  loading: boolean
  error: string | null
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

const ROOT_DOMAIN = import.meta.env.VITE_APP_ROOT_DOMAIN || 'clubsphere.cloud'
const RESERVED_SUBDOMAINS = ['console', 'www']

function extractSlugFromHostname(hostname: string): string | null {
  const testSuffix = `.test.${ROOT_DOMAIN}`
  const prodSuffix = `.${ROOT_DOMAIN}`

  let prefix: string | undefined
  if (hostname.endsWith(testSuffix)) {
    prefix = hostname.slice(0, -testSuffix.length)
  } else if (hostname.endsWith(prodSuffix)) {
    prefix = hostname.slice(0, -prodSuffix.length)
  }

  if (prefix && !RESERVED_SUBDOMAINS.includes(prefix)) return prefix
  return null
}

function isProductionHost(hostname: string): boolean {
  return hostname === ROOT_DOMAIN
    || hostname.endsWith(`.${ROOT_DOMAIN}`)
}

export function isConsoleMode(): boolean {
  const hostname = window.location.hostname
  const testSuffix = `.test.${ROOT_DOMAIN}`
  const prodSuffix = `.${ROOT_DOMAIN}`

  if (hostname.endsWith(testSuffix)) {
    const prefix = hostname.slice(0, -testSuffix.length)
    if (prefix === 'console') return true
  } else if (hostname.endsWith(prodSuffix)) {
    const prefix = hostname.slice(0, -prodSuffix.length)
    if (prefix === 'console') return true
  }

  const params = new URLSearchParams(window.location.search)
  if (params.get('console') === '1') return true
  if ((import.meta.env.VITE_CONSOLE_MODE as string | undefined) === '1') return true
  return false
}

function resolveSlug(): { slug: string | null; isProduction: boolean } {
  const hostname = window.location.hostname
  const production = isProductionHost(hostname)
  const subdomainSlug = extractSlugFromHostname(hostname)
  if (subdomainSlug) return { slug: subdomainSlug, isProduction: production }

  if (production) return { slug: null, isProduction: true }

  const fallback = import.meta.env.VITE_DEFAULT_CLUB as string | undefined
  return { slug: fallback || null, isProduction: false }
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider')
  }
  return context
}

function RedirectToWebsite() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.replace('https://clubsphere.ch')
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f9fafb',
        padding: '1rem',
      }}
    >
      <p style={{ color: '#374151', fontSize: '1rem', textAlign: 'center' }}>
        Ce club n'est pas sur ClubSphere. Redirection vers clubsphere.ch…
      </p>
    </div>
  )
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [clubId, setClubId] = useState<string | null>(null)
  const [clubSlug, setClubSlug] = useState<string | null>(null)
  const [clubName, setClubName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [redirectToWebsite, setRedirectToWebsite] = useState(false)

  useEffect(() => {
    async function resolve() {
      const { slug, isProduction } = resolveSlug()

      if (!slug) {
        if (isProduction) {
          setRedirectToWebsite(true)
        } else {
          setError('No club slug could be determined from the URL or environment.')
        }
        setLoading(false)
        return
      }

      const { data, error: queryError } = await supabase
        .from('clubs')
        .select('id, slug, name')
        .eq('slug', slug)
        .eq('active', true)
        .maybeSingle()

      if (queryError) {
        setError(`Failed to resolve club: ${queryError.message}`)
        setLoading(false)
        return
      }

      if (!data) {
        if (isProduction) {
          setRedirectToWebsite(true)
        } else {
          setError(`No active club found for slug "${slug}".`)
        }
        setLoading(false)
        return
      }

      setClubId(data.id)
      setClubSlug(data.slug)
      setClubName(data.name)
      setLoading(false)
    }

    resolve()
  }, [])

  if (redirectToWebsite) {
    return <RedirectToWebsite />
  }

  return (
    <TenantContext.Provider value={{ clubId, clubSlug, clubName, loading, error }}>
      {children}
    </TenantContext.Provider>
  )
}
