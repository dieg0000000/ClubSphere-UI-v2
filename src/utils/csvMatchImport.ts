import { supabase } from '../lib/supabase';


export interface CSVMatchRow {
  'Genre de match': string;
  'Statut de match': string;
  'Désignation': string;
  'No de match': string;
  'Jour': string;
  'Date': string;
  'Heure': string;
  'EquipeA': string;
  'Ligue équipe A': string;
  'No de club A': string;
  'EquipeB': string;
  'Ligue équipe B': string;
  'No de club B': string;
  'Lieu de match': string;
  'Installation sportive': string;
  'Lieu': string;
  'Terrain de jeu': string;
}

export interface ParsedMatch {
  matchNumber: string;
  designation: string;
  matchType: 'championnat' | 'tournoi' | 'amical';
  matchDate: string;
  matchTime: string | null;
  ourTeam: string;
  ourLigue: string;
  opponentName: string;
  isHome: boolean;
  venueName: string;
  venueCity: string;
  venueField: string;
  fullAddress: string;
  status: 'planifié' | 'à confirmer';
  teamId?: string;
  teamNotRecognized?: boolean;
}

const LIGUE_CATEGORY_MAP: Array<{ code: string; patterns: string[] }> = [
  { code: 'Sen.50+', patterns: ['Seniors 50+'] },
  { code: 'Sen.40+', patterns: ['Seniors 40+'] },
  { code: 'Sen.30+/C', patterns: ['Seniors 30+ champion'] },
  { code: 'Sen.30+/E', patterns: ['Seniors 30+ élite'] },
  { code: 'Sen.30+', patterns: ['Seniors 30+'] },
  { code: 'Jun.D-9 ER', patterns: ['Juniors D Elite', 'D-9 Élite Régionale'] },
  { code: 'Jun.D-9', patterns: ['Juniors D-9'] },
  { code: 'Jun.D-7', patterns: ['Juniors D-7'] },
  { code: 'Jun.E', patterns: ['Juniors E'] },
  { code: 'YL C', patterns: ['Juniors C Youth League'] },
  { code: 'Jun.C P', patterns: ['Juniors C promotion'] },
  { code: 'Jun.C', patterns: ['Juniors C'] },
  { code: 'YL B', patterns: ['Juniors B Youth League'] },
  { code: 'Jun.B P', patterns: ['Juniors B promotion'] },
  { code: 'Jun.B', patterns: ['Juniors B'] },
  { code: 'YL A', patterns: ['Juniors A Youth League'] },
  { code: 'Jun.A P', patterns: ['Juniors A promotion'] },
  { code: 'Jun.A', patterns: ['Juniors A'] },
  { code: 'Jun.D', patterns: ['Juniors D'] },
  { code: 'Jun.G', patterns: ['Juniors G'] },
  { code: 'Jun.F', patterns: ['Catégorie F', 'Juniors F'] },
  { code: 'FF-17 2/S', patterns: ['FF-17 2ème degré', 'FF-17'] },
  { code: 'FF-17', patterns: ['FF-17'] },
  { code: 'PL', patterns: ['Promotion League'] },
  { code: '2e Int.', patterns: ['2e ligue interrégionale', '2ème ligue interrégionale'] },
  { code: '1e', patterns: ['1e ligue', '1ère ligue'] },
  { code: '2e', patterns: ['2e ligue', '2ème ligue'] },
  { code: '3e', patterns: ['3e ligue', '3ème ligue'] },
  { code: '4e', patterns: ['4e ligue', '4ème ligue'] },
  { code: '5e', patterns: ['5e ligue', '5ème ligue'] },
];

function mapLigueToCategoryPatterns(ligue: string): string[] {
  if (!ligue) return [];
  const trimmed = ligue.trim();
  for (const entry of LIGUE_CATEGORY_MAP) {
    if (trimmed.startsWith(entry.code) || trimmed === entry.code) {
      return entry.patterns;
    }
  }
  return [];
}

function extractRomanNumeral(name: string): string | null {
  const m = name.match(/\s(I{1,3}|IV|V|VI{0,3})\b/);
  if (m) return m[1];
  const m2 = name.match(/\s([12345])\b/);
  if (m2) {
    const arabicToRoman: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' };
    return arabicToRoman[m2[1]];
  }
  return null;
}

