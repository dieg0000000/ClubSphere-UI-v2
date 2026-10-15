import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ShieldCheck, RefreshCw, Check, X, Info, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { invokeFunction } from '../lib/invokeFunction';
import { StandardModal } from '../components/StandardModal';
import { Tabs } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import PageTitleCount from '../components/PageTitleCount';

type ActivationStatus = 'pending' | 'resolved' | 'rejected';
type CaseType = 'avs_not_found' | 'email_mismatch' | 'member_no_email' | 'parent_not_rep' | 'parent_avs_not_found';
type TabKey = 'pending' | 'resolved' | 'rejected' | 'all';

interface ActivationRequest {
  id: string;
  member_id: string | null;
  requester_email: string;
  avs_input: string;
  case_type: CaseType;
  message: string | null;
  status: ActivationStatus;
  created_at: string;
}

interface MemberInfo {
  first_name: string | null;
  last_name: string | null;
  team_name: string | null;
}

type RetryResult =
  | { kind: 'found'; memberName: string; showNotLegalRepNote: boolean }
  | { kind: 'not_found' }
  | { kind: 'multiple' };

interface RetryResponse {
  ok?: boolean;
  found?: boolean;
  count?: number;
  already_resolved?: boolean;
  member_id?: string;
  member_name?: string | null;
  team_name?: string | null;
  is_legal_rep?: boolean;
  is_self?: boolean;
}

const RETRYABLE_CASES: CaseType[] = ['avs_not_found', 'parent_avs_not_found'];

function HintText({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-1 mt-1.5" style={{ color: 'var(--warning-text)', fontSize: '12px', lineHeight: 1.4 }}>
      <Info size={13} className="flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function RetryErrorText({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1.5" style={{ fontSize: '12px', color: 'var(--danger, #dc2626)', fontWeight: 500 }}>
      {children}
    </div>
  );
}

const TAB_LABELS: Record<TabKey, string> = {
  pending: 'En attente',
  resolved: 'Traitées',
  rejected: 'Rejetées',
  all: 'Toutes',
};

const CASE_LABELS: Record<CaseType, string> = {
  avs_not_found: 'AVS introuvable',
  email_mismatch: 'Email différent',
  member_no_email: 'Membre sans email',
  parent_not_rep: 'Rattachement parent',
  parent_avs_not_found: 'Rattachement parent — enfant non identifié',
};

const ACTION_FOR_CASE: Record<CaseType, string> = {
  member_no_email: 'resolve_set_email',
  email_mismatch: 'resolve_replace_email',
  avs_not_found: 'resolve_replace_email',
  parent_not_rep: 'resolve_link_parent',
  parent_avs_not_found: 'resolve_link_parent',
};

const AVS_NOT_FOUND_REJECT_REASON =
  "Le n° AVS indiqué ne correspond à aucun joueur du club. Merci de refaire votre demande avec le numéro figurant sur votre carte d'assurance.";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatusBadge({ status }: { status: ActivationStatus }) {
  if (status === 'pending') return <Badge variant="yellow">En attente</Badge>;
  if (status === 'resolved') return <Badge variant="green">Traitée</Badge>;
  return <Badge variant="red">Rejetée</Badge>;
}

