import { createClient } from '@supabase/supabase-js';
import { Sentry } from './sentry';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const REPORT_STATUSES = new Set([400, 403, 409]);
const MAX_CAPTURES = 20;
let captureCount = 0;

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function stripQueryString(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    const i = url.indexOf('?');
    return i >= 0 ? url.slice(0, i) : url;
  }
}

function shouldReport(pathname: string, method: string, status: number): boolean {
  if (!(pathname.includes('/rest/v1/') || pathname.includes('/functions/v1/'))) return false;
  if (status === 401 || status === 404 || status === 406) return false;
  // The grace row is insert-only; a refused or duplicate write means it already exists.
  if (method === 'POST' && pathname.endsWith('/rest/v1/mfa_grace_periods') && (status === 403 || status === 409)) return false;
  // Family links are idempotent; a conflict means they already exist.
  if (method === 'POST' && pathname.endsWith('/rest/v1/rpc/claim_family_links') && status === 409) return false;
  return REPORT_STATUSES.has(status) || status >= 500;
}

function sentryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init).then(async (response) => {
    if (captureCount >= MAX_CAPTURES) return response;

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      pathname = url;
    }

    const method = init?.method?.toUpperCase() || 'GET';
    if (!shouldReport(pathname, method, response.status)) return response;

    let body = '';
    try {
      body = await response.clone().text();
      body = body.slice(0, 300).replace(EMAIL_RE, '[email]');
    } catch { /* ignore */ }

    // A user's own role is club-managed; the refusal is expected and shown in the UI.
    if (method === 'PATCH' && pathname.endsWith('/rest/v1/profiles') && response.status === 403 && body.includes('rôle non modifiable')) {
      return response;
    }

    captureCount++;
    const cleanPath = stripQueryString(url);
    const level = response.status >= 500 ? 'error' : 'warning';

    const pathOnly = (() => {
      try { return new URL(cleanPath).pathname; } catch { return cleanPath; }
    })();

    Sentry.captureMessage(`Supabase ${response.status} ${method} ${pathOnly}`, {
      level: level as 'warning' | 'error',
      tags: {
        supabase_status: String(response.status),
        supabase_path: pathOnly,
      },
      fingerprint: ['supabase', String(response.status), pathOnly],
      extra: { body },
    });

    return response;
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: sentryFetch },
});
