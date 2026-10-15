import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Upload, Users, TriangleAlert as AlertTriangle, Check } from 'lucide-react';
// parseImportFile is loaded dynamically to keep xlsx out of the main chunk
import { importMembers, ParsedRow, ImportResult } from '../utils/memberImport';
import Button from './ui/Button';
import { Alert } from './ui/Alert';

interface Groupement {
  id: string;
  name: string;
  category_type: string;
  managing_club_asf_number: string | null;
  groupement_clubs?: { club_asf_number: string; club_name: string; is_managing: boolean }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function GroupementImportModal({ isOpen, onClose, onImported }: Props) {
  const [groupements, setGroupements] = useState<Groupement[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; phase: string; playerName?: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRows([]);
    setResult(null);
    setError(null);
    setSelectedId('');
    setProgress(null);
    (async () => {
      const { data } = await supabase
        .from('groupements')
        .select('id, name, category_type, managing_club_asf_number, groupement_clubs(*)')
        .order('created_at', { ascending: false });
      setGroupements((data as Groupement[]) ?? []);
    })();
  }, [isOpen]);

  const selected = useMemo(
    () => groupements.find(g => g.id === selectedId) ?? null,
    [groupements, selectedId]
  );

  const handleFile = async (file: File) => {
    console.log('[GroupementImport] handleFile called, file:', file.name, 'size:', file.size);
    setError(null);
    try {
      const { parseImportFile } = await import('../utils/memberImportParser');
      const parsed = await parseImportFile(file);
      console.log('[GroupementImport] parseImportFile returned', parsed.length, 'rows');
      const enriched = parsed.map(r => {
        const partner = selected?.groupement_clubs?.find(
          c => r.club_origine && c.club_name.toLowerCase() === (r.club_origine ?? '').toLowerCase()
        );
        return {
          ...r,
          licence_chez: r.licence_chez ?? partner?.club_name ?? r.club_origine ?? null,
        };
      });
      console.log('[GroupementImport] enriched rows:', enriched.length);
      setRows(enriched);
    } catch (e) {
      console.error('[GroupementImport] handleFile error:', e);
      setError('Impossible de lire le fichier : ' + (e as Error).message);
    }
  };

  const confirmImport = async () => {
    if (!selected || rows.length === 0) return;
    setImporting(true);
    setProgress({ current: 0, total: rows.length, phase: 'Démarrage...' });

    const res = await importMembers(rows, {
      status: 'groupement',
      groupement_id: selected.id,
      createTeams: false,
      onProgress: (p) => setProgress(p),
    });

    setImporting(false);
    setResult(res);
    if (res.imported > 0 || res.updated > 0) onImported();
  };

  if (!isOpen) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ color: 'var(--text-modal-header)', fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users className="w-5 h-5" /> Importer des joueurs (groupement)
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-modal-header)', cursor: 'pointer' }} className="hover:opacity-80">
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div style={{ padding: '12px 0 4px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Check className="w-10 h-10" style={{ color: 'var(--success-text)', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>Import terminé</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <StatCard label="Importés" value={result.imported} color="var(--success-text)" />
              <StatCard label="Mis à jour" value={result.updated} color="var(--info-text)" />
              <StatCard label="Ignorés" value={result.skipped} color="var(--warning-text)" />
            </div>

            {result.skippedReasons.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Alert variant="warning" title={`Lignes ignorées (${result.skippedReasons.length})`}>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                      {result.skippedReasons.map((s, i) => (
                        <li key={i}>
                          <strong>{s.name}</strong> — {s.reason}
                          {s.matchField && <span style={{ opacity: 0.7 }}> ({s.matchField})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Alert>
              </div>
            )}

            <div style={{ textAlign: 'right' }}>
              <Button variant="primary" size="sm" onClick={onClose}>Fermer</Button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={labelStyle}>Groupement *</label>
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={inputStyle}>
                <option value="">— Sélectionner —</option>
                {groupements.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            {selected && (
              <Alert variant="info" title="Clubs du groupement">
                {(selected.groupement_clubs ?? []).map(c => c.club_name).join(', ')}
              </Alert>
            )}

            <div>
              <label style={labelStyle}>Fichier CSV / Excel</label>
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                border: '2px dashed var(--border-color)', background: 'var(--bg-input)',
                borderRadius: 8, padding: 20, cursor: 'pointer', color: 'var(--text-secondary)',
              }}>
                <Upload className="w-4 h-4" />
                <span>{rows.length > 0 ? `${rows.length} joueurs chargés` : 'Choisir un fichier'}</span>
                <input type="file" accept=".csv,.xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>
                Colonnes attendues : Prénom, Nom, Date de naissance, Sexe, Email, Téléphone, Numéro AVS, Licence chez, Club d'origine.
              </p>
            </div>

            {error && (
              <div style={errorBoxStyle}>
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            )}

            {progress && importing && (
              <div style={{
                background: 'var(--info-soft)', border: '1px solid var(--info)',
                borderRadius: 8, padding: 12, color: 'var(--text-secondary)', fontSize: 12,
              }}>
                <div style={{ marginBottom: 6 }}>
                  {progress.phase}
                  {progress.playerName && <span style={{ color: 'var(--info-text)' }}> — {progress.playerName}</span>}
                </div>
                <div style={{ background: 'var(--bg-hover)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    background: 'var(--accent)',
                    height: '100%',
                    width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%`,
                    transition: 'width 200ms ease',
                  }} />
                </div>
                <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                  {progress.current} / {progress.total}
                </div>
              </div>
            )}

            {rows.length > 0 && !importing && (
              <div style={{
                maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border-color)',
                borderRadius: 8,
              }}>
                <table style={{ width: '100%', fontSize: 12, color: 'var(--text-secondary)', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th style={thStyle}>Nom</th>
                      <th style={thStyle}>Prénom</th>
                      <th style={thStyle}>Naissance</th>
                      <th style={thStyle}>Licence chez</th>
                      <th style={thStyle}>Club d'origine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={tdStyle}>{r.last_name}</td>
                        <td style={tdStyle}>{r.first_name}</td>
                        <td style={tdStyle}>{r.birth_date ?? '—'}</td>
                        <td style={tdStyle}>{r.licence_chez ?? '—'}</td>
                        <td style={tdStyle}>{r.club_origine ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={confirmImport}
                disabled={!selected || rows.length === 0 || importing}
                loading={importing}
              >
                {importing ? 'Import en cours...' : `Importer ${rows.length} joueur(s)`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-hover)', border: '1px solid var(--border-color)',
      borderRadius: 8, padding: 12, textAlign: 'center',
    }}>
      <div style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{label}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13,
};
const labelStyle: React.CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6 };
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11,
  position: 'sticky', top: 0, zIndex: 2,
  background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)',
};
const tdStyle: React.CSSProperties = { padding: '6px 10px' };
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
};
const modalStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
  borderRadius: 12, padding: 24, maxWidth: 780, width: '100%',
  maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  margin: '-24px -24px 20px -24px', padding: '16px 24px',
  background: 'var(--bg-modal-header)', borderRadius: '12px 12px 0 0',
};
const errorBoxStyle: React.CSSProperties = {
  background: 'var(--danger-soft)', border: '1px solid var(--danger)',
  borderRadius: 8, padding: 10, color: 'var(--danger-text)', fontSize: 12,
  display: 'flex', gap: 8, alignItems: 'center',
};