function extractClubPart(teamName: string): string {
  let s = teamName.replace(/\s*-\s*.*$/, '');
  s = s.replace(/\s+(I{1,3}|IV|V|VI{0,3})\s*$/, '');
  s = s.replace(/\s+[12345]\s*$/, '');
  return s.trim();
}

export interface ImportProgress {
  current: number;
  total: number;
  added: number;
  existing: number;
  skipped: number;
}

export interface ImportOptions {
  onProgress?: (progress: ImportProgress) => void;
}

export interface ImportSummary {
  imported: number;
  existing: number;
  skipped: number;
  unrecognizedTeams: string[];
}

export function parseCSV(csvContent: string): CSVMatchRow[] {
  console.log('parseCSV called, content length:', csvContent.length);

  // Handle Windows line endings
  const lines = csvContent.trim().split(/\r?\n/).filter(line => line.trim());
  console.log('Total lines:', lines.length);

  if (lines.length < 2) {
    console.warn('CSV has less than 2 lines');
    return [];
  }

  // Parse CSV line properly handling quoted values
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ';' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add the last value
    values.push(current.trim());

    return values;
  };

  // Parse headers
  const headers = parseLine(lines[0]);
  console.log('Headers found:', headers.length);
  console.log('First 5 headers:', headers.slice(0, 5));

  const rows: CSVMatchRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);

    if (values.length === 0 || (values.length === 1 && values[0] === '')) {
      console.log(`Skipping empty line ${i}`);
      continue;
    }

    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row as CSVMatchRow);
  }

  console.log('Parsed rows:', rows.length);
  if (rows.length > 0) {
    console.log('First row sample:', {
      'No de match': rows[0]['No de match'],
      'Date': rows[0]['Date'],
      'EquipeA': rows[0]['EquipeA'],
      'No de club A': rows[0]['No de club A']
    });
  }

  return rows;
}

function parseDateFromCSV(dateStr: string): string | null {
  if (!dateStr) return null;

  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseTimeFromCSV(timeStr: string): string | null {
  if (!timeStr || timeStr.trim() === '') return null;

  const cleanTime = timeStr.trim();
  if (!/^\d{1,2}:\d{2}$/.test(cleanTime)) return null;

  return cleanTime;
}

function determineMatchType(designation: string | undefined): 'championnat' | 'tournoi' | 'amical' {
  if (!designation) return 'championnat';
  const lower = designation.toLowerCase();
  if (lower.includes('tournoi')) return 'tournoi';
  if (lower.includes('amical')) return 'amical';
  return 'championnat';
}

export async function parseMatchesFromCSV(csvRows: CSVMatchRow[]): Promise<ParsedMatch[]> {
  console.log('parseMatchesFromCSV called with', csvRows.length, 'rows');
  const parsedMatches: ParsedMatch[] = [];

  // Récupérer le numéro ASF du club depuis la configuration
  const { data: clubSettings } = await supabase
    .from('club_settings')
    .select('club_asf_number')
    .single();

  const CLUB_NUMBER = clubSettings?.club_asf_number?.toString().trim() || '';
  console.log('Club ASF number from settings:', CLUB_NUMBER);

  if (!CLUB_NUMBER) {
    console.error('Aucun numéro ASF configuré dans club_settings');
    return [];
  }

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .eq('active', true);

  console.log('Found', teams?.length || 0, 'active teams in database');

  let skippedCount = 0;
  for (const row of csvRows) {
    const clubA = row['No de club A'];
    const clubB = row['No de club B'];

    if (clubA !== CLUB_NUMBER && clubB !== CLUB_NUMBER) {
      skippedCount++;
      continue;
    }

    console.log('Processing match:', row['No de match'], '-', row['EquipeA'], 'vs', row['EquipeB']);

    const isHome = clubA === CLUB_NUMBER;
    const ourTeam = isHome ? row['EquipeA'] : row['EquipeB'];
    const ourLigue = isHome ? row['Ligue équipe A'] : row['Ligue équipe B'];
    const opponentName = isHome ? row['EquipeB'] : row['EquipeA'];

    if (!ourTeam || !opponentName) {
      console.warn('Skipping match with missing team names');
      continue;
    }

    const matchDate = parseDateFromCSV(row['Date']);
    if (!matchDate) {
      console.warn('Skipping match with invalid date:', row['Date']);
      continue;
    }

    const matchTime = parseTimeFromCSV(row['Heure']);
    const status = matchTime ? 'planifié' : 'à confirmer';

    const matchType = determineMatchType(row['Désignation']);
    const finalOpponentName = matchType === 'tournoi' ? 'Tournoi multi-équipes' : opponentName;

    const venueName = row['Installation sportive'] || '';
    const venueCity = row['Lieu'] || '';
    const venueField = row['Terrain de jeu'] || '';
    const fullAddress = `${venueName}${venueCity ? ', ' + venueCity : ''}${venueField ? ' - ' + venueField : ''}`;

    const teamMatch = findMatchingTeam(ourTeam, ourLigue, teams || []);

    parsedMatches.push({
      matchNumber: row['No de match'],
      designation: row['Désignation'],
      matchType,
      matchDate,
      matchTime,
      ourTeam,
      ourLigue,
      opponentName: finalOpponentName,
      isHome,
      venueName,
      venueCity,
      venueField,
      fullAddress,
      status,
      teamId: teamMatch?.id,
      teamNotRecognized: !teamMatch,
    });
  }

  console.log('Parsing summary:');
  console.log('- Total CSV rows:', csvRows.length);
  console.log('- Skipped (not our club):', skippedCount);
  console.log('- Matches for our club:', parsedMatches.length);

  return parsedMatches;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+]/g, '');
}

