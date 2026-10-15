import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { ClubTheme, defaultClubTheme } from '../config/theme'
import { useTenant } from './TenantContext'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextType {
  mode: ThemeMode
  resolvedMode: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  theme: ClubTheme
  updateTheme: (newTheme: Partial<ClubTheme>) => void
  isLoading: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const STORAGE_KEY = 'clubsphere-theme'

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  return getSystemPreference()
}

function applyClass(resolved: 'light' | 'dark') {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

function hexToRgb(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return null
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
}

function applyAccentColors(primaryColor: string | null, primaryDark: string | null) {
  const root = document.documentElement
  if (primaryColor) {
    root.style.setProperty('--accent', primaryColor)
    root.style.setProperty('--accent-hover', primaryDark || primaryColor)
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${primaryColor} 10%, transparent)`)
    root.style.setProperty('--grad', `linear-gradient(135deg, ${primaryColor}, ${primaryDark || primaryColor})`)
    const rgb = hexToRgb(primaryColor)
    if (rgb) root.style.setProperty('--primary-rgb', rgb)
  } else {
    root.style.removeProperty('--accent')
    root.style.removeProperty('--accent-hover')
    root.style.removeProperty('--accent-soft')
    root.style.removeProperty('--grad')
    root.style.removeProperty('--primary-rgb')
  }
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

const BRANDING_CACHE_KEY = 'clubsphere-branding'

function getCachedBranding(slug: string): { primary_color: string; primary_dark: string; logo_url: string; club_name: string } | null {
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.slug === slug && parsed.primary_color) return parsed
  } catch {}
  return null
}

function setCachedBranding(slug: string, data: { primary_color: string | null; primary_dark: string | null; logo_url: string | null; club_name: string | null }) {
  try {
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ slug, ...data }))
  } catch {}
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { clubId, clubSlug, loading: tenantLoading } = useTenant()
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system'
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    if (stored && ['light', 'dark', 'system'].includes(stored)) return stored
    return 'system'
  })
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>(() => resolveMode(mode))
  const [theme, setTheme] = useState<ClubTheme>(defaultClubTheme)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const resolved = resolveMode(mode)
    setResolvedMode(resolved)
    applyClass(resolved)
  }, [mode])

  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const resolved = resolveMode('system')
      setResolvedMode(resolved)
      applyClass(resolved)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  useEffect(() => {
    if (tenantLoading) return
    loadInitialData()
  }, [tenantLoading, clubId])

  useEffect(() => {
    if (tenantLoading || !clubId) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        loadInitialData()
      }
    })
    return () => subscription.unsubscribe()
  }, [tenantLoading, clubId])

  async function applyPreAuthBranding() {
    if (!clubSlug) {
      applyAccentColors(null, null)
      return
    }
    const cached = getCachedBranding(clubSlug)
    if (cached) {
      applyAccentColors(cached.primary_color, cached.primary_dark)
      setTheme(prev => ({
        ...prev,
        name: cached.club_name || prev.name,
        primaryColor: cached.primary_color || prev.primaryColor,
        primaryDark: cached.primary_dark || prev.primaryDark,
        logoUrl: cached.logo_url || prev.logoUrl,
      }))
      if (cached.club_name) document.title = cached.club_name
    }
    try {
      const { data } = await supabase.rpc('get_public_club_branding', { p_slug: clubSlug })
      if (data) {
        const row = Array.isArray(data) ? data[0] : data
        if (row?.primary_color) {
          applyAccentColors(row.primary_color, row.primary_dark || null)
          setTheme(prev => ({
            ...prev,
            name: row.club_name || prev.name,
            primaryColor: row.primary_color || prev.primaryColor,
            primaryDark: row.primary_dark || prev.primaryDark,
            logoUrl: row.logo_url || prev.logoUrl,
          }))
          if (row.club_name) document.title = row.club_name
          setCachedBranding(clubSlug, {
            primary_color: row.primary_color,
            primary_dark: row.primary_dark || null,
            logo_url: row.logo_url || null,
            club_name: row.club_name || null,
          })
        }
      }
    } catch {
      // RPC not available or failed — cache already applied if present
    }
  }

  async function loadInitialData() {
    try {
      const query = supabase
        .from('club_settings')
        .select('name, primary_color, primary_dark, accent_color, logo_url')
      if (clubId) query.eq('club_id', clubId)
      const { data: clubData } = await query.maybeSingle()

      if (clubData) {
        const clubName = clubData.name || ''
        const pc = clubData.primary_color || null
        const pd = clubData.primary_dark || null
        setTheme({
          name: clubName,
          primaryColor: pc || defaultClubTheme.primaryColor,
          primaryDark: pd || defaultClubTheme.primaryDark,
          accentColor: clubData.accent_color || defaultClubTheme.accentColor,
          logoUrl: clubData.logo_url || ''
        })
        applyAccentColors(pc, pd)
        if (clubName) {
          document.title = clubName
          const metaAppTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]')
          if (metaAppTitle) metaAppTitle.setAttribute('content', clubName)
        }
        if (clubSlug) setCachedBranding(clubSlug, { primary_color: pc, primary_dark: pd, logo_url: clubData.logo_url || null, club_name: clubName })
      } else {
        await applyPreAuthBranding()
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('theme')
          .eq('id', session.user.id)
          .maybeSingle()

        if (profile?.theme && ['light', 'dark', 'system'].includes(profile.theme)) {
          const dbMode = profile.theme as ThemeMode
          const localMode = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
          if (!localMode) {
            setModeState(dbMode)
            localStorage.setItem(STORAGE_KEY, dbMode)
            const resolved = resolveMode(dbMode)
            setResolvedMode(resolved)
            applyClass(resolved)
          }
        }
      }
    } catch (error) {
      console.error('Error loading theme data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    localStorage.setItem(STORAGE_KEY, newMode)

    const resolved = resolveMode(newMode)
    setResolvedMode(resolved)
    applyClass(resolved)

    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          await supabase
            .from('profiles')
            .update({ theme: newMode })
            .eq('id', session.user.id)
        }
      } catch (_) {}
    })()
  }, [])

  function updateTheme(newTheme: Partial<ClubTheme>) {
    setTheme(prev => {
      const next = { ...prev, ...newTheme }
      applyAccentColors(next.primaryColor, next.primaryDark)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ mode, resolvedMode, setMode, theme, updateTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  )
}
