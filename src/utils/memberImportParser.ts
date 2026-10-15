import * as XLSX from 'xlsx';
import {
  ParsedRow,
  parseDateFlexible,
  cleanClasseDeJeu,
  sanitizePosition,
  getGenderFromSalutation,
  normalizeGender,
  normalizeLicenceStatus,
  sanitizeJsNumber,
} from './memberImport';
import { normalizePhone } from './phoneHelpers';

const ALIASES: Record<string, string[]> = {
  first_name: ['Prénom', 'Prenom', 'First name', 'first_name', 'First Name'],
  last_name: ['Nom', 'Last name', 'last_name', 'Last Name', 'Nom de famille'],
  second_name: ['Deuxième nom', 'Deuxieme nom', 'Second name'],
  birth_date: ['Date de naissance', 'Birth date', 'birth_date', 'Naissance'],
  nationality: ['Nationalité', 'Nationalite', 'Nationality'],
  football_nationality: ['Nationalité football', 'Football nationality'],
  country: ['Pays', 'Country'],
  pseudonym: ['Pseudonyme', 'Pseudonym', 'Nickname'],
  salutation: ['Salutation', 'Titre'],
  gender_direct: ['Sexe', 'Gender', 'gender', 'Genre'],
  avs_number: ['Numéro AVS', 'Numero AVS', 'AVS', 'avs_number', 'N° AVS'],
  asf_licence: [
    'Numéro de passeport', 'Numero de passeport', 'N° de passeport', 'Passeport',
    'Numéro de licence', 'Numero de licence', 'Numéro de licence ASF', 'Licence ASF',
    'asf_licence_number',
  ],
  email: ['Courriel privé', 'Courriel prive', 'Email', 'E-Mail', 'email', 'Email privé'],
  email_pro: ["Courriel d'entreprise", 'Courriel professionnel', 'Email pro', 'Work email'],
  phone: ['Téléphone portable', 'Telephone portable', 'Mobile', 'Téléphone', 'Telephone', 'Phone', 'phone'],
  phone_private: ['Téléphone privé', 'Telephone prive', 'Home phone'],
  address: ['Adresse', 'Address', 'Rue'],
  address2: ['Adresse supplémentaire', 'Adresse supplementaire', 'Address 2'],
  postal_code: ['Code postal', 'NPA', 'Postal code', 'Zip'],
  city: ['Lieu', 'Ville', 'City'],
  canton: ['Canton'],
  js_number: ['Numéro J+S', 'Numero J+S', 'J+S', 'js_number'],
  licence_status: ['Statut', 'Status'],
  position: ['Position'],
  qualification_type: ['Type de qualification', 'Qualification'],
  qualified_from: ['Qualifié dès le', 'Qualifie des le', 'Qualified from'],
  qualified_until: ['Qualifié à', 'Qualifie a', 'Qualified until'],
  legal_rep1_email: ['E-Mail parents', 'Email parents', 'Email représentant légal'],
  legal_rep2_email: ['E-Mail parents 2', 'Email parents 2', 'Email représentant légal 2'],
  legal_rep1_phone: ['Tél. portable représentant légal', 'Tel portable representant legal', 'Phone legal rep'],
  legal_rep2_phone: ['Tél. portable représentant légal 2', 'Tel portable representant legal 2'],
  legal_rep1_full: ['Nom/prénom représentant légal', 'Nom/prenom representant legal'],
  legal_rep2_full: ['Nom/prénom représentant légal 2', 'Nom/prenom representant legal 2'],
  affiliation_date: ['Affiliation dès le', 'Affiliation des le', 'Affiliation date'],
  club_origine: ["Club d'origine", 'Club origine', 'origin_club_name', 'Club d origine'],
  classe_de_jeu: ['Classe de jeu', 'Play class'],
  remarques_club: ['Remarques du club', 'Club remarks', 'Notes club'],
  affiliation: ['Affiliation'],
  ligue: ['Ligue', 'League'],
  licence_chez: ['Licence chez', 'Licence chez club', 'ASF licence chez', 'Club licence'],
};

type Aliases = typeof ALIASES;
type CanonicalKey = keyof Aliases;

function pick(row: Record<string, unknown>, key: CanonicalKey): unknown {
  const names = ALIASES[key];
  for (const name of names) {
    const match = Object.keys(row).find(h => h.toLowerCase().trim() === name.toLowerCase().trim());
    if (match && row[match] !== null && row[match] !== undefined && String(row[match]).trim() !== '') {
      return row[match];
    }
  }
  return null;
}

function splitAddress(raw: string | null | undefined): { street: string | null; number: string | null } {
  if (!raw) return { street: null, number: null };
  const s = String(raw).trim();
  const m = s.match(/^(.*?)\s+(\d+\s*[a-zA-Z]?)$/);
  if (m) return { street: m[1].trim(), number: m[2].trim() };
  return { street: s || null, number: null };
}

function splitLegalRepName(value: unknown): { firstname: string | null; lastname: string | null } {
  if (!value) return { firstname: null, lastname: null };
  const trimmed = String(value).trim();
  if (!trimmed) return { firstname: null, lastname: null };

  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',', 2);
    return {
      lastname: last?.trim() || null,
      firstname: first?.trim() || null,
    };
  }

  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    return { lastname: parts[0], firstname: null };
  }

  const hyphenIdx = parts.findIndex(p => p.includes('-'));
  if (hyphenIdx !== -1) {
    const firstname = parts[hyphenIdx];
    const lastname = parts.filter((_, i) => i !== hyphenIdx).join(' ');
    return { firstname, lastname: lastname || null };
  }

  const firstname = parts[parts.length - 1];
  const lastname = parts.slice(0, -1).join(' ');
  return { firstname, lastname };
}

