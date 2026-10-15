export const UPDATE_AVAILABLE_EVENT = 'cs:update-available'
export type UpdateAvailableDetail = { key: string }

const RELOADED_FOR_KEY = 'cs_update_reloaded_for'
const SW_CHECK_INTERVAL_MS = 60 * 60 * 1000
const SAFE_RETRY_MS = 500
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'hidden', 'image', 'file'])

interface Activity {
  inflight: number
  dirtyField: Element | null
}

function isTextEntry(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type) && !el.readOnly && !el.disabled
  return el instanceof HTMLElement && el.isContentEditable
}

function trackActivity(): Activity {
  const activity: Activity = { inflight: 0, dirtyField: null }
  const originalFetch = window.fetch.bind(window)
  window.fetch = (...args: Parameters<typeof fetch>) => {
    activity.inflight++
    return originalFetch(...args).finally(() => { activity.inflight-- })
  }
  document.addEventListener('input', (e) => {
    if (e.target instanceof Element && isTextEntry(e.target)) activity.dirtyField = e.target
  }, true)
  document.addEventListener('submit', () => { activity.dirtyField = null }, true)
  return activity
}

function isEditing(activity: Activity): boolean {
  if (isTextEntry(document.activeElement)) return true
  return !!activity.dirtyField && activity.dirtyField.isConnected
}

export function reloadForUpdate(key: string) {
  sessionStorage.setItem(RELOADED_FOR_KEY, key)
  window.location.reload()
}

async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data: unknown = await res.json()
    const buildId = (data as { buildId?: unknown } | null)?.buildId
    return typeof buildId === 'string' ? buildId : null
  } catch {
    return null
  }
}

export function initAppUpdate() {
  if (!import.meta.env.PROD) return

  const activity = trackActivity()
  let pendingKey: string | null = null
  let registration: ServiceWorkerRegistration | undefined

  const scheduleReload = (key: string) => {
    if (sessionStorage.getItem(RELOADED_FOR_KEY) === key || pendingKey === key) return
    pendingKey = key
    const attempt = () => {
      if (pendingKey !== key) return
      if (isEditing(activity)) {
        window.dispatchEvent(new CustomEvent<UpdateAvailableDetail>(UPDATE_AVAILABLE_EVENT, { detail: { key } }))
        return
      }
      if (activity.inflight > 0) {
        setTimeout(attempt, SAFE_RETRY_MS)
        return
      }
      reloadForUpdate(key)
    }
    attempt()
  }

  const updateServiceWorker = () => {
    registration?.update().catch((err) => console.warn('Service worker update failed', err))
  }

  const checkVersion = async () => {
    const remote = await fetchRemoteBuildId()
    if (!remote || remote === __BUILD_ID__) return
    updateServiceWorker()
    scheduleReload(remote)
  }

  if ('serviceWorker' in navigator) {
    let controlled = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', async () => {
      // The first claim after a fresh install is not an update.
      if (!controlled) {
        controlled = true
        return
      }
      const remote = await fetchRemoteBuildId()
      if (remote === __BUILD_ID__) return
      scheduleReload(remote ?? 'sw-update')
    })

    window.addEventListener('load', () => {
      try {
        navigator.serviceWorker
          .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
          .then((reg) => {
            registration = reg
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
            updateServiceWorker()
          })
          .catch(() => {})
      } catch {
        // registration can throw synchronously (e.g. insecure context)
      }
    })

    setInterval(() => {
      if (document.visibilityState === 'visible') updateServiceWorker()
    }, SW_CHECK_INTERVAL_MS)
  }

  void checkVersion()

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    updateServiceWorker()
    void checkVersion()
  })
}
