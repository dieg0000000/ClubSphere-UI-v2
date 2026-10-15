import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { CircleCheck as CheckCircle, Clock } from 'lucide-react';
import { loadActiveChartes, calcAge, CharteDoc } from '../utils/charteHelpers';
import Button from './ui/Button';

interface Row {
  doc: CharteDoc;
  validated: boolean;
  acknowledgedAt?: string;
  forChildName?: string;
  forChildId?: string;
}

export function MesValidations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const docs = await loadActiveChartes();
      const result: Row[] = [];
      const { data: acks } = await supabase
        .from('document_acknowledgements')
        .select('document_id, member_id, user_id, acknowledged_at')
        .in('document_id', docs.length ? docs.map(d => d.id) : ['00000000-0000-0000-0000-000000000000']);

      if (user.role === 'parent') {
        const { data: pm } = await supabase
          .from('parent_members')
          .select('member_id, members:member_id(id, first_name, last_name, birth_date)')
          .eq('parent_user_id', user.id);
        const mineursDoc = docs.find(d => d.category === 'charte_joueurs_mineurs') ?? docs.find(d => d.category === 'charte_joueurs');
        if (mineursDoc) {
          for (const p of pm ?? []) {
            const c: any = p.members;
            if (!c) continue;
            const age = calcAge(c.birth_date);
            if (age !== null && age < 18) {
              const ack = (acks ?? []).find(a => a.document_id === mineursDoc.id && a.member_id === c.id);
              result.push({
                doc: mineursDoc,
                validated: !!ack,
                acknowledgedAt: ack?.acknowledged_at,
                forChildName: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
                forChildId: c.id,
              });
            }
          }
        }
      } else if (user.role === 'member') {
        const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).maybeSingle();
        if (profile?.email) {
          const { data: member } = await supabase.from('members').select('id, birth_date').ilike('email', profile.email).maybeSingle();
          const age = calcAge(member?.birth_date);
          if (member && age !== null && age >= 18) {
            const adultsDoc = docs.find(d => d.category === 'charte_joueurs');
            if (adultsDoc) {
              const ack = (acks ?? []).find(a => a.document_id === adultsDoc.id && a.member_id === member.id);
              result.push({
                doc: adultsDoc,
                validated: !!ack,
                acknowledgedAt: ack?.acknowledged_at,
              });
            }
          } else if (member && (age === null || age < 18)) {
            const mineursDoc = docs.find(d => d.category === 'charte_joueurs_mineurs') ?? docs.find(d => d.category === 'charte_joueurs');
            if (mineursDoc) {
              const parentAck = (acks ?? []).find(a => a.document_id === mineursDoc.id && a.member_id === member.id);
              result.push({
                doc: mineursDoc,
                validated: !!parentAck,
                acknowledgedAt: parentAck?.acknowledged_at,
              });
            }
          }
        }
      } else if (user.role === 'coach' || user.role === 'assistant_coach') {
        const coachDoc = docs.find(d => d.category === 'charte_entraineurs');
        if (coachDoc) {
          const ack = (acks ?? []).find(a => a.document_id === coachDoc.id && a.user_id === user.id);
          result.push({
            doc: coachDoc,
            validated: !!ack,
            acknowledgedAt: ack?.acknowledged_at,
          });
        }
      }
      setRows(result);
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '20px',
      marginTop: '20px',
    }}>
      <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>Mes validations</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: r.validated ? 'var(--success-soft)' : 'var(--warning-soft)',
            borderLeft: `4px solid ${r.validated ? 'var(--success)' : 'var(--warning)'}`,
            borderRadius: '8px', padding: '12px 14px',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>
                {r.doc.title}
              </div>
              {r.forChildName && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
                  pour {r.forChildName}
                </div>
              )}
              <div style={{ fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {r.validated ? (
                  <span style={{ color: 'var(--success-text)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={12} /> Validé le {r.acknowledgedAt ? new Date(r.acknowledgedAt).toLocaleDateString('fr-CH') : ''}
                  </span>
                ) : (
                  <span style={{ color: 'var(--warning-text)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> En attente
                  </span>
                )}
              </div>
            </div>
            {!r.validated && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/documents')}
                style={{ flexShrink: 0, marginLeft: '12px' }}
              >
                Valider maintenant
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
