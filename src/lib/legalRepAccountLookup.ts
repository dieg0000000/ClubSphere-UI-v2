import { supabase } from './supabase';

/**
 * Detects which of the given emails already belong to an existing account.
 * Uses the SECURITY DEFINER RPC `get_user_ids_by_emails` so detection does not
 * depend on the caller's row-level visibility of the profiles table, mirroring
 * the server-side trigger that auto-links legal reps as parents.
 * Returns a map keyed by lowercased/trimmed email -> display name (falls back
 * to the email when no name is available).
 */
export default async function findLegalRepAccounts(
  emails: string[]
): Promise<Map<string, string>> {
  const normalized = Array.from(
    new Set(
      emails
        .map((e) => (e || '').trim().toLowerCase())
        .filter((e) => e.length > 0)
    )
  );
  const result = new Map<string, string>();
  if (normalized.length === 0) return result;

  const orFilter = normalized.map((e) => `email.ilike.${e}`).join(',');

  // Two independent detection paths, combined so a match is never missed:
  //  - RPC (SECURITY DEFINER) matches auth.users regardless of RLS visibility
  //  - direct profiles query mirrors the server trigger's profiles.email match
  const [rpcRes, profRes] = await Promise.all([
    supabase.rpc('get_user_ids_by_emails', { emails: normalized }),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, email')
      .or(orFilter),
  ]);

  const nameFor = (p: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  }): string =>
    [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
    (p.full_name || '').trim();

  // Collect ids that need a name lookup (RPC returns no name).
  const idToEmail = new Map<string, string>();
  for (const row of (rpcRes.data || []) as Array<{ id: string; email: string | null }>) {
    const email = (row.email || '').trim().toLowerCase();
    if (email && normalized.includes(email)) idToEmail.set(row.id, email);
  }

  // Names available directly from profiles (by email and by id).
  const nameByEmail = new Map<string, string>();
  const nameById = new Map<string, string>();
  for (const p of (profRes.data || []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email: string | null;
  }>) {
    const email = (p.email || '').trim().toLowerCase();
    const nm = nameFor(p);
    if (email && normalized.includes(email)) {
      result.set(email, nm || email);
      if (nm) nameByEmail.set(email, nm);
    }
    if (nm) nameById.set(p.id, nm);
  }

  // Any RPC hit not already covered by the direct profiles query.
  for (const [id, email] of idToEmail) {
    if (!result.has(email)) {
      result.set(email, nameById.get(id) || nameByEmail.get(email) || email);
    }
  }

  return result;
}
