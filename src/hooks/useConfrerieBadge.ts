import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface ConfrerieBadge {
  is_member: boolean;
  label: string | null;
  member_since: string | null;
}

export function useConfrerieBadge() {
  const [badge, setBadge] = useState<ConfrerieBadge | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    supabase.rpc('get_my_confrerie_badge').then(({ data }) => {
      if (data && data.is_member) {
        setBadge(data);
        return;
      }
      if (!user.email) return;
      supabase
        .from('confrerie_members')
        .select('member_since')
        .ilike('email', user.email)
        .eq('active', true)
        .is('archived_at', null)
        .limit(1)
        .maybeSingle()
        .then(({ data: row }) => {
          if (row) {
            setBadge({ is_member: true, label: null, member_since: row.member_since });
          }
        });
    });
  }, [user]);

  return badge;
}
