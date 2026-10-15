import { supabase } from '../lib/supabase';

export interface CharteDoc {
  id: string;
  title: string;
  category: 'charte_joueurs' | 'charte_joueurs_mineurs' | 'charte_entraineurs';
  season_id?: string;
  target_team_ids?: string[] | null;
  seasons?: { name?: string };
}

export interface PendingCharteInfo {
  docs: CharteDoc[];
  pendingForSelf: CharteDoc[];
  pendingForChildren: Array<{ doc: CharteDoc; childId: string; childName: string }>;
}

export function calcAge(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export async function loadActiveChartes(): Promise<CharteDoc[]> {
  const { data: seasons } = await supabase.from('seasons').select('id, active');
  const activeSeason = seasons?.find(s => s.active);
  let q = supabase
    .from('documents')
    .select('id, title, category, season_id, target_team_ids, seasons(name)')
    .in('category', ['charte_joueurs', 'charte_joueurs_mineurs', 'charte_entraineurs'])
    .eq('is_active', true);
  if (activeSeason) q = q.eq('season_id', activeSeason.id);
  const { data } = await q;
  return (data ?? []) as unknown as CharteDoc[];
}

export async function getPendingChartesForUser(
  userId: string,
  role: string
): Promise<PendingCharteInfo> {
  const docs = await loadActiveChartes();
  if (!docs.length) return { docs, pendingForSelf: [], pendingForChildren: [] };

  const { data: acks } = await supabase
    .from('document_acknowledgements')
    .select('document_id, member_id, user_id')
    .in('document_id', docs.map(d => d.id));

  const pendingForSelf: CharteDoc[] = [];
  const pendingForChildren: Array<{ doc: CharteDoc; childId: string; childName: string }> = [];

  const isMemberOrParent = ['member', 'parent'].includes(role);

  if (isMemberOrParent) {
    const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).maybeSingle();

    // Check adult charte for self
    const joueurAdultDoc = docs.find(d => d.category === 'charte_joueurs');
    if (joueurAdultDoc && profile?.email) {
      const { data: member } = await supabase
        .from('members').select('id, birth_date').ilike('email', profile.email).maybeSingle();
      if (member) {
        const age = calcAge(member.birth_date);
        if (age !== null && age >= 18) {
          const already = (acks ?? []).some(a => a.document_id === joueurAdultDoc.id && a.member_id === member.id);
          if (!already) pendingForSelf.push(joueurAdultDoc);
        }
      }
    }

    // Check minor charte for children
    const joueurMinorDoc = docs.find(d => d.category === 'charte_joueurs_mineurs');
    if (joueurMinorDoc) {
      const { data: parentMembers } = await supabase
        .from('parent_members')
        .select('member_id, members:member_id(id, first_name, last_name, birth_date)')
        .eq('parent_user_id', userId);
      for (const pm of parentMembers ?? []) {
        const child: any = pm.members;
        if (!child) continue;
        const age = calcAge(child.birth_date);
        if (age === null || age < 18) {
          const already = (acks ?? []).some(a => a.document_id === joueurMinorDoc.id && a.member_id === child.id);
          if (!already) pendingForChildren.push({
            doc: joueurMinorDoc,
            childId: child.id,
            childName: `${child.first_name ?? ''} ${child.last_name ?? ''}`.trim(),
          });
        }
      }
    }
  } else if (role === 'coach' || role === 'assistant_coach') {
    const myAckedDocIds = new Set(
      (acks ?? []).filter(a => a.user_id === userId && !a.member_id).map(a => a.document_id)
    );
    const coachDoc = docs.find(d => d.category === 'charte_entraineurs');
    if (coachDoc && !myAckedDocIds.has(coachDoc.id)) {
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).maybeSingle();
      if (profile?.email) {
        const { data: coach } = await supabase.from('coaches').select('id').ilike('email', profile.email).maybeSingle();
        if (coach) {
          const { data: teams } = await supabase
            .from('teams')
            .select('id')
            .or(`coach_id.eq.${coach.id},assistant_coach_id.eq.${coach.id}`);
          const myTeamIds = (teams ?? []).map(t => t.id);
          const targets = coachDoc.target_team_ids;
          const applies = !targets || targets.length === 0 || myTeamIds.some(id => targets.includes(id));
          if (applies) pendingForSelf.push(coachDoc);
        }
      }
    }
  }

  return { docs, pendingForSelf, pendingForChildren };
}

export function getFirstPendingCharteTab(info: PendingCharteInfo): string | null {
  if (info.pendingForSelf.length > 0) return info.pendingForSelf[0].category;
  if (info.pendingForChildren.length > 0) return info.pendingForChildren[0].doc.category;
  return null;
}
