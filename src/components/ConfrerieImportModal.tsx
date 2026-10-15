import { useState, useRef, useEffect } from 'react';
import { Upload, Download, X, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, Ban } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ParsedRow {
  nom: string;
  prenom: string;
  civilite: string;
  societe: string;
  email: string;
  telephone: string;
  tel_prive: string;
  tel_pro: string;
  fax: string;
  adresse: string;
  npa: string;
  localite: string;
  date_naissance: string;
  nationalite: string;
  membre_depuis: string;
  mode_facturation: 'email' | 'print' | 'package';
  sponsor_name: string;
  sponsor_id: string | null;
  asf_licence: string;
  qualifie_le: string;
  poste: string;
  ref_externe: string;
  remarques: string;
  cotisation_annuelle: number | null;
  categorie: 'member' | 'supporter';
  status: 'new' | 'duplicate' | 'error';
  statusLabel: string;
  errorReason?: string;
  warnings: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  clubId: string;
  confrerieLabel: string;
  existingMembers: { email?: string | null; first_name?: string; last_name?: string }[];
  onImportDone: () => void;
}

const TEMPLATE_HEADERS = [
  'Nom', 'Prénom', 'Civilité', 'Société', 'Email', 'Mobile',
  'Tél. privé', 'Tél. professionnel', 'Fax', 'Adresse', 'NPA', 'Localité',
  'Date de naissance', 'Nationalité', 'Membre depuis', 'Mode de facturation',
  'Sponsor', 'N° passeport ASF', 'Qualifié le', 'Poste', 'Réf. externe', 'Remarques',
  'Cotisation annuelle', 'Catégorie',
];

const HEADER_MAP: Record<string, string> = {};
function normalizeHeader(h: string): string {
  return h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}
