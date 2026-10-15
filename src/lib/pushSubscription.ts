import { supabase } from './supabase'
import { isNativeApp } from './nativeApp'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BATvma3k7VXVZSr7cfXOcUHUU7J-VegBj63OmQh2ZSqQEIzAEfglSmYGSkSG03YxamTMGCYu_4LAEiFqSzvNk2w'
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000

let refreshLock = false

function lsEndpointKey(clubId: string) { return `push_last_endpoint_${clubId}` }
function lsRefreshKey(clubId: string) { return `push_last_refresh_ts_${clubId}` }

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export function pushSupported(): boolean {
  if (isNativeApp()) return false
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  return navigator.serviceWorker.ready
}

async function obtainSubscription(
  registration: ServiceWorkerRegistration,
): Promise<PushSubscription> {
  let sub = await registration.pushManager.getSubscription()
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }
  return sub
}

async function upsertSubscription(
  subscription: PushSubscription,
  clubId: string,
): Promise<void> {
  const keys = subscription.toJSON().keys || {}

  await supabase.rpc('claim_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh || '',
    p_auth: keys.auth || '',
    p_user_agent: navigator.userAgent,
    p_club_id: clubId,
  })

  const previousEndpoint = localStorage.getItem(lsEndpointKey(clubId))
  if (previousEndpoint && previousEndpoint !== subscription.endpoint) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', previousEndpoint)
  }

  localStorage.setItem(lsEndpointKey(clubId), subscription.endpoint)
}

export async function ensurePushSubscription(clubId: string | null): Promise<void> {
  if (!clubId) return
  if (!pushSupported() || Notification.permission !== 'granted') return
  if (refreshLock) return
  refreshLock = true
  try {
    const reg = await getRegistration()
    if (!reg) return
    const sub = await obtainSubscription(reg)
    await upsertSubscription(sub, clubId)
    localStorage.setItem(lsRefreshKey(clubId), String(Date.now()))
  } catch (err) {
    console.error('[push] subscription error:', err)
  } finally {
    refreshLock = false
  }
}

export function needsRefresh(clubId: string | null): boolean {
  if (!clubId) return false
  const ts = localStorage.getItem(lsRefreshKey(clubId))
  if (!ts) return true
  return Date.now() - Number(ts) >= REFRESH_INTERVAL_MS
}

export async function reactivatePushSubscription(
  clubId: string | null,
): Promise<boolean> {
  if (!clubId || !pushSupported()) return false
  if (refreshLock) return false
  refreshLock = true
  try {
    const reg = await getRegistration()
    if (!reg) return false

    const old = await reg.pushManager.getSubscription()
    if (old) {
      await old.unsubscribe()
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })

    await upsertSubscription(sub, clubId)
    localStorage.setItem(lsRefreshKey(clubId), String(Date.now()))
    return true
  } catch (err) {
    console.error('[push] reactivation error:', err)
    return false
  } finally {
    refreshLock = false
  }
}

export async function removePushSubscription(): Promise<void> {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)
  } catch (err) {
    console.error('[push] remove subscription error:', err)
  }
}