function mapRow(row: Record<string, unknown>): ParsedRow | null {
  const first = pick(row, 'first_name');
  const last = pick(row, 'last_name');
  if (!first || !last) return null;

  const addressRaw = pick(row, 'address') as string | null;
  const { street, number } = splitAddress(addressRaw);

  const rep1 = splitLegalRepName(pick(row, 'legal_rep1_full'));
  const rep2 = splitLegalRepName(pick(row, 'legal_rep2_full'));

  const salutation = pick(row, 'salutation') as string | null;
  const genderDirect = pick(row, 'gender_direct');
  const gender = normalizeGender(genderDirect) ?? getGenderFromSalutation(salutation);

  const strOrNull = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s || null;
  };

  return {
    first_name: String(first).trim(),
    last_name: String(last).trim(),
    second_name: strOrNull(pick(row, 'second_name')),
    birth_date: parseDateFlexible(pick(row, 'birth_date')),
    nationality: strOrNull(pick(row, 'nationality')),
    football_nationality: strOrNull(pick(row, 'football_nationality')),
    country: strOrNull(pick(row, 'country')) ?? 'CH',
    pseudonym: strOrNull(pick(row, 'pseudonym')),
    salutation,
    gender,
    avs_number: strOrNull(pick(row, 'avs_number')),
    asf_licence_number: strOrNull(pick(row, 'asf_licence')),
    email: strOrNull(pick(row, 'email')),
    email_pro: strOrNull(pick(row, 'email_pro')),
    phone: normalizePhone(strOrNull(pick(row, 'phone'))),
    phone_private: normalizePhone(strOrNull(pick(row, 'phone_private'))),
    address: street,
    street_number: number,
    address2: strOrNull(pick(row, 'address2')),
    postal_code: strOrNull(pick(row, 'postal_code')),
    city: strOrNull(pick(row, 'city')),
    canton: strOrNull(pick(row, 'canton')),
    js_number: sanitizeJsNumber(strOrNull(pick(row, 'js_number'))),
    licence_status: normalizeLicenceStatus(strOrNull(pick(row, 'licence_status'))),
    position: sanitizePosition(strOrNull(pick(row, 'position'))),
    qualification_type: strOrNull(pick(row, 'qualification_type')),
    qualified_from: parseDateFlexible(pick(row, 'qualified_from')),
    qualified_until: parseDateFlexible(pick(row, 'qualified_until')),
    legal_rep1_email: strOrNull(pick(row, 'legal_rep1_email')),
    legal_rep2_email: strOrNull(pick(row, 'legal_rep2_email')),
    legal_rep1_phone: normalizePhone(strOrNull(pick(row, 'legal_rep1_phone'))),
    legal_rep2_phone: normalizePhone(strOrNull(pick(row, 'legal_rep2_phone'))),
    legal_rep1_firstname: rep1.firstname,
    legal_rep1_lastname: rep1.lastname,
    legal_rep2_firstname: rep2.firstname,
    legal_rep2_lastname: rep2.lastname,
    affiliation_date: parseDateFlexible(pick(row, 'affiliation_date')),
    club_origine: strOrNull(pick(row, 'club_origine')),
    classe_de_jeu: cleanClasseDeJeu(strOrNull(pick(row, 'classe_de_jeu'))),
    remarques_club: strOrNull(pick(row, 'remarques_club')),
    licence_chez: strOrNull(pick(row, 'licence_chez')),
    _affiliation: strOrNull(pick(row, 'affiliation')),
    _ligue: strOrNull(pick(row, 'ligue')),
  };
}

function needsLatin1Decode(utf8: string): boolean {
  // UTF-8 bytes read as Latin-1 produce "Ã©", "Ã¨", "Ã "
  if (/Ã[-¿©¨ ]/.test(utf8) || /Ã©|Ã¨|Ã /.test(utf8)) return true;
  // Latin-1 bytes decoded as UTF-8 produce replacement characters
  if (utf8.includes('�')) return true;
  return false;
}

function decodeText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!needsLatin1Decode(utf8)) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(buf);
  } catch {
    return utf8;
  }
}

function detectSeparator(headerLine: string): string {
  const candidates = [';', ',', '\t'];
  let best = ';';
  let bestCount = 0;
  for (const c of candidates) {
    const count = headerLine.split(c).length;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

function splitCsvLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsvText(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/);
  if (lines.length === 0) return [];
  const sep = detectSeparator(lines[0]);
  const headers = splitCsvLine(lines[0], sep);
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitCsvLine(lines[i], sep);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? null; });
    out.push(row);
  }
  return out;
}

export async function parseImportFile(file: File): Promise<ParsedRow[]> {
  console.log('[parseImportFile] file received:', file.name, 'size:', file.size, 'type:', file.type);
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  let jsonRows: Record<string, unknown>[];

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
  } else {
    const text = decodeText(buf);
    console.log('[parseImportFile] decoded text (first 300 chars):', text.substring(0, 300));
    jsonRows = parseCsvText(text);
  }

  console.log('[parseImportFile] raw rows parsed:', jsonRows.length);
  if (jsonRows.length > 0) {
    console.log('[parseImportFile] headers:', Object.keys(jsonRows[0]));
    console.log('[parseImportFile] first raw row:', jsonRows[0]);
  }

  const parsed: ParsedRow[] = [];
  for (const r of jsonRows) {
    const m = mapRow(r);
    if (m) parsed.push(m);
  }
  console.log('[parseImportFile] mapped rows (with first_name+last_name):', parsed.length);
  return parsed;
}
