import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const EDITOR_STAFF_ROLES = ['principal', 'assistant']

export function useCanManageTeamAttendance(teamId: string | null | undefined): { canManage: boolean; isClubManager: boolean; loaded: boolean } {
  const { user, hasRole } = useAuth()
  const isClubManager = hasRole('admin') || hasRole('committee')
  const [isEditorStaff, setIsEditorStaff] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (isClubManager || !teamId || !user?.id) {
      setIsEditorStaff(false)
      setLoaded(true)
      return
    }
    let cancelled = false
    setLoaded(false)
    supabase
      .from('team_staff')
      .select('id, coaches!inner(user_id, can_login, self_deleted_at)')
      .eq('team_id', teamId)
      .in('role', EDITOR_STAFF_ROLES)
      .eq('coaches.user_id', user.id)
      .eq('coaches.can_login', true)
      .is('coaches.self_deleted_at', null)
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        setIsEditorStaff(!error && (data?.length ?? 0) > 0)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [teamId, user?.id, isClubManager])

  return { canManage: isClubManager || isEditorStaff, isClubManager, loaded }
}
