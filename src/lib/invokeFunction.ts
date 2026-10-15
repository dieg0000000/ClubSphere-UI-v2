import { supabase } from './supabase'

let _sessionExpiredHandler: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null) {
  _sessionExpiredHandler = handler
}

interface InvokeResult<T = any> {
  data: T | null
  error: string | null
  status?: number
}

export async function invokeFunction<T = any>(
  name: string,
  options?: { body?: unknown; method?: string },
): Promise<InvokeResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, options as any)

  if (!error) {
    return { data: data as T, error: null }
  }

  const status = (error as any)?.context?.status as number | undefined

  let message: string | null = null
  try {
    const ctx = (error as any).context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json()
      message = body?.error || body?.message || null
    } else if (ctx && typeof ctx.text === 'function') {
      const text = await ctx.text()
      if (text) message = text
    }
  } catch {
    // body unreadable — fall through to generic message
  }

  if (status === 401 && _sessionExpiredHandler) {
    _sessionExpiredHandler()
    return { data: null, error: message || error.message, status }
  }

  return { data: data as T | null, error: message || error.message, status }
}
