import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { supabase } from '../lib/supabase'
import { releaseNativePushDevice } from '../lib/nativePush'
import { UserRole } from '../types'
import { TermsGate } from './TermsGate'

const ENFORCE_CLUB_ACCESS = true

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRoles?: UserRole[]
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
    </div>
  )
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const {
    user,
    loading,
    clubRoles,
    effectiveRole,
    rolesLoading,
    isPlatformAdmin,
    platformAdminLoading,
  } = useAuth()
  const { clubId, loading: tenantLoading } = useTenant()
  const location = useLocation()
  const [signingOut, setSigningOut] = useState(false)
  const [forceLoginRedirect, setForceLoginRedirect] = useState(false)

  const accessReady =
    !!user &&
    !loading &&
    !tenantLoading &&
    !!clubId &&
    !rolesLoading &&
    !platformAdminLoading

  const rolesWithOnboarding: string[] = ['member', 'parent']
  const needsOnboarding =
    accessReady &&
    !isPlatformAdmin &&
    user!.onboarding_completed !== true &&
    rolesWithOnboarding.includes(user!.role)

  const hasClubAccess =
    accessReady && (isPlatformAdmin === true || clubRoles.length > 0 || needsOnboarding)

  const denied = accessReady && !hasClubAccess

  useEffect(() => {
    if (!denied) return
    if (ENFORCE_CLUB_ACCESS) {
      if (signingOut) return
      setSigningOut(true)
      ;(async () => {
        try {
          await releaseNativePushDevice()
          await supabase.auth.signOut()
        } catch (err) {
          console.warn('[ProtectedRoute] signOut error', err)
        } finally {
          setForceLoginRedirect(true)
        }
      })()
    } else {
      console.warn('[ProtectedRoute][OBSERVE] would block access — no role in club', {
        userEmail: user?.email,
        clubId,
        clubRoles,
        effectiveRole,
      })
    }
  }, [denied, signingOut, user?.email, clubId, clubRoles, effectiveRole])

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (ENFORCE_CLUB_ACCESS && forceLoginRedirect) {
    return <Navigate to="/login?error=no_club_access" replace />
  }

  if (ENFORCE_CLUB_ACCESS && !accessReady) {
    return <LoadingScreen />
  }

  if (ENFORCE_CLUB_ACCESS && denied) {
    return <LoadingScreen />
  }

  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  const nameIsPlaceholder =
    accessReady &&
    !isPlatformAdmin &&
    clubRoles.length > 0 &&
    (!user!.full_name || user!.full_name.trim() === '' || user!.full_name === user!.email)

  if (nameIsPlaceholder && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding?step=name" replace />
  }

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <TermsGate>{children}</TermsGate>
}
