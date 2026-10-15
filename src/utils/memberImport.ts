import { supabase } from '../lib/supabase';
import { checkAVSUnique } from './validationHelpers';

export interface ParsedRow {
  first_name: string;
  last_name: string;
  second_name?: string | null;
  birth_date?: string | null;
  nationality?: string | null;
  football_nationality?: string | null;
  country?: string | null;
  pseudonym?: string | null;
  salutation?: string | null;
  gender?: string | null;
  avs_number?: string | null;
  asf_licence_number?: string | null;
  email?: string | null;
  email_pro?: string | null;
  phone?: string | null;
  phone_private?: string | null;
  address?: string | null;
  street_number?: string | null;
  address2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  canton?: string | null;
  js_number?: string | null;
  licence_status?: string | null;
  position?: string | null;
  qualification_type?: string | null;
  qualified_from?: string | null;
  qualified_until?: string | null;
  legal_rep1_email?: string | null;
  legal_rep2_email?: string | null;
  legal_rep1_phone?: string | null;
  legal_rep2_phone?: string | null;
  legal_rep1_firstname?: string | null;
  legal_rep1_lastname?: string | null;
  legal_rep2_firstname?: string | null;
  legal_rep2_lastname?: string | null;
  affiliation_date?: string | null;
  club_origine?: string | null;
  classe_de_jeu?: string | null;
  remarques_club?: string | null;
  licence_chez?: string | null;
  _affiliation?: string | null;
  _ligue?: string | null;
}

export interface ImportProgress {
  current: number;
  total: number;
  phase: string;
  playerName?: string;
  imported?: number;
  updated?: number;
  skipped?: number;
  teamsCreatedCount?: number;
}

export interface ImportOptions {
  status: 'actif' | 'groupement';
  groupement_id?: string;
  createTeams: boolean;
  onProgress?: (p: ImportProgress) => void;
}

export interface SkippedReason {
  name: string;
  reason: string;
  matchField?: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  skippedReasons: SkippedReason[];
  teamsCreated: Array<{ name: string; category: string | null; type: string }>;
  teamsWithoutCategory: string[];
  playersWithoutTeam: number;
}

const UPDATABLE_BLANK_FIELDS: (keyof ParsedRow)[] = [
  'asf_licence_number', 'gender', 'js_number', 'licence_status',
  'address', 'street_number', 'phone', 'phone_private', 'email', 'email_pro',
  'postal_code', 'city', 'canton', 'country', 'nationality', 'football_nationality',
  'avs_number', 'salutation', 'second_name', 'pseudonym', 'position',
  'qualification_type', 'qualified_from', 'qualified_until',
  'legal_rep1_email', 'legal_rep2_email', 'legal_rep1_phone', 'legal_rep2_phone',
  'legal_rep1_firstname', 'legal_rep1_lastname', 'legal_rep2_firstname', 'legal_rep2_lastname',
  'affiliation_date', 'club_origine', 'classe_de_jeu', 'remarques_club',
  'address2', 'licence_chez',
];

