const RESERVED = new Set(['console', 'www']);
const SLUG_RE = /^[a-z0-9-]{1,60}$/;

function resolveSlug(host: string, root: string): string {
  const suffix = '.' + root;
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    if (SLUG_RE.test(sub) && !RESERVED.has(sub)) return sub;
  }
  return '';
}

export default async function handler(req: any, res: any) {
  const base = process.env.VITE_SUPABASE_URL;
  if (!base) return res.status(500).type('text/plain').send('Configuration manquante');

  const root = process.env.VITE_APP_ROOT_DOMAIN || 'clubsphere.cloud';
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0].trim().toLowerCase();
  const slug = resolveSlug(host, root);

  const url = `${base}/functions/v1/pwa-manifest${slug ? `?slug=${slug}` : ''}`;

  try {
    const upstream = await fetch(url);
    const body = await upstream.text();
    res
      .status(upstream.status)
      .setHeader('Content-Type', 'application/manifest+json')
      .setHeader('Cache-Control', 'public, max-age=300')
      .send(body);
  } catch {
    res.status(502).type('text/plain').send('Manifeste indisponible');
  }
}
