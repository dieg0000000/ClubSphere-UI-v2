import { supabase } from './supabase'
import { isNativeApp } from './nativeApp'

export interface ClubSphereNativeBridge {
  getPlatform(): string
  getAppVersion(): string
  getPushToken(): string
  hasPushPermission(): boolean
  requestPushPermission(): void
  getLauncherDiagnostics?(): string
}

declare global {
  interface Window {
    ClubSphereNative?: ClubSphereNativeBridge
  }
}

const RETRY_INTERVAL_MS = 3000
const RETRY_WINDOW_MS = 30000

let claimedKey: string | null = null
let inflight: Promise<boolean> | null = null
let pendingClubId: string | null = null
let visibilityListening = false

export function getNativeBridge(): ClubSphereNativeBridge | null {
  if (!isNativeApp() || typeof window === 'undefined') return null
  return window.ClubSphereNative ?? null
}

export function readLauncherDiagnostics(): string {
  const bridge = typeof window === 'undefined' ? undefined : window.ClubSphereNative
  let result: string
  if (!bridge) {
    result = 'passerelle absente'
  } else if (typeof bridge.getLauncherDiagnostics !== 'function') {
    result = 'méthode absente (ancien APK)'
  } else {
    try {
      result = bridge.getLauncherDiagnostics() || '(vide)'
    } catch (err) {
      result = `erreur ${err instanceof Error ? err.message : String(err)}`
    }
  }
  return `${result} · web ${__BUILD_ID__ || __APP_VERSION__}`
}

function currentToken(bridge: ClubSphereNativeBridge): string {
  try {
    return bridge.getPushToken() || ''
  } catch {
    return ''
  }
}

async function claim(bridge: ClubSphereNativeBridge, token: string, clubId: string): Promise<boolean> {
  const key = `${token}::${clubId}`
  if (claimedKey === key) return true
  const { error } = await supabase.rpc('claim_push_device', {
    p_token: token,
    p_platform: bridge.getPlatform(),
    p_user_agent: navigator.userAgent,
    p_club_id: clubId,
    p_app_version: bridge.getAppVersion(),
  })
  if (error) return false
  claimedKey = key
  return true
}

function onVisibility() {
  if (document.visibilityState !== 'visible' || !pendingClubId) return
  void registerNativePushDevice(pendingClubId)
}

function watchVisibility(clubId: string) {
  pendingClubId = clubId
  if (visibilityListening) return
  visibilityListening = true
  document.addEventListener('visibilitychange', onVisibility)
}

function stopWatchingVisibility() {
  pendingClubId = null
  if (!visibilityListening) return
  visibilityListening = false
  document.removeEventListener('visibilitychange', onVisibility)
}

async function waitForToken(bridge: ClubSphereNativeBridge): Promise<string> {
  const deadline = Date.now() + RETRY_WINDOW_MS
  let token = currentToken(bridge)
  while (!token && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS))
    token = currentToken(bridge)
  }
  return token
}

export function registerNativePushDevice(clubId: string | null): Promise<boolean> {
  const bridge = getNativeBridge()
  if (!bridge || !clubId) return Promise.resolve(false)
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const token = await waitForToken(bridge)
      if (!token) {
        watchVisibility(clubId)
        return false
      }
      const ok = await claim(bridge, token, clubId)
      if (ok) stopWatchingVisibility()
      else watchVisibility(clubId)
      return ok
    } catch {
      watchVisibility(clubId)
      return false
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export function isNativePushRegistered(): boolean {
  const bridge = getNativeBridge()
  if (!bridge || !claimedKey) return false
  const token = currentToken(bridge)
  return !!token && claimedKey.startsWith(`${token}::`)
}

export function nativePushPermissionGranted(): boolean {
  const bridge = getNativeBridge()
  if (!bridge) return false
  try {
    return bridge.hasPushPermission()
  } catch {
    return false
  }
}

export async function releaseNativePushDevice(): Promise<void> {
  const bridge = getNativeBridge()
  stopWatchingVisibility()
  claimedKey = null
  if (!bridge) return
  const token = currentToken(bridge)
  if (!token) return
  try {
    await supabase.rpc('release_push_device', { p_token: token })
  } catch {
    // Sign-out must proceed even if the device row cannot be released.
  }
}
