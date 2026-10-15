import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Sentry } from '../lib/sentry'
import { Profile } from '../types'
import { useTenant } from './TenantContext'
import { ensurePushSubscription, removePushSubscription } from '../lib/pushSubscription'
import { isNativeApp } from '../lib/nativeApp'
import { registerNativePushDevice, releaseNativePushDevice } from '../lib/nativePush'
import { setSessionExpiredHandler } from '../lib/invokeFunction'
import { claimFamilyLinksOnce, resetFamilyLinksClaims } from '../lib/familyLinks'

const ROLE_PRIORITY = [
  'admin',
  'president',
  'vice_president',
  'committee',
  'responsable_technique',
  'responsable_competitions',
  'coach',
  'assistant_coach',
  'parent',
  'member',
  'supporter',
]

function pickEffectiveRole(roles: string[]): string | null {
  if (!roles.length) return null
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r
  }
  return roles[0]
}

interface AuthContextType {
  user: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  isAuthenticated: boolean
  updateProfile: () => Promise<void>
  clubRoles: string[]
  effectiveRole: string | null
  hasRole: (role: string) => boolean
  rolesLoading: boolean
  isPlatformAdmin: boolean
  platformAdminLoading: boolean
  hasCommitteeAccess: boolean
  canRegisterPush: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [clubRoles, setClubRoles] = useState<string[]>([])
  const [hasCommitteeAccess, setHasCommitteeAccess] = useState(false)
  const [rolesResolvedFor, setRolesResolvedFor] = useState<string | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [platformAdminResolvedFor, setPlatformAdminResolvedFor] = useState<string | null>(null)
  const [rolesRefreshTrigger, setRolesRefreshTrigger] = useState(0)

  const { clubId } = useTenant()
  const expiredRedirectFired = useRef(false)

  const forceSessionExpired = useCallback(() => {
    if (expiredRedirectFired.current) return
    expiredRedirectFired.current = true
    try { localStorage.removeItem('navView') } catch {}
    setUser(null)
    setClubRoles([])
    setRolesResolvedFor(null)
    setIsPlatformAdmin(false)
    setPlatformAdminResolvedFor(null)
    Sentry.setUser(null)
    resetFamilyLinksClaims()
    supabase.auth.signOut().catch(() => {})
    const returnTo = window.location.pathname + window.location.search
    const params = new URLSearchParams({ session_expired: '1' })
    if (returnTo && returnTo !== '/' && returnTo !== '/login') {
      params.set('redirect', returnTo)
    }
    window.location.replace('/login?' + params.toString())
  }, [])

  useEffect(() => {
    setSessionExpiredHandler(forceSessionExpired)
    return () => setSessionExpiredHandler(null)
  }, [forceSessionExpired])

  const rolesKey = user?.id && clubId ? `${user.id}::${clubId}` : null
  const rolesLoading = rolesKey !== null && rolesResolvedFor !== rolesKey
  // The push claim RPCs reject clubs where the caller has no profile_roles row.
  const canRegisterPush = rolesKey !== null && rolesResolvedFor === rolesKey && clubRoles.length > 0
  const platformAdminLoading =
    user?.id != null && platformAdminResolvedFor !== user.id

