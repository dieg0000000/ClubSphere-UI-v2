import React from 'react'
import ReactDOM from 'react-dom/client'
import { initSentry, Sentry } from './lib/sentry'
import App from './App'
import ConsoleApp from './ConsoleApp'
import './index.css'
import 'leaflet/dist/leaflet.css'
import { TenantProvider, isConsoleMode } from './context/TenantContext'
import { ThemeProvider } from './context/ThemeContext'
import { LoadError } from './components/LoadError'
import { UpdateBanner } from './components/UpdateBanner'
import { initAppUpdate } from './lib/appUpdate'

initSentry()
initAppUpdate()

const RELOAD_FLAG = 'cs_reloaded_after_preload_error'

window.addEventListener('vite:preloadError', (event: any) => {
  event.preventDefault()
  if (!sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.setItem(RELOAD_FLAG, '1')
    window.location.reload()
  }
})

const TRANSLATE_RELOAD_FLAG = 'cs_translate_reload'
const translateReloadUsedBefore = !!sessionStorage.getItem(TRANSLATE_RELOAD_FLAG)
const TRANSLATION_CRASH_RE = /insertBefore|removeChild|Maximum call stack size exceeded/

function isPageTranslated(): boolean {
  const translatedClass = Array.from(document.documentElement.classList).some(c => c.startsWith('translated-'))
  return translatedClass || !!document.querySelector('font[style], .goog-te-banner-frame, #goog-gt-tt')
}

function isTranslationCrash(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return TRANSLATION_CRASH_RE.test(message) && isPageTranslated()
}

function beforeBoundaryCapture(scope: Sentry.Scope, error: unknown) {
  if (isTranslationCrash(error)) {
    scope.setLevel('warning')
    scope.setTag('translated', 'true')
  }
}

function onBoundaryError(error: unknown) {
  if (isTranslationCrash(error) && !sessionStorage.getItem(TRANSLATE_RELOAD_FLAG)) {
    sessionStorage.setItem(TRANSLATE_RELOAD_FLAG, '1')
    window.location.reload()
  }
}

function SentryFallback({ error }: { error: unknown }) {
  if (!translateReloadUsedBefore && isTranslationCrash(error)) {
    return <></>
  }
  return <LoadError onRetry={() => window.location.reload()} />
}

const console_ = isConsoleMode()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={SentryFallback} beforeCapture={beforeBoundaryCapture} onError={onBoundaryError}>
      {console_ ? (
        <ConsoleApp />
      ) : (
        <TenantProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </TenantProvider>
      )}
      <UpdateBanner />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
