import { useSyncExternalStore } from 'react'
import type { NavView } from '../config/navMenus'
import { computeAvailableViews, resolveNavView } from '../config/navMenus'
import { useAuth } from '../context/AuthContext'

const NAV_VIEW_KEY = 'navView'
const NAV_VIEW_EVENT = 'navview-change'

export function persistNavView(view: NavView) {
  try {
    localStorage.setItem(NAV_VIEW_KEY, view)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(NAV_VIEW_EVENT))
}

function subscribe(callback: () => void) {
  window.addEventListener(NAV_VIEW_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(NAV_VIEW_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

function getSnapshot(): string | null {
  try {
    return localStorage.getItem(NAV_VIEW_KEY)
  } catch {
    return null
  }
}

export default function useStoredNavView(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}

// Resolves the ACTIVE view (the one the view switcher currently shows),
// combining the stored choice with the views available to the user.
// Use this instead of effectiveRole to decide what a screen renders.
export function useActiveNavView(): NavView {
  const stored = useStoredNavView()
  const { clubRoles, isPlatformAdmin, hasCommitteeAccess } = useAuth()
  return resolveNavView(stored, computeAvailableViews(clubRoles, isPlatformAdmin, hasCommitteeAccess))
}
