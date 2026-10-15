import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { Save } from 'lucide-react';
import Button from './ui/Button';
import { Alert } from './ui/Alert';
import {
  EvaluationData, EMPTY_EVALUATION, TECHNIQUE_FIELDS, TACTIQUE_FIELDS,
  MENTAL_FIELDS, getActiveSeason, getSeasonOptions, ratingColor,
} from '../lib/evaluationFields';

interface PlayerProfileTabProps {
  memberId: string;
  memberPosition: string | null;
  memberPositionMainId: string | null;
  memberPositionSecondaryId: string | null;
  teamCategoryName: string | null;
  jerseyNumber?: number | null;
}

export default function PlayerProfileTab({
  memberId,
  memberPosition,
  memberPositionMainId,
  memberPositionSecondaryId,
  teamCategoryName,
  jerseyNumber,
}: PlayerProfileTabProps) {
  const { clubId } = useTenant();
  const [season, setSeason] = useState(getActiveSeason());
  const [evaluation, setEvaluation] = useState<EvaluationData>({ ...EMPTY_EVALUATION });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [positionNames, setPositionNames] = useState<{ main: string | null; secondary: string | null }>({ main: null, secondary: null });

  useEffect(() => {
    let cancelled = false;
    const ids = [memberPositionMainId, memberPositionSecondaryId].filter(Boolean) as string[];
    if (ids.length === 0) {
      setPositionNames({ main: null, secondary: null });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('football_positions')
        .select('id, name')
        .in('id', ids);
      if (cancelled) return;
      const map = new Map((data || []).map(p => [p.id, p.name]));
      setPositionNames({
        main: memberPositionMainId ? map.get(memberPositionMainId) || null : null,
        secondary: memberPositionSecondaryId ? map.get(memberPositionSecondaryId) || null : null,
      });
    })();
    return () => { cancelled = true; };
  }, [memberPositionMainId, memberPositionSecondaryId]);

  const loadEvaluation = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    const { data, error: fetchErr } = await supabase
      .from('player_evaluations')
      .select('*')
      .eq('member_id', memberId)
      .eq('season', season)
      .maybeSingle();

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    if (data) {
      const ev: EvaluationData = { ...EMPTY_EVALUATION };
      for (const k of Object.keys(EMPTY_EVALUATION) as (keyof EvaluationData)[]) {
        if (k === 'observations') {
          ev.observations = data.observations ?? null;
        } else {
          ev[k] = typeof data[k] === 'number' ? data[k] : null;
        }
      }
      setEvaluation(ev);
    } else {
      setEvaluation({ ...EMPTY_EVALUATION });
    }
    setLoading(false);
  }, [memberId, season, clubId]);

  useEffect(() => { loadEvaluation(); }, [loadEvaluation]);

  const handleSave = async () => {
    if (!clubId) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    const payload: Record<string, unknown> = {
      club_id: clubId,
      member_id: memberId,
      season,
    };
    for (const k of Object.keys(EMPTY_EVALUATION) as (keyof EvaluationData)[]) {
      payload[k] = evaluation[k];
    }

    const { error: upsertErr } = await supabase
      .from('player_evaluations')
      .upsert(payload, { onConflict: 'member_id,season' });

    if (upsertErr) {
      setError('Échec de l\'enregistrement : ' + upsertErr.message);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  };

  const updateField = (key: keyof EvaluationData, value: string) => {
    if (key === 'observations') {
      setEvaluation(prev => ({ ...prev, observations: value || null }));
      return;
    }
    const num = value === '' ? null : Math.min(10, Math.max(1, parseInt(value, 10)));
    if (value !== '' && isNaN(num as number)) return;
    setEvaluation(prev => ({ ...prev, [key]: num }));
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '20px',
  };

  const inputStyle: React.CSSProperties = {
    width: '52px',
    padding: '4px 6px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    fontWeight: 700,
    fontSize: '14px',
    textAlign: 'center' as const,
  };

  const renderRatingField = (field: { key: keyof EvaluationData; label: string }) => {
    const val = evaluation[field.key] as number | null;
    return (
      <div key={field.key} className="flex items-center justify-between gap-2" style={{ marginBottom: '8px' }}>
        <span className="text-sm" style={{ color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}>{field.label}</span>
        <input
          type="number"
          min={1}
          max={10}
          value={val ?? ''}
          onChange={(e) => updateField(field.key, e.target.value)}
          style={{
            ...inputStyle,
            color: ratingColor(val),
          }}
        />
      </div>
    );
  };

  const renderFieldGroup = (title: string, fields: { key: keyof EvaluationData; label: string }[]) => (
    <div style={{ ...cardStyle, flex: 1, minWidth: '200px' }}>
      <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
        {title}
      </h4>
      {fields.map(renderRatingField)}
    </div>
  );

  return (
    <div className="space-y-6" style={{ background: 'var(--bg-app)', borderRadius: '0 0 12px 12px', padding: '24px', margin: '-24px', marginTop: '0' }}>
      {/* Header - read-only player info */}
      <div style={{ ...cardStyle }}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {jerseyNumber != null && (
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>N° maillot</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>#{jerseyNumber}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Catégorie</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {(memberPosition && memberPosition !== 'Non spécifié') ? memberPosition : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Poste principal</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {positionNames.main || '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Poste secondaire</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {positionNames.secondary || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Season selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Saison :</label>
        <select
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontSize: '14px',
          }}
        >
          {getSeasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && (
        <Alert variant="danger" title="Erreur">{error}</Alert>
      )}

      {success && (
        <Alert variant="success" title="Enregistré">L'évaluation a été sauvegardée.</Alert>
      )}

      {loading ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      ) : (
        <>
          {/* Rating fields */}
          <div>
            <h3 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Profil du Joueur (1-10)
            </h3>
            <div className="flex flex-wrap gap-6">
              {renderFieldGroup('Technique', TECHNIQUE_FIELDS)}
              {renderFieldGroup('Tactique', TACTIQUE_FIELDS)}
              {renderFieldGroup('Mental & Physique', MENTAL_FIELDS)}
            </div>
          </div>

          {/* Observations */}
          <div style={{ ...cardStyle }}>
            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Observations
            </label>
            <textarea
              value={evaluation.observations || ''}
              onChange={(e) => updateField('observations', e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                resize: 'vertical',
              }}
              placeholder="Commentaires libres sur le joueur..."
            />
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              <Save size={16} />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
