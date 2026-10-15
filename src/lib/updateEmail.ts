import { supabase } from './supabase';
import { invokeFunction } from './invokeFunction';

export async function updateUserEmail(
  userId: string,
  newEmail: string,
  oldEmail: string
): Promise<void> {
  const { data: fnData, error: authError } = await invokeFunction('update-user-email', {
    body: { user_id: userId, new_email: newEmail },
  });

  if (authError || fnData?.error) {
    throw new Error(fnData?.error || authError || 'Erreur mise à jour email auth');
  }

  const { error: profileError } = await supabase.from('profiles').update({ email: newEmail }).eq('id', userId);
  if (profileError) throw new Error('Erreur mise à jour profil: ' + profileError.message);

  if (oldEmail) {
    const { error: memberError } = await supabase.from('members').update({ email: newEmail }).ilike('email', oldEmail);
    if (memberError) throw new Error('Erreur mise à jour membre: ' + memberError.message);
    const { error: coachError } = await supabase.from('coaches').update({ email: newEmail }).ilike('email', oldEmail);
    if (coachError) throw new Error('Erreur mise à jour coach: ' + coachError.message);
  }
}
