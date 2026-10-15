import { supabase } from './supabase';

export const GALLERY_BUCKET = 'galleries';
export const GALLERY_MAX_PHOTOS = 100;

export interface Gallery {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  taken_on: string | null;
  event_id: string | null;
  team_id: string | null;
  season_id: string | null;
  cover_photo_id: string | null;
  visibility: 'club' | 'public';
}

export interface GalleryPhoto {
  id: string;
  gallery_id: string;
  path: string;
  thumb_path: string;
  caption: string | null;
  sort_order: number;
  width: number | null;
  height: number | null;
  hidden_from_public: boolean;
}

export interface ConsentWarning {
  member_id: string;
  name: string;
}

export function parseConsentWarnings(value: unknown): ConsentWarning[] {
  if (!Array.isArray(value)) return [];
  return value.filter((w): w is ConsentWarning =>
    !!w && typeof w === 'object' && typeof (w as ConsentWarning).name === 'string');
}

export function consentWarningText(warnings: ConsentWarning[]) {
  const n = warnings.length;
  const names = warnings.map((w) => w.name).join(', ');
  const head = n > 1
    ? `${n} joueurs de cette équipe n'ont pas donné leur consentement photo`
    : `1 joueur de cette équipe n'a pas donné son consentement photo`;
  return `${head} : ${names}. Vérifiez les photos avant de publier ; vous pouvez masquer une photo du site depuis son menu.`;
}

export const GALLERY_COLUMNS =
  'id,club_id,title,description,taken_on,event_id,team_id,season_id,cover_photo_id,visibility';

export interface GalleryListRow extends Gallery {
  created_at: string;
  photos: { count: number }[] | null;
  cover: { thumb_path: string } | null;
  team: { name: string } | null;
  event: { title: string } | null;
  season: { name: string } | null;
}

export function fetchMemberGalleries(clubId: string, limit?: number) {
  let query = supabase
    .from('galleries')
    .select(`${GALLERY_COLUMNS}, created_at, photos:gallery_photos!gallery_photos_gallery_id_fkey(count), cover:gallery_photos!galleries_cover_fk(thumb_path), team:teams(name), event:events(title), season:seasons(name)`)
    .eq('club_id', clubId)
    .order('taken_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (limit) query = query.limit(limit);
  return query.returns<GalleryListRow[]>();
}

export function formatGalleryDate(date: string | null) {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function signGalleryPaths(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(GALLERY_BUCKET).createSignedUrls(paths, 3600);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const item of data) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}

export async function removeGalleryFiles(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(GALLERY_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}