function findMatchingTeam(teamName: string | undefined, ligue: string | undefined, teams: any[]): any | null {
  if (!teamName) return null;

  const clubPart = extractClubPart(teamName);
  const normalizedClub = normalize(clubPart);
  const csvRoman = extractRomanNumeral(teamName);
  const categoryPatterns = mapLigueToCategoryPatterns(ligue || '');

  const candidates = teams.filter(t => {
    if (!t.name) return false;
    const normTeam = normalize(t.name);
    const clubMatches = normTeam.startsWith(normalizedClub) || normTeam.includes(normalizedClub);
    if (!clubMatches) return false;

    if (categoryPatterns.length > 0) {
      return categoryPatterns.some(p => t.name.toLowerCase().includes(p.toLowerCase()));
    }
    return true;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (csvRoman) {
    const withRoman = candidates.find(t => {
      const r = extractRomanNumeral(t.name);
      return r === csvRoman;
    });
    if (withRoman) return withRoman;
  } else {
    const withoutRoman = candidates.find(t => !extractRomanNumeral(t.name));
    if (withoutRoman) return withoutRoman;
  }

  return candidates[0];
}

export async function importMatchesToDatabase(
  matches: ParsedMatch[],
  seasonId: string,
  opts?: ImportOptions
): Promise<ImportSummary> {
  let added = 0;
  let existing = 0;
  let skipped = 0;
  const total = matches.length;
  const unrecognizedTeams = new Set<string>();

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];

    if (match.teamNotRecognized) {
      unrecognizedTeams.add(`${match.designation} (${match.ourTeam})`);
      skipped++;
      opts?.onProgress?.({ current: i + 1, total, added, existing, skipped });
      continue;
    }

    let venueId = null;
    if (match.venueName) {
      const { data: existingVenue } = await supabase
        .from('venues')
        .select('id')
        .eq('name', match.venueName)
        .maybeSingle();

      if (existingVenue) {
        venueId = existingVenue.id;
      } else {
        const { data: newVenue } = await supabase
          .from('venues')
          .insert({
            name: match.venueName,
            city: match.venueCity,
            field_name: match.venueField,
            full_address: match.fullAddress,
          })
          .select('id')
          .single();

        if (newVenue) {
          venueId = newVenue.id;
        }
      }
    }

    const { data: existingMatch } = await supabase
      .from('matches')
      .select('id')
      .eq('match_number', match.matchNumber)
      .maybeSingle();

    const alreadyExists = !!existingMatch;

    const { error } = await supabase.from('matches').upsert({
      match_number: match.matchNumber,
      team_id: match.teamId,
      season_id: seasonId,
      match_date: match.matchDate,
      match_time: match.matchTime,
      opponent_name: match.opponentName,
      is_home: match.isHome,
      venue_id: venueId,
      status: match.status,
      match_type: match.matchType,
      designation: match.designation,
      imported_from_csv: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'match_number' });

    if (error) {
      console.error('Error importing match:', error);
      skipped++;
    } else if (alreadyExists) {
      existing++;
    } else {
      added++;
    }

    opts?.onProgress?.({ current: i + 1, total, added, existing, skipped });
  }

  return {
    imported: added,
    existing,
    skipped,
    unrecognizedTeams: Array.from(unrecognizedTeams),
  };
}
