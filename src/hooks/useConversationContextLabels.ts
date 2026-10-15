import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';

const STAFF_ROLE_LABELS: Record<string, string> = {
  principal: 'Entraîneur principal',
  assistant: 'Assistant',
  aide_moniteur: 'Aide-moniteur',
};

export type ContextLabels = Record<string, string>;

export function useConversationContextLabels(
  conversationId: string | null,
  conversationType: string | undefined,
  teamId: string | null | undefined,
): ContextLabels {
  const { clubId } = useTenant();
  const [labels, setLabels] = useState<ContextLabels>({});

  useEffect(() => {
    if (!conversationId || !clubId) {
      setLabels({});
      return;
    }

    let cancelled = false;

    if (conversationType === 'committee' || conversationType === 'event_committee') {
      loadCommitteeLabels(conversationId, clubId, cancelled).then(
        m => { if (!cancelled) setLabels(m); },
      );
    } else if (teamId) {
      loadTeamStaffLabels(conversationId, teamId, cancelled).then(
        m => { if (!cancelled) setLabels(m); },
      );
    } else {
      setLabels({});
    }

    return () => { cancelled = true; };
  }, [conversationId, conversationType, teamId, clubId]);

  return labels;
}

async function loadCommitteeLabels(
  conversationId: string,
  clubId: string,
  cancelled: boolean,
): Promise<ContextLabels> {
  const [participantsRes, committeeRes] = await Promise.all([
    supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId),
    supabase
      .from('committee_members')
      .select('email, role')
      .eq('club_id', clubId),
  ]);

  if (cancelled) return {};
  const participantIds = (participantsRes.data ?? []).map(p => p.user_id);
  if (participantIds.length === 0) return {};

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', participantIds);

  if (cancelled || !profiles) return {};

  const committeByEmail = new Map<string, string>();
  for (const cm of committeeRes.data ?? []) {
    if (cm.email && cm.role) {
      committeByEmail.set(cm.email.toLowerCase(), cm.role);
    }
  }

  const map: ContextLabels = {};
  for (const p of profiles) {
    const fn = committeByEmail.get((p.email ?? '').toLowerCase());
    map[p.id] = fn || 'Comité';
  }
  return map;
}

async function loadTeamStaffLabels(
  conversationId: string,
  teamId: string,
  cancelled: boolean,
): Promise<ContextLabels> {
  const [participantsRes, staffRes] = await Promise.all([
    supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId),
    supabase
      .from('team_staff')
      .select('coach_id, role, coaches!inner(user_id)')
      .eq('team_id', teamId),
  ]);

  if (cancelled) return {};

  const staffByUserId = new Map<string, string>();
  for (const row of (staffRes.data ?? []) as any[]) {
    const userId = row.coaches?.user_id;
    if (userId && row.role) {
      staffByUserId.set(userId, STAFF_ROLE_LABELS[row.role] ?? row.role);
    }
  }

  const map: ContextLabels = {};
  for (const p of participantsRes.data ?? []) {
    const staffLabel = staffByUserId.get(p.user_id);
    if (staffLabel) {
      map[p.user_id] = staffLabel;
    }
  }
  return map;
}
