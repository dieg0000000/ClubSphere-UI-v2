/**
 * Resolve the best display URL for a member photo.
 *
 * Prefers the signed URL (from `photo_path`) when available because it is
 * always fresh.  Falls back to the stored `photo_url` (public URL with
 * cache-buster) which is set by the parent / player upload flows.
 */
export function getMemberPhotoUrl(
  photoPath: string | null | undefined,
  signedUrlMap: Record<string, string>,
  photoUrl: string | null | undefined,
): string | null {
  const signed = photoPath ? signedUrlMap[photoPath] : undefined;
  return signed || photoUrl || null;
}