  useEffect(() => {
    let mounted = true

    // Server-side session check on startup
    ;(async () => {
      const { data: { user: authUser }, error: userErr } = await supabase.auth.getUser()
      if (!mounted) return
      if (userErr || !authUser) {
        const { data: { session: localSession } } = await supabase.auth.getSession()
        if (localSession) {
          forceSessionExpired()
          return
        }
        setUser(null)
        setLoading(false)
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()
      if (!mounted) return
      if (profile) {
        if (!profile.first_name && profile.full_name && profile.full_name !== profile.email) {
          const parts = profile.full_name.trim().split(/\s+/)
          const first = parts[0] || ''
          const last = parts.slice(1).join(' ') || ''
          if (first) {
            await supabase.from('profiles').update({ first_name: first, last_name: last }).eq('id', profile.id)
            profile.first_name = first
            profile.last_name = last
          }
        }
        setUser(profile)
      }
      setLoading(false)
    })()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        try { localStorage.removeItem('navView') } catch {}
        setUser(null)
        setClubRoles([])
        setHasCommitteeAccess(false)
        setRolesResolvedFor(null)
        setIsPlatformAdmin(false)
        setPlatformAdminResolvedFor(null)
        Sentry.setUser(null)
        resetFamilyLinksClaims()
        return
      }

      if (event === 'TOKEN_REFRESHED' && !session) {
        forceSessionExpired()
        return
      }

      if (session?.user) {
        ;(async () => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()

          if (profile) {
            if (!profile.first_name && profile.full_name && profile.full_name !== profile.email) {
              const parts = profile.full_name.trim().split(/\s+/)
              const first = parts[0] || ''
              const last = parts.slice(1).join(' ') || ''
              if (first) {
                await supabase.from('profiles').update({ first_name: first, last_name: last }).eq('id', profile.id)
                profile.first_name = first
                profile.last_name = last
              }
            }
            setUser(profile)
          }
          setLoading(false)
        })()
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [forceSessionExpired])

  useEffect(() => {
    if (!canRegisterPush) return
    if (isNativeApp()) void registerNativePushDevice(clubId)
    else ensurePushSubscription(clubId)
  }, [canRegisterPush, clubId])

  useEffect(() => {
    let cancelled = false
    if (!user?.id || !clubId) {
      setClubRoles([])
      setHasCommitteeAccess(false)
      setRolesResolvedFor(null)
      return
    }
    const key = `${user.id}::${clubId}`

    async function fetchRoles(): Promise<string[]> {
      const { data, error } = await supabase
        .from('profile_roles')
        .select('role')
        .eq('profile_id', user!.id)
        .eq('club_id', clubId!)
      if (error) {
        console.warn('[AuthContext] profile_roles fetch error', error.message)
        return []
      }
      return (data || []).map((r: { role: string }) => r.role).filter(Boolean)
    }

    ;(async () => {
      let roles = await fetchRoles()
      if (cancelled) return

      const onboardingIncomplete = user!.onboarding_completed !== true
      const blockingClaim = roles.length === 0 || onboardingIncomplete
      if (blockingClaim) {
        const { error: claimErr, fresh } = await claimFamilyLinksOnce(user!.id)
        if (cancelled) return
        if (claimErr) {
          console.warn('[AuthContext] claim_family_links error', claimErr.message)
        } else if (fresh) {
          roles = await fetchRoles()
          if (cancelled) return
          const { data: freshProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user!.id)
            .maybeSingle()
          if (cancelled) return
          if (freshProfile) {
            if (!freshProfile.first_name && freshProfile.full_name && freshProfile.full_name !== freshProfile.email) {
              const parts = freshProfile.full_name.trim().split(/\s+/)
              const first = parts[0] || ''
              const last = parts.slice(1).join(' ') || ''
              if (first) {
                await supabase.from('profiles').update({ first_name: first, last_name: last }).eq('id', freshProfile.id)
                freshProfile.first_name = first
                freshProfile.last_name = last
              }
            }
            setUser(freshProfile)
          }
        }
      }

      const { count: caCount } = await supabase
        .from('committee_access')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', user!.id)
        .eq('club_id', clubId!)
      if (cancelled) return

      setClubRoles(roles)
      setHasCommitteeAccess((caCount ?? 0) > 0)
      console.log('[AuthContext] roles resolved', {
        clubId,
        clubRoles: roles,
        effectiveRole: pickEffectiveRole(roles),
        hasCommitteeAccess: (caCount ?? 0) > 0,
      })
      setRolesResolvedFor(key)
      Sentry.setUser({ id: user!.id })
      Sentry.setTag('club_id', clubId!)
      const eRole = pickEffectiveRole(roles)
      if (eRole) Sentry.setTag('role', eRole)

      if (!blockingClaim) {
        const resolvedRoles = roles
        void (async () => {
          const { error: claimErr, fresh: ranNow } = await claimFamilyLinksOnce(user!.id)
          if (claimErr) {
            console.warn('[AuthContext] background claim_family_links error', claimErr.message)
            return
          }
          if (!ranNow || cancelled) return
          const fresh = await fetchRoles()
          if (cancelled) return
          const changed =
            fresh.length !== resolvedRoles.length ||
            fresh.some(r => !resolvedRoles.includes(r))
          if (changed) setRolesRefreshTrigger(t => t + 1)
        })()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, clubId, rolesRefreshTrigger])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error
  }

  const signOut = async () => {
    await releaseNativePushDevice()
    await removePushSubscription()
    try { localStorage.removeItem('navView') } catch {}
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
    Sentry.setUser(null)
  }

  const updateProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profile) {
        if (!profile.first_name && profile.full_name && profile.full_name !== profile.email) {
          const parts = profile.full_name.trim().split(/\s+/)
          const first = parts[0] || ''
          const last = parts.slice(1).join(' ') || ''
          if (first) {
            await supabase.from('profiles').update({ first_name: first, last_name: last }).eq('id', profile.id)
            profile.first_name = first
            profile.last_name = last
          }
        }
        setUser(profile)
      }
    }
    setRolesRefreshTrigger(v => v + 1)
  }

  useEffect(() => {
    let cancelled = false
    if (!user?.id) {
      setIsPlatformAdmin(false)
      setPlatformAdminResolvedFor(null)
      return
    }
    const uid = user.id
    console.log('[AuthContext] platform admin loading', { email: user?.email })
    ;(async () => {
      const { data, error } = await supabase.rpc('is_platform_admin')
      if (cancelled) return
      const result = !error && data === true
      setIsPlatformAdmin(result)
      setPlatformAdminResolvedFor(uid)
      if (error) {
        console.warn('[AuthContext] is_platform_admin error', error.message)
      }
      console.log('[AuthContext] platform admin', { email: user?.email, isPlatformAdmin: result })
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const effectiveRole = pickEffectiveRole(clubRoles)
  const hasRole = useCallback((role: string) => clubRoles.includes(role), [clubRoles])

  return (
    <AuthContext.Provider value={{
      user, loading, signIn, signOut, isAuthenticated: !!user, updateProfile,
      clubRoles, effectiveRole, hasRole, rolesLoading,
      isPlatformAdmin, platformAdminLoading, hasCommitteeAccess, canRegisterPush,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
