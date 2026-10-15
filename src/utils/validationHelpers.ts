import { supabase } from '../lib/supabase';

interface DuplicateResult {
  id: string;
  first_name: string;
  last_name: string;
  table: string;
}

export interface DuplicatePersonInfo {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  table: 'Joueur' | 'Entraîneur' | 'Comité';
  team_name?: string | null;
  role?: string | null;
  qualification_name?: string | null;
}

export const fetchFullDuplicateInfo = async (
  duplicate: DuplicateResult
): Promise<DuplicatePersonInfo> => {
  if (duplicate.table === 'Joueur') {
    const { data } = await supabase
      .from('members')
      .select(`
        id, first_name, last_name, email, phone,
        birth_date, teams(name)
      `)
      .eq('id', duplicate.id)
      .single();

    return {
      id: data?.id || duplicate.id,
      first_name: data?.first_name || duplicate.first_name,
      last_name: data?.last_name || duplicate.last_name,
      email: data?.email,
      phone: data?.phone,
      birth_date: data?.birth_date,
      table: 'Joueur',
      team_name: (data?.teams as any)?.name || null,
    };
  }

  if (duplicate.table === 'Entraîneur') {
    const { data } = await supabase
      .from('coaches')
      .select(`
        id, first_name, last_name, email, phone,
        birth_date, coaching_qualifications(name)
      `)
      .eq('id', duplicate.id)
      .single();

    return {
      id: data?.id || duplicate.id,
      first_name: data?.first_name || duplicate.first_name,
      last_name: data?.last_name || duplicate.last_name,
      email: data?.email,
      phone: data?.phone,
      birth_date: data?.birth_date,
      table: 'Entraîneur',
      qualification_name: (data?.coaching_qualifications as any)?.name || null,
    };
  }

  if (duplicate.table === 'Comité') {
    const { data } = await supabase
      .from('committee_members')
      .select(`
        id, first_name, last_name, email, phone,
        birth_date, role
      `)
      .eq('id', duplicate.id)
      .single();

    return {
      id: data?.id || duplicate.id,
      first_name: data?.first_name || duplicate.first_name,
      last_name: data?.last_name || duplicate.last_name,
      email: data?.email,
      phone: data?.phone,
      birth_date: data?.birth_date,
      table: 'Comité',
      role: data?.role || null,
    };
  }

  return {
    id: duplicate.id,
    first_name: duplicate.first_name,
    last_name: duplicate.last_name,
    table: duplicate.table as 'Joueur' | 'Entraîneur' | 'Comité',
  };
};

export const checkAVSUnique = async (
  avs: string,
  excludeId?: string
): Promise<true | DuplicateResult> => {
  if (!avs) return true;

  let mQuery = supabase
    .from('members')
    .select('id, first_name, last_name')
    .eq('avs_number', avs);
  if (excludeId && excludeId !== '') {
    mQuery = mQuery.neq('id', excludeId);
  }

  let cQuery = supabase
    .from('coaches')
    .select('id, first_name, last_name')
    .eq('avs_number', avs);
  if (excludeId && excludeId !== '') {
    cQuery = cQuery.neq('id', excludeId);
  }

  let cmQuery = supabase
    .from('committee_members')
    .select('id, first_name, last_name')
    .eq('avs_number', avs);
  if (excludeId && excludeId !== '') {
    cmQuery = cmQuery.neq('id', excludeId);
  }

  const [m, c, cm] = await Promise.all([mQuery, cQuery, cmQuery]);

  const found: DuplicateResult[] = [
    ...(m.data || []).map((p) => ({ ...p, table: 'Joueur' })),
    ...(c.data || []).map((p) => ({ ...p, table: 'Entraîneur' })),
    ...(cm.data || []).map((p) => ({ ...p, table: 'Comité' })),
  ];

  return found.length === 0 ? true : found[0];
};

export const checkJSUnique = async (
  js: string,
  excludeId?: string
): Promise<true | DuplicateResult> => {
  if (!js) return true;

  let mQuery = supabase
    .from('members')
    .select('id, first_name, last_name')
    .eq('js_number', js);
  if (excludeId && excludeId !== '') {
    mQuery = mQuery.neq('id', excludeId);
  }

  let cQuery = supabase
    .from('coaches')
    .select('id, first_name, last_name')
    .eq('js_number', js);
  if (excludeId && excludeId !== '') {
    cQuery = cQuery.neq('id', excludeId);
  }

  const [m, c] = await Promise.all([mQuery, cQuery]);

  const found: DuplicateResult[] = [
    ...(m.data || []).map((p) => ({ ...p, table: 'Joueur' })),
    ...(c.data || []).map((p) => ({ ...p, table: 'Entraîneur' })),
  ];

  return found.length === 0 ? true : found[0];
};
