import { supabase } from '../lib/supabase';

export async function getUserDisplayName(userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.first_name) {
    return `${profile.first_name} ${profile.last_name || ''}`.trim();
  }
  return profile?.full_name ?? 'Utilisateur';
}
