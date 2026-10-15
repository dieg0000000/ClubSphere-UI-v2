import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'

const ADMIN_ROLES = ['admin', 'president', 'vice_president']

export function useModuleAccess(moduleKey: string) {
  const { user, effectiveRole, loading: authLoading } = useAuth()
  const { clubId } = useTenant()
  const [access, setAccess] = useState({ canView: false, canEdit: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setAccess({ canView: false, canEdit: false })
      setLoading(false)
      return
    }

    if (!effectiveRole || !clubId) {
      setAccess({ canView: false, canEdit: false })
      setLoading(true)
      return
    }

    if (ADMIN_ROLES.includes(effectiveRole)) {
      setAccess({ canView: true, canEdit: true })
      setLoading(false)
      return
    }

    if (effectiveRole !== 'committee') {
      setAccess({ canView: false, canEdit: false })
      setLoading(false)
      return
    }

    setLoading(true)
    supabase
      .from('committee_access')
      .select('can_view, can_edit')
      .eq('profile_id', user.id)
      .eq('club_id', clubId)
      .eq('module', moduleKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAccess({ canView: data.can_view, canEdit: data.can_edit })
        } else {
          setAccess({ canView: false, canEdit: false })
        }
        setLoading(false)
      })
  }, [moduleKey, user?.id, effectiveRole, clubId, authLoading])

  return { ...access, loading }
}
