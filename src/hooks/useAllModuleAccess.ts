import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'

export interface ModuleAccessMap {
  [moduleKey: string]: { canView: boolean; canEdit: boolean }
}

const ADMIN_ROLES = ['admin', 'president', 'vice_president']

export function useAllModuleAccess() {
  const { user, effectiveRole } = useAuth()
  const { clubId } = useTenant()
  const [accessMap, setAccessMap] = useState<ModuleAccessMap>({})
  const [loading, setLoading] = useState(true)

  const isAdmin = effectiveRole ? ADMIN_ROLES.includes(effectiveRole) : false

  useEffect(() => {
    if (!user) {
      setAccessMap({})
      setLoading(false)
      return
    }

    if (!effectiveRole || !clubId) {
      setAccessMap({})
      setLoading(true)
      return
    }

    if (ADMIN_ROLES.includes(effectiveRole)) {
      setAccessMap({})
      setLoading(false)
      return
    }

    if (effectiveRole !== 'committee') {
      setAccessMap({})
      setLoading(false)
      return
    }

    setLoading(true)
    supabase
      .from('committee_access')
      .select('module, can_view, can_edit')
      .eq('profile_id', user.id)
      .eq('club_id', clubId)
      .then(({ data, error }) => {
        console.log('[useAllModuleAccess] committee_access query', {
          profileId: user.id,
          clubId,
          error,
          rowCount: data?.length ?? 0,
          data,
        })
        const map: ModuleAccessMap = {}
        if (data) {
          for (const row of data) {
            map[row.module] = { canView: row.can_view, canEdit: row.can_edit }
          }
        }
        setAccessMap(map)
        setLoading(false)
      })
  }, [user?.id, effectiveRole, clubId])

  const canView = (moduleKey: string) => {
    if (isAdmin) return true
    return accessMap[moduleKey]?.canView ?? false
  }

  const canEdit = (moduleKey: string) => {
    if (isAdmin) return true
    return accessMap[moduleKey]?.canEdit ?? false
  }

  return { accessMap, loading, canView, canEdit, isAdmin }
}