const KNOWN: Record<string, string> = {
  nom: 'nom', prenom: 'prenom', civilite: 'civilite', societe: 'societe', entreprise: 'societe',
  email: 'email', mobile: 'telephone', telephone: 'telephone', telprive: 'tel_prive',
  telprofessionnel: 'tel_pro', fax: 'fax', adresse: 'adresse', npa: 'npa', codepostal: 'npa',
  localite: 'localite', ville: 'localite', datedenaissance: 'date_naissance', nationalite: 'nationalite',
  membredepuis: 'membre_depuis', modedefacturation: 'mode_facturation', facturation: 'mode_facturation',
  sponsor: 'sponsor', nopassportasf: 'asf_licence', passeportasf: 'asf_licence', qualifiele: 'qualifie_le',
  poste: 'poste', position: 'poste', refexterne: 'ref_externe', reference: 'ref_externe',
  remarques: 'remarques', notes: 'remarques',
  cotisationannuelle: 'cotisation_annuelle', montant: 'cotisation_annuelle',
  categorie: 'categorie', category: 'categorie',
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function parseDate(value: string): string | null {
  if (!value.trim()) return null;
  // DD.MM.YYYY or DD-MM-YYYY
  const dotMatch = value.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return null;
}

function parseMemberSince(value: string): string | null {
  if (!value.trim()) return new Date().toISOString().slice(0, 10);
  return parseDate(value);
}

function normalizeSalutation(v: string): string | null {
  const val = v.trim().toLowerCase();
  if (['monsieur', 'm.', 'mr', 'mr.'].includes(val)) return 'Monsieur';
  if (['madame', 'mme', 'mme.'].includes(val)) return 'Madame';
  if (!val) return null;
  return null;
}

function parseBillingMode(value: string, hasEmail: boolean): 'email' | 'print' | 'package' {
  const v = value.trim().toLowerCase();
  if (v === 'package') return 'package';
  if (['courrier', 'print', 'impression'].includes(v)) return 'print';
  if (v === 'email' || v === 'e-mail') return 'email';
  return hasEmail ? 'email' : 'print';
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ';') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function mapHeaders(headerLine: string): Record<number, string> {
  const cols = parseCsvLine(headerLine);
  const mapping: Record<number, string> = {};
  cols.forEach((h, i) => {
    const norm = normalizeHeader(h);
    if (KNOWN[norm]) mapping[i] = KNOWN[norm];
  });
  return mapping;
}

export default function ConfrerieImportModal({ open, onClose, clubId, confrerieLabel, existingMembers, onImportDone }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: number; warnings: string[] } | null>(null);
  const [sponsorList, setSponsorList] = useState<{id: string; company_name: string}[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      supabase.from('sponsors').select('id, company_name').eq('active', true).order('company_name').then(({ data }) => {
        if (data) setSponsorList(data);
      });
    }
  }, [open]);

  if (!open) return null;

  const isDuplicate = (nom: string, prenom: string, email: string) => {
    const emailLower = email.toLowerCase().trim();
    if (emailLower) return existingMembers.some(m => m.email?.toLowerCase().trim() === emailLower);
    return existingMembers.some(
      m => m.last_name?.toLowerCase().trim() === nom.toLowerCase().trim() &&
           m.first_name?.toLowerCase().trim() === prenom.toLowerCase().trim()
    );
  };

  const findSponsor = (name: string): { id: string | null; warning: string | null } => {
    if (!name.trim()) return { id: null, warning: null };
    const lower = name.trim().toLowerCase();
    const match = sponsorList.find(s => s.company_name.toLowerCase() === lower);
    if (match) return { id: match.id, warning: null };
    return { id: null, warning: `Sponsor introuvable : ${name.trim()}` };
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = stripBom(ev.target?.result as string);
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { setRows([]); return; }

      const headerMapping = mapHeaders(lines[0]);
      const parsed: ParsedRow[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const get = (field: string) => {
          for (const [idx, f] of Object.entries(headerMapping)) {
            if (f === field) return (cols[Number(idx)] || '').trim();
          }
          return '';
        };

        const nom = get('nom');
        const prenom = get('prenom');
        if (!nom && !prenom) continue;

        const warnings: string[] = [];

        if (!nom || !prenom) {
          parsed.push({
            nom, prenom, civilite: '', societe: '', email: '', telephone: '', tel_prive: '', tel_pro: '', fax: '',
            adresse: '', npa: '', localite: '', date_naissance: '', nationalite: '',
            membre_depuis: '', mode_facturation: 'email', sponsor_name: '', sponsor_id: null,
            asf_licence: '', qualifie_le: '', poste: '', ref_externe: '', remarques: '',
            cotisation_annuelle: null, categorie: 'member',
            status: 'error', statusLabel: 'Erreur', errorReason: !nom ? 'Nom manquant' : 'Prénom manquant', warnings,
          });
          continue;
        }

        const email = get('email');
        const membre_depuis = parseMemberSince(get('membre_depuis'));
        if (membre_depuis === null) {
          parsed.push({
            nom, prenom, civilite: '', societe: '', email, telephone: '', tel_prive: '', tel_pro: '', fax: '',
            adresse: '', npa: '', localite: '', date_naissance: '', nationalite: '',
            membre_depuis: '', mode_facturation: 'email', sponsor_name: '', sponsor_id: null,
            asf_licence: '', qualifie_le: '', poste: '', ref_externe: '', remarques: '',
            cotisation_annuelle: null, categorie: 'member',
            status: 'error', statusLabel: 'Erreur', errorReason: `Date invalide: "${get('membre_depuis')}"`, warnings,
          });
          continue;
        }

        const civiliteRaw = get('civilite');
        const civilite = normalizeSalutation(civiliteRaw) || '';
        if (civiliteRaw && !civilite) warnings.push(`Civilité non reconnue : ${civiliteRaw}`);

        const birthRaw = get('date_naissance');
        let date_naissance = '';
        if (birthRaw) {
          const parsed_bd = parseDate(birthRaw);
          if (parsed_bd) date_naissance = parsed_bd;
          else warnings.push(`Date de naissance invalide : ${birthRaw}`);
        }

        const qualifRaw = get('qualifie_le');
        let qualifie_le = '';
        if (qualifRaw) {
          const parsed_q = parseDate(qualifRaw);
          if (parsed_q) qualifie_le = parsed_q;
          else warnings.push(`Date qualification invalide : ${qualifRaw}`);
        }

        const modeRaw = get('mode_facturation');
        const mode_facturation = parseBillingMode(modeRaw, !!email);
        const sponsorRaw = get('sponsor');
        const sponsorResult = findSponsor(sponsorRaw);
        if (sponsorResult.warning) warnings.push(sponsorResult.warning);

        if (isDuplicate(nom, prenom, email)) {
          parsed.push({
            nom, prenom, civilite, societe: get('societe'), email, telephone: get('telephone'),
            tel_prive: get('tel_prive'), tel_pro: get('tel_pro'), fax: get('fax'),
            adresse: get('adresse'), npa: get('npa'), localite: get('localite'),
            date_naissance, nationalite: get('nationalite'), membre_depuis,
            mode_facturation, sponsor_name: sponsorRaw, sponsor_id: sponsorResult.id,
            asf_licence: get('asf_licence'), qualifie_le, poste: get('poste'),
            ref_externe: get('ref_externe'), remarques: get('remarques'),
            cotisation_annuelle: get('cotisation_annuelle') ? Number(get('cotisation_annuelle')) || null : null,
            categorie: get('categorie').toLowerCase() === 'supporter' ? 'supporter' as const : 'member' as const,
            status: 'duplicate', statusLabel: 'Doublon (ignoré)', warnings,
          });
          continue;
        }

        parsed.push({
          nom, prenom, civilite, societe: get('societe'), email, telephone: get('telephone'),
          tel_prive: get('tel_prive'), tel_pro: get('tel_pro'), fax: get('fax'),
          adresse: get('adresse'), npa: get('npa'), localite: get('localite'),
          date_naissance, nationalite: get('nationalite'), membre_depuis,
          mode_facturation, sponsor_name: sponsorRaw, sponsor_id: sponsorResult.id,
          asf_licence: get('asf_licence'), qualifie_le, poste: get('poste'),
          ref_externe: get('ref_externe'), remarques: get('remarques'),
          cotisation_annuelle: get('cotisation_annuelle') ? Number(get('cotisation_annuelle')) || null : null,
          categorie: get('categorie').toLowerCase() === 'supporter' ? 'supporter' as const : 'member' as const,
          status: 'new', statusLabel: 'Nouveau', warnings,
        });
      }
      setRows(parsed);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const validRows = rows.filter(r => r.status === 'new');
  const duplicateCount = rows.filter(r => r.status === 'duplicate').length;
  const errorCount = rows.filter(r => r.status === 'error').length;
  const allWarnings = rows.flatMap(r => r.warnings);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    let imported = 0;
    let importErrors = 0;
    const rowWarnings = [...allWarnings];

    for (let idx = 0; idx < validRows.length; idx++) {
      const r = validRows[idx];
      const csvLineNum = rows.indexOf(r) + 2;
      const { error } = await supabase.from('confrerie_members').insert({
        club_id: clubId,
        last_name: r.nom,
        first_name: r.prenom,
        salutation: r.civilite || null,
        company: r.societe || null,
        email: r.email || null,
        phone: r.telephone || null,
        phone_private: r.tel_prive || null,
        phone_pro: r.tel_pro || null,
        fax: r.fax || null,
        address: r.adresse || null,
        postal_code: r.npa || null,
        city: r.localite || null,
        birth_date: r.date_naissance || null,
        nationality: r.nationalite || null,
        member_since: r.membre_depuis,
        billing_mode: r.mode_facturation,
        sponsor_id: r.sponsor_id,
        asf_licence_number: r.asf_licence || null,
        qualified_at: r.qualifie_le || null,
        position: r.poste || null,
        external_ref: r.ref_externe || null,
        notes: r.remarques || null,
        annual_amount: r.cotisation_annuelle,
        category: r.categorie,
        active: true,
      });

      if (error) {
        importErrors++;
        rowWarnings.push(`Ligne ${csvLineNum} (${r.prenom} ${r.nom}) : ${error.message}`);
      } else {
        imported++;
      }
    }

    setImporting(false);
    setResult({ imported, duplicates: duplicateCount, errors: errorCount + importErrors, warnings: rowWarnings });
    if (imported > 0) onImportDone();
  };

  const downloadTemplate = () => {
    const csv = '﻿' + TEMPLATE_HEADERS.map(h => `"${h}"`).join(';') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele_import_confrerie.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetAndClose = () => {
    setRows([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Importer des membres — {confrerieLabel}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Fichier CSV avec séparateur point-virgule (;) — en-têtes détectés automatiquement
            </p>
          </div>
          <button onClick={resetAndClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity hover:opacity-80"
              style={{ background: 'var(--primary)', color: 'white' }}
            >
              <Upload size={16} />
              Choisir un fichier CSV
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            </label>
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              style={{ color: 'var(--primary)' }}
            >
              <Download size={14} />
              Télécharger le modèle CSV
            </button>
          </div>

          {result && (
            <div>
              <div
                className="rounded-lg px-4 py-3 text-sm font-medium"
                style={{
                  background: result.imported > 0 ? 'var(--success-soft, #ecfdf5)' : 'var(--warning-soft, #fffbeb)',
                  color: result.imported > 0 ? 'var(--success-text, #065f46)' : 'var(--warning-text, #92400e)',
                }}
              >
                {result.imported} importé{result.imported > 1 ? 's' : ''} · {result.duplicates} doublon{result.duplicates > 1 ? 's' : ''} ignoré{result.duplicates > 1 ? 's' : ''} · {result.errors} erreur{result.errors > 1 ? 's' : ''}
              </div>
              {result.warnings.length > 0 && (
                <div className="mt-2 rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--warning-soft, #fffbeb)', color: 'var(--warning-text, #92400e)' }}>
                  <p className="font-medium mb-1">Avertissements :</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {rows.length > 0 && !result && (
            <>
              {allWarnings.length > 0 && (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--warning-soft, #fffbeb)', color: 'var(--warning-text, #92400e)' }}>
                  <p className="font-medium mb-1">Avertissements :</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {allWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary, #f9fafb)' }}>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Statut</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Nom</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Prénom</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Société</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Email</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Facturation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: 'var(--border-color)' }}>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            row.status === 'new' ? 'bg-green-100 text-green-700' :
                            row.status === 'duplicate' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {row.status === 'new' && <CheckCircle2 size={12} />}
                            {row.status === 'duplicate' && <Ban size={12} />}
                            {row.status === 'error' && <AlertCircle size={12} />}
                            {row.statusLabel}
                          </span>
                          {row.errorReason && (
                            <span className="block text-xs mt-0.5 text-red-600">{row.errorReason}</span>
                          )}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{row.nom}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{row.prenom}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{row.societe || '—'}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{row.email || '—'}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{row.mode_facturation === 'package' ? 'Package' : row.mode_facturation === 'print' ? 'Courrier' : 'E-mail'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {rows.length === 0 && !result && (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              Sélectionnez un fichier CSV pour voir l'aperçu avant import.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {rows.length > 0 && !result && (
              <span>{validRows.length} nouveau{validRows.length > 1 ? 'x' : ''} · {duplicateCount} doublon{duplicateCount > 1 ? 's' : ''} · {errorCount} erreur{errorCount > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={resetAndClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {result ? 'Fermer' : 'Annuler'}
            </button>
            {!result && rows.length > 0 && (
              <button
                onClick={handleImport}
                disabled={validRows.length === 0 || importing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ background: 'var(--primary)' }}
              >
                <Upload size={16} />
                {importing ? 'Import en cours...' : `Importer ${validRows.length} membre${validRows.length > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
