import * as Sentry from '@sentry/react';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function scrubEmails(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.replace(EMAIL_RE, '[email]');
}

function deriveEnvironment(): string {
  const h = window.location.hostname;
  if (h.includes('.test.clubsphere.cloud')) return 'test';
  if (h === 'localhost' || h === '127.0.0.1' || !h.includes('clubsphere')) return 'dev';
  return 'prod';
}

const IGNORE_ERRORS: (string | RegExp)[] = [
  'Failed to fetch',
  'Load failed',
  'NetworkError',
  'AbortError',
  'The operation was aborted',
  /SCDynimacBridge/,
  /SCDynamicBridge/,
  /Script https?:\/\/.*\/sw\.js load failed/,
  /ResizeObserver loop/,
  /^(pa|La)$/,
  /Non-Error promise rejection captured/,
];

const DENY_URLS: RegExp[] = [
  /extensions\//i,
  /^chrome(-extension)?:\/\//i,
  /^moz-extension:\/\//i,
  /^safari(-web)?-extension:\/\//i,
  /translate\.googleapis\.com/,
  /gstatic\.com\/_\/translate/,
];

const ERROR_BOUNDARY_MECHANISM = 'auto.function.react.error_boundary';

function matchesIgnored(text: string): boolean {
  return IGNORE_ERRORS.some((p) => (typeof p === 'string' ? text.includes(p) : p.test(text)));
}

function isForeignEvent(event: Sentry.ErrorEvent): boolean {
  const values = event.exception?.values ?? [];
  if (values.some((v) => v.mechanism?.type === ERROR_BOUNDARY_MECHANISM)) return false;

  const frames = values.flatMap((v) => v.stacktrace?.frames ?? []);
  if (frames.length > 0) {
    return !frames.some((f) => f.filename?.includes('/assets/'));
  }

  const texts = [
    event.message,
    ...values.flatMap((v) => [v.value, v.type && v.value ? `${v.type}: ${v.value}` : undefined]),
  ].filter((t): t is string => !!t);
  return texts.some(matchesIgnored);
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: deriveEnvironment(),
    release: `clubsphere-app@${__APP_VERSION__}`,
    tracesSampleRate: 0,
    integrations: [],
    ignoreErrors: IGNORE_ERRORS,
    denyUrls: DENY_URLS,
    beforeSend(event) {
      if (isForeignEvent(event)) return null;
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
      }
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          ex.value = scrubEmails(ex.value);
        }
      }
      if (event.message) {
        event.message = scrubEmails(event.message)!;
      }
      if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
          if (bc.message) bc.message = scrubEmails(bc.message);
        }
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (
        breadcrumb.category === 'fetch' ||
        breadcrumb.category === 'xhr'
      ) {
        if (breadcrumb.data?.url) {
          try {
            const u = new URL(breadcrumb.data.url, window.location.origin);
            breadcrumb.data.url = u.origin + u.pathname;
          } catch { /* keep as-is */ }
        }
        const keep: Record<string, unknown> = {};
        if (breadcrumb.data?.method) keep.method = breadcrumb.data.method;
        if (breadcrumb.data?.status_code != null) keep.status_code = breadcrumb.data.status_code;
        if (breadcrumb.data?.url) keep.url = breadcrumb.data.url;
        breadcrumb.data = keep;
      }
      return breadcrumb;
    },
  });
}

export { Sentry };