export default function AdminActivations() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActivationRequest[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({});
  const [tab, setTab] = useState<TabKey>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    request: ActivationRequest | null;
  }>({ open: false, request: null });

  // Reject modal state
  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    request: ActivationRequest | null;
    reason: string;
  }>({ open: false, request: null, reason: '' });

  // Retry state per row
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryResult, setRetryResult] = useState<Record<string, RetryResult>>({});

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('activation_requests')
      .select('id, member_id, requester_email, avs_input, case_type, message, status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      showToast('error', 'Erreur lors du chargement des demandes');
      setLoading(false);
      return;
    }
    const rows = (data || []) as ActivationRequest[];
    setItems(rows);

    const memberIds = Array.from(new Set(rows.map(r => r.member_id).filter((v): v is string => !!v)));
    if (memberIds.length > 0) {
      const { data: members } = await supabase
        .from('members')
        .select('id, first_name, last_name, team_id')
        .in('id', memberIds);

      const teamIds = Array.from(new Set((members || []).map((m: any) => m.team_id).filter((v: any): v is string => !!v)));
      let teamNameById: Record<string, string> = {};
      if (teamIds.length > 0) {
        const { data: teams } = await supabase
          .from('teams')
          .select('id, name')
          .in('id', teamIds);
        (teams || []).forEach((t: any) => { teamNameById[t.id] = t.name; });
      }

      const map: Record<string, MemberInfo> = {};
      (members || []).forEach((m: any) => {
        map[m.id] = {
          first_name: m.first_name,
          last_name: m.last_name,
          team_name: m.team_id ? teamNameById[m.team_id] || null : null,
        };
      });
      setMemberMap(map);
    } else {
      setMemberMap({});
    }
    setRetryResult({});
    setLoading(false);
  }, []);

  useEffect(() => { document.title = 'Activations - ClubSphere' }, [])
  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter(r => r.status === tab);
  }, [items, tab]);

  const counts = useMemo(() => ({
    pending: items.filter(r => r.status === 'pending').length,
    resolved: items.filter(r => r.status === 'resolved').length,
    rejected: items.filter(r => r.status === 'rejected').length,
    all: items.length,
  }), [items]);

  const callResolve = async (requestId: string, approve: boolean, caseType: CaseType) => {
    if (busyId) return;
    setBusyId(requestId);
    try {
      const action = approve ? (ACTION_FOR_CASE[caseType] ?? 'resolve_replace_email') : 'reject';
      const { data, error: fnErr, status } = await invokeFunction('resolve-activation', {
        body: { requestId, action },
      });
      if (approve && status === 409) {
        await fetchData();
        return;
      }
      if (fnErr) {
        showToast('error', fnErr || "Erreur lors de l'action");
        setBusyId(null);
        return;
      }
      if (data?.error) {
        showToast('error', data.error);
        setBusyId(null);
        return;
      }
      showToast('success', approve ? 'Accès validé — un email a été envoyé au demandeur' : 'Demande rejetée');
      await fetchData();
    } catch (e) {
      console.error(e);
      showToast('error', "Erreur lors de l'action");
    } finally {
      setBusyId(null);
    }
  };

  const handleValidate = (r: ActivationRequest) => {
    setConfirmModal({ open: true, request: r });
  };

  const confirmModalAction = async () => {
    if (!confirmModal.request) return;
    const req = confirmModal.request;
    setConfirmModal({ open: false, request: null });
    await callResolve(req.id, true, req.case_type);
  };

  const handleReject = (r: ActivationRequest) => {
    const prefill = r.case_type === 'avs_not_found' ? AVS_NOT_FOUND_REJECT_REASON : '';
    setRejectModal({ open: true, request: r, reason: prefill });
  };

  const confirmReject = async () => {
    if (!rejectModal.request) return;
    const req = rejectModal.request;
    setRejectModal({ open: false, request: null, reason: '' });
    await callResolve(req.id, false, req.case_type);
  };

  const handleRetry = async (r: ActivationRequest) => {
    if (retryingId || busyId) return;
    setRetryingId(r.id);
    setRetryResult(prev => { const next = { ...prev }; delete next[r.id]; return next; });
    try {
      const { data, error } = await supabase.rpc('retry_activation_request', { p_request: r.id });

      if (error) {
        console.error('retry_activation_request error:', error);
        showToast('error', error.message || 'Erreur lors de la recherche');
        return;
      }

      const res = (data ?? {}) as RetryResponse;

      if (res.already_resolved) {
        await fetchData();
        return;
      }

      if (res.found && res.member_id) {
        const memberId = res.member_id;
        const memberName = (res.member_name || '').trim();
        setMemberMap(prev => ({
          ...prev,
          [memberId]: { first_name: memberName, last_name: null, team_name: res.team_name ?? null },
        }));
        setItems(prev => prev.map(it => (it.id === r.id ? { ...it, member_id: memberId } : it)));
        setRetryResult(prev => ({
          ...prev,
          [r.id]: { kind: 'found', memberName, showNotLegalRepNote: res.is_legal_rep === false && res.is_self === false },
        }));
        return;
      }

      setRetryResult(prev => ({
        ...prev,
        [r.id]: (res.count ?? 0) >= 2 ? { kind: 'multiple' } : { kind: 'not_found' },
      }));
    } catch (e) {
      console.error(e);
      showToast('error', 'Erreur lors de la recherche');
    } finally {
      setRetryingId(null);
    }
  };

  const memberLabel = (memberId: string | null): string => {
    if (!memberId) return '—';
    const m = memberMap[memberId];
    if (!m) return '—';
    const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
    return name || '—';
  };

  const teamLabel = (memberId: string | null): string => {
    if (!memberId) return '—';
    return memberMap[memberId]?.team_name || '—';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--bg-page)' }}>
      <div className="w-full mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
              <ShieldCheck size={22} />
              Activations
              <PageTitleCount total={items.length} filtered={counts[tab]} isFiltered={tab !== 'pending'} />
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              Demandes d'activation des comptes
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
            style={{ background: 'var(--border-color)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
          >
            <RefreshCw size={16} />
            Actualiser
          </button>
        </div>

        <Tabs
          value={tab}
          onChange={(k) => setTab(k as TabKey)}
          items={(['pending', 'resolved', 'rejected', 'all'] as const).map(k => ({
            key: k,
            label: TAB_LABELS[k],
            count: counts[k],
          }))}
          className="mb-6"
        />

        <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
          <style>{`
            .activations-stickhead thead th {
              position: sticky; top: 0; z-index: 2;
              background: var(--table-header-bg);
              border-bottom: 1px solid var(--border-color);
            }
            .activations-stickhead thead th::after {
              content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
              pointer-events: none;
              background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
            }
          `}</style>
          <div style={{ width: '100%', overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
            <table className="activations-stickhead" style={{ minWidth: '1200px', width: '100%' }}>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Motif</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Email du demandeur</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>N° AVS</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Membre identifié</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Équipe</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Message</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Statut</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                      {tab === 'pending'
                        ? 'Aucune demande en attente'
                        : tab === 'resolved'
                        ? 'Aucune demande traitée'
                        : tab === 'rejected'
                        ? 'Aucune demande rejetée'
                        : 'Aucune demande'}
                    </td>
                  </tr>
                )}
                {filtered.map(r => {
                  const busy = busyId === r.id;
                  const isRetrying = retryingId === r.id;
                  const retry = retryResult[r.id];
                  const canRetry = r.status === 'pending' && RETRYABLE_CASES.includes(r.case_type) && !r.member_id;
                  const isAvsNotFound = r.case_type === 'avs_not_found' && !r.member_id;
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        <div>{CASE_LABELS[r.case_type]}</div>
                        {r.case_type === 'parent_avs_not_found' && canRetry && (
                          <HintText>Si la fiche du membre contient une erreur de saisie du numéro AVS, corrigez-la dans l'annuaire, puis cliquez sur Réessayer.</HintText>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {r.requester_email}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {r.avs_input}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {retry?.kind === 'found' && r.status === 'pending' ? (
                          <div>
                            {memberLabel(r.member_id)}
                            <HintText>Joueur identifié : {retry.memberName}</HintText>
                            {retry.showNotLegalRepNote && (
                              <HintText>L'adresse du demandeur n'est pas celle d'un représentant légal</HintText>
                            )}
                          </div>
                        ) : canRetry ? (
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                            {isAvsNotFound && (
                              <HintText>Vérifiez dans Joueurs que la personne existe et que son n° AVS est renseigné et correct, puis cliquez sur Réessayer. Sinon, refusez la demande en indiquant au joueur de la refaire avec le bon numéro.</HintText>
                            )}
                            {retry?.kind === 'not_found' && (
                              <RetryErrorText>Toujours aucun joueur avec ce n° AVS</RetryErrorText>
                            )}
                            {retry?.kind === 'multiple' && (
                              <RetryErrorText>Plusieurs joueurs portent ce n° AVS — corrigez les fiches</RetryErrorText>
                            )}
                          </div>
                        ) : (
                          memberLabel(r.member_id)
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {teamLabel(r.member_id)}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)', maxWidth: '260px' }}>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {r.message || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {r.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {canRetry && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRetry(r)}
                                disabled={busy || retryingId !== null}
                                leftIcon={<RotateCcw size={14} className={isRetrying ? 'animate-spin' : ''} />}
                              >
                                Réessayer
                              </Button>
                            )}
                            <div className="relative group">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleValidate(r)}
                                disabled={busy || isRetrying || !r.member_id}
                                leftIcon={<Check size={14} />}
                              >
                                Valider
                              </Button>
                              {!r.member_id && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: 'var(--text-primary)', color: 'var(--bg-card)', fontWeight: 500 }}>
                                  Impossible de valider : le n° AVS saisi ne correspond à aucun joueur du club.
                                </div>
                              )}
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleReject(r)}
                              disabled={busy || isRetrying}
                              leftIcon={<X size={14} />}
                            >
                              Refuser
                            </Button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Confirm validation modal */}
      <StandardModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, request: null })}
        title="Confirmer la validation"
      >
        {confirmModal.request && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ color: 'var(--text-primary)', margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
              Cela donnera à <strong>{confirmModal.request.requester_email}</strong> l'accès
              {confirmModal.request.member_id ? (
                <> aux informations de <strong>{memberLabel(confirmModal.request.member_id)}</strong></>
              ) : null}. Confirmer ?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setConfirmModal({ open: false, request: null })}
                style={{
                  padding: '8px 16px', borderRadius: '8px',
                  border: '1px solid var(--border-color)', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmModalAction}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  background: 'var(--accent)', color: 'var(--text-inverse)',
                  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        )}
      </StandardModal>

      {/* Reject confirmation modal */}
      <StandardModal
        isOpen={rejectModal.open}
        onClose={() => setRejectModal({ open: false, request: null, reason: '' })}
        title="Refuser la demande"
      >
        {rejectModal.request && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ color: 'var(--text-primary)', margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
              Refuser la demande de <strong>{rejectModal.request.requester_email}</strong> ?
            </p>
            {rejectModal.reason && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Motif suggéré
                </label>
                <textarea
                  readOnly
                  value={rejectModal.reason}
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid var(--border-color)', background: 'var(--bg-sidebar)',
                    color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5,
                    resize: 'none',
                  }}
                />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setRejectModal({ open: false, request: null, reason: '' })}
                style={{
                  padding: '8px 16px', borderRadius: '8px',
                  border: '1px solid var(--border-color)', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmReject}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  background: 'var(--danger, #dc2626)', color: '#fff',
                  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Refuser
              </button>
            </div>
          </div>
        )}
      </StandardModal>

      {toast && (
        <div
          style={{
            position: 'fixed', bottom: '24px', right: '24px',
            padding: '12px 18px', borderRadius: '8px',
            background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
            color: 'var(--text-inverse)', fontSize: '14px', fontWeight: 600,
            boxShadow: 'var(--shadow-lg)', zIndex: 2000,
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
