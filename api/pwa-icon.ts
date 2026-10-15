const RESERVED = new Set(['console', 'www']);
const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const VALID_SIZES = new Set(['192', '512']);

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

  const qs = new URLSearchParams(req.query || {});
  const size = VALID_SIZES.has(qs.get('size') || '') ? qs.get('size')! : '192';
  const maskable = qs.get('maskable') === '1';

  const params = new URLSearchParams({ size });
  if (maskable) params.set('maskable', '1');
  if (slug) params.set('slug', slug);

  const url = `${base}/functions/v1/pwa-icon?${params}`;

  try {
    const upstream = await fetch(url);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res
      .status(upstream.status)
      .setHeader('Content-Type', 'image/png')
      .setHeader('Cache-Control', 'public, max-age=600')
      .send(buffer);
  } catch {
    res.status(502).type('text/plain').send('Icône indisponible');
  }
}