export function toTitleCase(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

export function parseDateFlexible(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number' && isFinite(v)) {
    // Excel serial date (days since 1899-12-30)
    const base = Date.UTC(1899, 11, 30);
    const ms = base + v * 86400000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${mo}-${day}`;
    }
    return null;
  }
  const s = String(v).trim();
  if (!s || s === '-') return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function cleanClasseDeJeu(v: string | null | undefined): string | null {
  if (!v || v === '-') return null;
  return v
    .replace(/[-–]\s*tour printemps/gi, '')
    .replace(/[-–]\s*tour automne/gi, '')
    .replace(/\s*tour printemps/gi, '')
    .replace(/\s*tour automne/gi, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[-–\s]+|[-–\s]+$/g, '')
    .trim() || null;
}

const VALID_POSITIONS = ['Gardien', 'Défenseur', 'Milieu', 'Attaquant'];
export function sanitizePosition(pos: string | null | undefined): string | null {
  if (!pos || !pos.trim() || pos.trim() === '-') return null;
  const p = pos.trim();
  if (VALID_POSITIONS.includes(p)) return p;
  const l = p.toLowerCase();
  if (l.includes('goal') || l.includes('gardien') || l.includes('garden')) return 'Gardien';
  if (l.includes('def') || l.includes('défens')) return 'Défenseur';
  if (l.includes('mil') || l.includes('milieu')) return 'Milieu';
  if (l.includes('att') || l.includes('attaquant')) return 'Attaquant';
  return null;
}

export function getGenderFromSalutation(s: string | null | undefined): string | null {
  if (!s) return null;
  const x = s.toLowerCase().trim();
  if (x.includes('madame') || x.includes('mme') || x === 'f') return 'F';
  if (x.includes('monsieur') || x.includes('m.') || x === 'm') return 'M';
  return null;
}

export function normalizeGender(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (['m', 'h', 'homme', 'masculin', 'male', 'monsieur'].includes(s)) return 'M';
  if (['f', 'femme', 'féminin', 'feminin', 'female', 'madame'].includes(s)) return 'F';
  return null;
}

export function normalizeLicenceStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const s = status.toLowerCase().trim();
  if (s.includes('attente')) return 'en_attente';
  if (s.includes('partant')) return 'declare_partant';
  if (s.includes('parti') || s.includes('transfert')) return 'parti';
  if (s.includes('inactif') || s.includes('inactive')) return 'inactif';
  if (s.includes('suspendu') || s.includes('suspend')) return 'suspendu';
  if (s.includes('actif') || s.includes('active')) return 'actif';
  return s;
}

export function sanitizeJsNumber(js: string | null | undefined): string | null {
  if (!js || !String(js).trim() || String(js).trim() === '-') return null;
  const digits = String(js).replace(/[^\d]/g, '');
  return digits.length > 0 ? digits.substring(0, 9) : null;
}

function normalizeEmail(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = String(v).trim().toLowerCase();
  return t || null;
}

function getTeamType(ligue: string | null | undefined): 'junior' | 'active' {
  if (!ligue) return 'active';
  const l = ligue.toLowerCase();
  if (
    l.includes('junior') || l.includes('juniore') ||
    l.includes('ff-') || l.includes('ff ') ||
    l.includes('brack') || l.includes('play more') ||
    l.includes('catégorie f') || l.includes('catégorie g') ||
    l.includes('catégorie e')
  ) return 'junior';
  return 'active';
}

async function getCategoryId(ligue: string | null, type: 'junior' | 'active'): Promise<string | null> {
  if (!ligue) return null;
  const l = ligue.toLowerCase();
  let searchTerm: string | null = null;

  // Féminines (noms en base avec tiret : FF-7, FF-9, ... FF-19)
  if (l.includes('ff-19') || l.includes('ff19')) searchTerm = 'FF-19';
  else if (l.includes('ff-17') || l.includes('ff17')) searchTerm = 'FF-17';
  else if (l.includes('ff-14') || l.includes('ff14')) searchTerm = 'FF-14';
  else if (l.includes('ff-11') || l.includes('ff11')) searchTerm = 'FF-11';
  else if (l.includes('ff-9') || l.includes('ff9')) searchTerm = 'FF-9';
  else if (l.includes('ff-7') || l.includes('ff7')) searchTerm = 'FF-7';
  // Juniors (un seul "Juniors D" en base : D-7/D-9/D y retombent tous)
  else if (l.includes('juniors g')) searchTerm = 'Juniors G';
  else if (l.includes('juniors f') || l.includes('catégorie f') || l.includes('brack') || l.includes('play more')) searchTerm = 'Juniors F';
  else if (l.includes('juniors e') || l.includes('catégorie e')) searchTerm = 'Juniors E';
  else if (l.includes('juniors d') || l.includes('d-7') || l.includes('d7') || l.includes('d-9') || l.includes('d9')) searchTerm = 'Juniors D';
  else if (l.includes('juniors c')) searchTerm = 'Juniors C';
  else if (l.includes('juniors b')) searchTerm = 'Juniors B';
  else if (l.includes('jun.a p') || l.includes('juniors a p') || l.includes('jun a p')) searchTerm = 'Jun.A P';
  else if (l.includes('juniors a')) searchTerm = 'Juniors A';
  // Actifs (noms en base : "2e Ligue Interrégionale", "2e Ligue", ... "5e Ligue")
  else if (l.includes('interrégional') || l.includes('interregional')) searchTerm = '2e Ligue Interrégionale';
  else if (l.includes('promotion league') || l.includes('promotion')) searchTerm = 'Promotion League';
  else if (l.includes('1re ligue') || l.includes('1ère ligue') || l.includes('1ere ligue')) searchTerm = '1re Ligue Classic';
  else if (l.includes('5e ligue') || l.includes('5ème ligue') || l.includes('5eme ligue')) searchTerm = '5e Ligue';
  else if (l.includes('4e ligue') || l.includes('4ème ligue') || l.includes('4eme ligue')) searchTerm = '4e Ligue';
  else if (l.includes('3e ligue') || l.includes('3ème ligue') || l.includes('3eme ligue')) searchTerm = '3e Ligue';
  else if (l.includes('2e ligue') || l.includes('2ème ligue') || l.includes('2eme ligue')) searchTerm = '2e Ligue';
  else if (l.includes('seniors 40') || l.includes('seniors +40') || l.includes('seniors40')) searchTerm = 'Seniors 40+';
  else if (l.includes('seniors 50') || l.includes('seniors +50') || l.includes('seniors50')) searchTerm = 'Seniors 50+';
  else if (l.includes('seniors 30') || l.includes('seniors +30') || l.includes('seniors30')) searchTerm = 'Seniors 30+';

  if (!searchTerm) return null;

  // Correspondance EXACTE d'abord (évite que "2e Ligue" matche "2e Ligue Interrégionale")
  const { data: exact } = await supabase
    .from('team_categories')
    .select('id, name')
    .eq('type', type)
    .ilike('name', searchTerm)
    .limit(1)
    .maybeSingle();
  if (exact?.id) return exact.id;

  // Repli : correspondance partielle
  const { data } = await supabase
    .from('team_categories')
    .select('id, name')
    .eq('type', type)
    .ilike('name', `%${searchTerm}%`)
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

async function createOrGetTeam(
  affiliation: string | null,
  ligue: string | null,
  classeDeJeu: string | null,
  teamIdMap: Map<string, string>,
  key: string
): Promise<{ id: string | null; created: boolean; name: string; categoryName: string | null; type: 'junior' | 'active' }> {
  if (!affiliation || !ligue) {
    return { id: null, created: false, name: '', categoryName: null, type: 'active' };
  }
  const type = getTeamType(ligue);
  const cleanedClasse = cleanClasseDeJeu(classeDeJeu);
  const teamName = cleanedClasse && cleanedClasse !== ''
    ? `${affiliation} - ${ligue} ${cleanedClasse}`
    : `${affiliation} - ${ligue}`;

  if (teamIdMap.has(key)) {
    return { id: teamIdMap.get(key)!, created: false, name: teamName, categoryName: null, type };
  }

  const { data: existing } = await supabase
    .from('teams')
    .select('id')
    .eq('name', teamName)
    .maybeSingle();

  if (existing) {
    teamIdMap.set(key, existing.id);
    return { id: existing.id, created: false, name: teamName, categoryName: null, type };
  }

  const categoryId = await getCategoryId(ligue, type);
  let categoryName: string | null = null;
  if (categoryId) {
    const { data: catData } = await supabase
      .from('team_categories')
      .select('name')
      .eq('id', categoryId)
      .maybeSingle();
    categoryName = catData?.name || null;
  }

  const { data: newTeam, error } = await supabase
    .from('teams')
    .insert([{
      name: teamName,
      type,
      category_id: categoryId,
      classe_de_jeu: cleanedClasse,
      season: '2025-2026',
      active: true,
    }])
    .select('id')
    .single();

  if (!error && newTeam) {
    teamIdMap.set(key, newTeam.id);
    return { id: newTeam.id, created: true, name: teamName, categoryName, type };
  }
  return { id: null, created: false, name: teamName, categoryName, type };
}

function normalizeRow(raw: ParsedRow): ParsedRow {
  const first_name = toTitleCase(raw.first_name) ?? raw.first_name;
  const last_name = toTitleCase(raw.last_name) ?? raw.last_name;
  const second_name = toTitleCase(raw.second_name ?? null);
  return {
    ...raw,
    first_name,
    last_name,
    second_name,
    email: normalizeEmail(raw.email ?? null),
    email_pro: normalizeEmail(raw.email_pro ?? null),
    legal_rep1_email: normalizeEmail(raw.legal_rep1_email ?? null),
    legal_rep2_email: normalizeEmail(raw.legal_rep2_email ?? null),
    legal_rep1_firstname: toTitleCase(raw.legal_rep1_firstname ?? null),
    legal_rep1_lastname: toTitleCase(raw.legal_rep1_lastname ?? null),
    legal_rep2_firstname: toTitleCase(raw.legal_rep2_firstname ?? null),
    legal_rep2_lastname: toTitleCase(raw.legal_rep2_lastname ?? null),
  };
}

export async function importMembers(
  rawRows: ParsedRow[],
  opts: ImportOptions
): Promise<ImportResult> {
  const rows = rawRows.map(normalizeRow);
  const total = rows.length;
  const teamIdMap = new Map<string, string>();
  const teamsCreatedSet = new Set<string>();
  const teamsCreated: Array<{ name: string; category: string | null; type: string }> = [];
  const teamsWithoutCategory: string[] = [];
  const skippedReasons: SkippedReason[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let playersWithoutTeam = 0;

  for (let i = 0; i < rows.length; i++) {
    const member = rows[i];
    const playerName = `${member.first_name} ${member.last_name}`;
    opts.onProgress?.({
      current: i + 1,
      total,
      phase: `Import des joueurs... (${i + 1}/${total})`,
      playerName,
      imported,
      updated,
      skipped: skippedReasons.length,
      teamsCreatedCount: teamsCreated.length,
    });

    // Dedup: case-insensitive name + birth_date
    let existingQ = supabase
      .from('members')
      .select('id, asf_licence_number, gender, js_number, licence_status, address, street_number, phone, phone_private, email, email_pro, postal_code, city, canton, country, nationality, football_nationality, avs_number, salutation, second_name, pseudonym, position, qualification_type, qualified_from, qualified_until, legal_rep1_email, legal_rep2_email, legal_rep1_phone, legal_rep2_phone, legal_rep1_firstname, legal_rep1_lastname, legal_rep2_firstname, legal_rep2_lastname, affiliation_date, club_origine, classe_de_jeu, remarques_club, address2, licence_chez')
      .ilike('first_name', member.first_name)
      .ilike('last_name', member.last_name);
    existingQ = member.birth_date
      ? existingQ.eq('birth_date', member.birth_date)
      : existingQ.is('birth_date', null);
    const { data: existing } = await existingQ.maybeSingle();

    if (existing) {
      const updates: Record<string, unknown> = {};
      for (const f of UPDATABLE_BLANK_FIELDS) {
        const newVal = (member as unknown as Record<string, unknown>)[f];
        const curVal = (existing as unknown as Record<string, unknown>)[f];
        if (newVal !== null && newVal !== undefined && newVal !== '' && (curVal === null || curVal === undefined || curVal === '')) {
          updates[f] = newVal;
        }
      }
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('members').update(updates).eq('id', (existing as { id: string }).id);
        if (error) {
          skippedReasons.push({ name: playerName, reason: `erreur de mise à jour: ${error.message}`, matchField: 'name+birth_date' });
          skipped++;
        } else {
          updated++;
        }
      } else {
        skippedReasons.push({ name: playerName, reason: 'doublon (déjà à jour)', matchField: 'name+birth_date' });
        skipped++;
      }
      continue;
    }

    // AVS uniqueness
    if (member.avs_number && member.avs_number.trim()) {
      const avsCheck = await checkAVSUnique(member.avs_number);
      if (avsCheck !== true) {
        skippedReasons.push({ name: playerName, reason: 'AVS déjà présent', matchField: 'avs_number' });
        skipped++;
        continue;
      }
    }

    // Team creation (only for player import)
    let teamId: string | null = null;
    if (opts.createTeams && member._affiliation && member._ligue) {
      const key = `${member._affiliation}|${member._ligue}|${member.classe_de_jeu || ''}`;
      const t = await createOrGetTeam(member._affiliation ?? null, member._ligue ?? null, member.classe_de_jeu ?? null, teamIdMap, key);
      teamId = t.id;
      if (t.created && !teamsCreatedSet.has(key)) {
        teamsCreatedSet.add(key);
        teamsCreated.push({ name: t.name, category: t.categoryName, type: t.type === 'junior' ? 'Junior' : 'Actif' });
        if (!t.categoryName) teamsWithoutCategory.push(t.name);
      }
    }
    if (opts.createTeams && !teamId) playersWithoutTeam++;

    const insertPayload: Record<string, unknown> = { ...member };
    delete insertPayload._affiliation;
    delete insertPayload._ligue;
    if (teamId) insertPayload.team_id = teamId;
    insertPayload.status = opts.status;
    if (opts.groupement_id) insertPayload.groupement_id = opts.groupement_id;
    if (!insertPayload.licence_status) insertPayload.licence_status = 'actif';

    const { data: inserted, error } = await supabase
      .from('members')
      .insert([insertPayload])
      .select('id')
      .single();

    if (error || !inserted) {
      skippedReasons.push({ name: playerName, reason: `erreur d'insertion: ${error?.message ?? 'inconnue'}` });
      skipped++;
      continue;
    }

    if (teamId) {
      await supabase
        .from('team_members')
        .upsert({ team_id: teamId, member_id: inserted.id }, { onConflict: 'team_id,member_id' });
    }

    imported++;

    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return {
    imported,
    updated,
    skipped,
    skippedReasons,
    teamsCreated,
    teamsWithoutCategory,
    playersWithoutTeam,
  };
}
