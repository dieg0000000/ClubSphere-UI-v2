import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, X, RefreshCw, Eye } from 'lucide-react';
import CopyIconButton from '../components/CopyIconButton';
import { supabase } from '../lib/supabase';
import { uniqueChannelName } from '../lib/realtime';
import { useAuth } from '../context/AuthContext';
import { formatPhone } from '../utils/phoneHelpers';
import ConfirmModal from '../components/ConfirmModal';
import Button from '../components/ui/Button';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import PageTitleCount from '../components/PageTitleCount';

type InscriptionStatus = 'pending' | 'in_progress' | 'validated' | 'rejected' | 'waitlisted';

interface InscriptionRequest {
  id: string;
  has_played_before: boolean;
  asf_licence_number: string | null;
  previous_club: string | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string | null;
  nationality: string | null;
  place_of_origin: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  player_email: string | null;
  player_phone: string | null;
  legal_rep1_firstname: string | null;
  legal_rep1_lastname: string | null;
  legal_rep1_email: string | null;
  legal_rep1_phone: string | null;
  legal_rep2_firstname: string | null;
  legal_rep2_lastname: string | null;
  legal_rep2_email: string | null;
  legal_rep2_phone: string | null;
  photo_consent: boolean;
  id_card_front_path: string | null;
  id_card_back_path: string | null;
  health_insurance_card_path: string | null;
  passport_photo_path: string | null;
  status: InscriptionStatus;
  processed_by: string | null;
  processing_started_at: string | null;
  validated_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  waitlisted_at: string | null;
}

type TabKey = 'pending' | 'waitlisted' | 'in_progress' | 'validated' | 'rejected';

const TAB_LABELS: Record<TabKey, string> = {
  pending: 'En attente',
  waitlisted: 'Liste d\'attente',
  in_progress: 'En cours',
  validated: 'Validées',
  rejected: 'Refusées',
};

const BUCKET = 'inscription-id-cards';

function isMinor(birthDate: string): boolean {
  const today = new Date();
  const birth = new Date(birthDate);
  const age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  const is18 = age > 18 || (age === 18 && (m > 0 || (m === 0 && today.getDate() >= birth.getDate())));
  return !is18;
}

function computeAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()} ${hh}:${mi}`;
}

function MinorBadge() {
  return <Badge variant="orange" className="ml-1.5">MINEUR</Badge>;
}

function StatusBadge({ status }: { status: InscriptionStatus }) {
  const config: Record<InscriptionStatus, { variant: BadgeVariant; label: string }> = {
    pending:     { variant: 'orange', label: 'En attente' },
    waitlisted:  { variant: 'yellow', label: 'Liste d\'attente' },
    in_progress: { variant: 'blue',   label: 'En cours' },
    validated:   { variant: 'green',  label: 'Validée' },
    rejected:    { variant: 'red',    label: 'Refusée' },
  };
  const c = config[status];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

export default function AdminInscriptions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<InscriptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('pending');
  const [tabInitialized, setTabInitialized] = useState(false);
  const [processorNames, setProcessorNames] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<InscriptionRequest | null>(null);
  const [signedUrls, setSignedUrls] = useState<{ front?: string; back?: string; health?: string; passport?: string }>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; message: string; onConfirm: () => void; confirmLabel?: string; confirmStyle?: 'danger' | 'warning' | 'primary';
  }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const [rejectModal, setRejectModal] = useState<{ open: boolean; request: InscriptionRequest | null; reason: string; loading: boolean }>({ open: false, request: null, reason: '', loading: false });
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from('inscription_requests')
      .select('*')
      .order('submitted_at', { ascending: false });
    if (error) {
      console.error(error);
      showToast('error', 'Erreur lors du chargement des demandes');
      setLoading(false);
      return;
    }
    const rows = (data || []) as InscriptionRequest[];
    setItems(rows);

    const processorIds = Array.from(new Set(rows.map(r => r.processed_by).filter((v): v is string => !!v)));
    if (processorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', processorIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = p.full_name || p.email || 'Administrateur'; });
      setProcessorNames(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { document.title = 'Inscriptions - ClubSphere' }, [])
  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(uniqueChannelName('inscription_requests_admin'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inscription_requests' }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const counts = useMemo(() => ({
    pending: items.filter(i => i.status === 'pending').length,
    waitlisted: items.filter(i => i.status === 'waitlisted').length,
    in_progress: items.filter(i => i.status === 'in_progress').length,
    validated: items.filter(i => i.status === 'validated').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  }), [items]);

  useEffect(() => {
    if (tabInitialized || loading) return;
    if (counts.pending > 0) setTab('pending');
    else if (counts.waitlisted > 0) setTab('waitlisted');
    else if (counts.in_progress > 0) setTab('in_progress');
    else if (counts.validated > 0) setTab('validated');
    else if (counts.rejected > 0) setTab('rejected');
    else setTab('pending');
    setTabInitialized(true);
  }, [counts, loading, tabInitialized]);

  const filtered = useMemo(() => {
    const list = items.filter(i => i.status === tab);
    if (tab === 'waitlisted') {
      return list.sort((a, b) => {
        const aT = a.waitlisted_at || a.submitted_at;
        const bT = b.waitlisted_at || b.submitted_at;
        return aT.localeCompare(bT);
      });
    }
    return list;
  }, [items, tab]);

  const loadSignedUrls = async (r: InscriptionRequest) => {
    setSignedUrls({});
    const paths = {
      front: r.id_card_front_path,
      back: r.id_card_back_path,
      health: r.health_insurance_card_path,
      passport: r.passport_photo_path,
    };
    const next: { front?: string; back?: string; health?: string; passport?: string } = {};
    for (const [key, path] of Object.entries(paths)) {
      if (!path) continue;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (data?.signedUrl) next[key as 'front' | 'back' | 'health' | 'passport'] = data.signedUrl;
    }
    setSignedUrls(next);
  };

  const openViewing = async (r: InscriptionRequest) => {
    setViewing(r);
    await loadSignedUrls(r);
  };

  const takeCharge = async (r: InscriptionRequest) => {
    setConfirm({
      open: true,
      title: 'Prendre en charge',
      message: "Vous allez prendre en charge cette demande. Les autres administrateurs verront qu'elle est en cours de traitement par vous.",
      confirmStyle: 'primary',
      confirmLabel: 'Prendre en charge',
      onConfirm: async () => {
        if (!user?.id) return;
        const { data, error } = await supabase
          .from('inscription_requests')
          .update({
            status: 'in_progress',
            processed_by: user.id,
            processing_started_at: new Date().toISOString(),
          })
          .eq('id', r.id)
          .in('status', ['pending', 'waitlisted'])
          .select('id');
        setConfirm(c => ({ ...c, open: false }));
        if (error) { showToast('error', 'Erreur lors de la prise en charge'); return; }
        if (!data || data.length === 0) {
          showToast('error', 'Cette demande a déjà été prise en charge par un autre administrateur');
          await fetchData();
          return;
        }
        showToast('success', 'Demande prise en charge');
        setViewing(null);
        await fetchData();
      },
    });
  };

  const abandon = async (r: InscriptionRequest) => {
    setConfirm({
      open: true,
      title: 'Abandonner le traitement',
      message: 'Vous allez abandonner le traitement de cette demande. Elle redeviendra disponible pour les autres administrateurs.',
      confirmStyle: 'warning',
      confirmLabel: 'Abandonner',
      onConfirm: async () => {
        const { error } = await supabase
          .from('inscription_requests')
          .update({ status: 'pending', processed_by: null, processing_started_at: null })
          .eq('id', r.id);
        setConfirm(c => ({ ...c, open: false }));
        if (error) { showToast('error', "Erreur lors de l'abandon"); return; }
        showToast('success', 'Traitement abandonné');
        setViewing(null);
        await fetchData();
      },
    });
  };

  const submitReject = async () => {
    if (!rejectModal.request) return;
    setRejectModal(m => ({ ...m, loading: true }));
    // TODO: Phase ultérieure — envoyer un email de refus au soumissionnaire.
    const { error } = await supabase
      .from('inscription_requests')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectModal.reason.trim() || null,
      })
      .eq('id', rejectModal.request.id);
    if (error) {
      showToast('error', 'Erreur lors du refus');
      setRejectModal(m => ({ ...m, loading: false }));
      return;
    }
    showToast('success', 'Demande refusée');
    setRejectModal({ open: false, request: null, reason: '', loading: false });
    setViewing(null);
    await fetchData();
  };

  const continueProcessing = (r: InscriptionRequest) => {
    navigate(`/admin/inscriptions/${r.id}/validate`);
  };

  const contactEmail = (r: InscriptionRequest) => isMinor(r.birth_date) ? (r.legal_rep1_email || '') : (r.player_email || '');
  const contactPhone = (r: InscriptionRequest) => isMinor(r.birth_date) ? (r.legal_rep1_phone || '') : (r.player_phone || '');

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
              <UserPlus size={22} />
              Inscriptions
              <PageTitleCount total={items.length} filtered={counts[tab]} isFiltered={tab !== 'pending'} />
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des demandes d'inscription au club</p>
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
          items={(Object.keys(TAB_LABELS) as TabKey[]).map(k => ({
            key: k,
            label: TAB_LABELS[k],
            count: counts[k],
          }))}
          className="mb-6"
        />

        <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
          <style>{`
            .inscriptions-stickhead thead th {
              position: sticky; top: 0; z-index: 2;
              background: var(--table-header-bg);
              border-bottom: 1px solid var(--border-color);
            }
            .inscriptions-stickhead thead th::after {
              content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
              pointer-events: none;
              background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
            }
          `}</style>
          <div style={{ width: '100%', overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
            <table className="inscriptions-stickhead" style={{ minWidth: '1200px', width: '100%' }}>
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Joueur</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Date de naissance</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Antécédents</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Soumis le</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                      Aucune demande dans cet onglet.
                    </td>
                  </tr>
                )}
                {filtered.map(r => {
                  const minor = isMinor(r.birth_date);
                  const age = computeAge(r.birth_date);
                  const mine = r.processed_by === user?.id;
                  const processorLabel = r.processed_by ? (processorNames[r.processed_by] || 'Administrateur') : '';
                  return (
                    <tr key={r.id}
                        onClick={() => openViewing(r)}
                        className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                        style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        <div className="flex items-center">
                          <span>{r.first_name} {r.last_name}</span>
                          {minor && <MinorBadge />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(r.birth_date)} <span style={{ color: 'var(--text-secondary)' }}>({age} ans)</span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div style={{ color: 'var(--text-primary)' }}>{contactEmail(r) || '—'}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{contactPhone(r) ? formatPhone(contactPhone(r)) : ''}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {r.has_played_before ? (
                          <Badge variant="blue">Déjà licencié</Badge>
                        ) : (
                          <Badge variant="green">Nouveau</Badge>
                        )}
                        {r.asf_licence_number && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: 4 }}>N° {r.asf_licence_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={r.status} />
                        {r.status === 'in_progress' && r.processed_by && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: 4 }}>par {processorLabel}</div>
                        )}
                        {r.status === 'validated' && r.validated_at && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: 4 }}>{fmtDate(r.validated_at)}</div>
                        )}
                        {r.status === 'rejected' && r.rejected_at && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: 4 }}>{fmtDate(r.rejected_at)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{fmtDateTime(r.submitted_at)}</td>
                      <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                        {(r.status === 'pending' || r.status === 'waitlisted') && (
                          <Button variant="primary" size="sm" onClick={() => takeCharge(r)}>Prendre en charge</Button>
                        )}
                        {r.status === 'in_progress' && mine && (
                          <div className="flex gap-2 justify-end">
                            <Button variant="primary" size="sm" onClick={() => continueProcessing(r)}>Continuer</Button>
                            <Button variant="secondary" size="sm" onClick={() => abandon(r)}>Abandonner</Button>
                          </div>
                        )}
                        {r.status === 'in_progress' && !mine && (
                          <div className="flex gap-2 items-center justify-end">
                            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>En cours par {processorLabel}</span>
                            <Button variant="secondary" size="sm" onClick={() => openViewing(r)}>Voir</Button>
                          </div>
                        )}
                        {(r.status === 'validated' || r.status === 'rejected') && (
                          <Button variant="secondary" size="sm" onClick={() => openViewing(r)}><Eye size={14} /> Voir</Button>
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

      {viewing && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setViewing(null)} />
          <div className="fixed right-0 top-0 h-full z-50 overflow-y-auto" style={{ width: 'min(1100px, 95vw)', maxWidth: '100vw', background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}>
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between z-10" style={{ background: 'var(--bg-modal-header)' }}>
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>Demande d'inscription</h2>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm" style={{ color: 'var(--text-modal-header)', opacity: 0.8 }}>{viewing.first_name} {viewing.last_name}</p>
                  {viewing.has_played_before ? (
                    <Badge variant="blue">Transfert ASF</Badge>
                  ) : (
                    <Badge variant="neutral">Première inscription</Badge>
                  )}
                </div>
              </div>
              <button onClick={() => setViewing(null)} className="hover:opacity-80" style={{ color: 'var(--text-modal-header)' }}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6 text-sm">
              <Section title="Antécédents" cols={2}>
                <Field label="Déjà licencié" value={viewing.has_played_before ? 'Oui' : 'Non'} />
                {viewing.asf_licence_number && (
                  <Field label="N° licence ASF" value={
                    <CopyValue copyValue={viewing.asf_licence_number} label="numéro de licence ASF" />
                  } />
                )}
                {viewing.has_played_before && viewing.previous_club && (
                  <Field label="Club précédent" value={
                    <CopyValue copyValue={viewing.previous_club} label="club précédent" />
                  } />
                )}
              </Section>

              <Section title="Identité" cols={2}>
                <Field label="Nom" value={<CopyValue copyValue={viewing.last_name} label="nom" />} />
                <Field label="Prénom" value={<CopyValue copyValue={viewing.first_name} label="prénom" />} />
                <Field label="Date de naissance" value={
                  <span className="flex items-center" style={{ gap: 6 }}>
                    <CopyValue
                      display={<>{fmtDate(viewing.birth_date)} <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>({computeAge(viewing.birth_date)} ans)</span></>}
                      copyValue={fmtDate(viewing.birth_date)}
                      label="date de naissance"
                    />
                    {isMinor(viewing.birth_date) && <MinorBadge />}
                  </span>
                } />
                {viewing.gender && <Field label="Sexe" value={viewing.gender === 'M' ? 'Masculin' : viewing.gender === 'F' ? 'Féminin' : 'Autre'} />}
                {viewing.nationality && <Field label="Nationalité" value={viewing.nationality} />}
                {viewing.place_of_origin && <Field label="Lieu d'origine" value={viewing.place_of_origin} />}
              </Section>

              <Section title="Adresse">
                <Field label="Adresse" value={
                  viewing.address ? <CopyValue copyValue={viewing.address} label="adresse" /> : '—'
                } />
                <Field label="NPA" value={
                  viewing.postal_code ? <CopyValue copyValue={viewing.postal_code} label="NPA" /> : '—'
                } />
                <Field label="Localité" value={
                  viewing.city ? <CopyValue copyValue={viewing.city} label="localité" /> : '—'
                } />
              </Section>

              <Section title="Contact joueur" cols={2}>
                {viewing.player_email && (
                  <Field label="Email" value={<CopyValue copyValue={viewing.player_email} label="email du joueur" />} />
                )}
                {viewing.player_phone && (
                  <Field label="Téléphone" value={
                    <CopyValue copyValue={formatPhone(viewing.player_phone)} label="téléphone du joueur" />
                  } />
                )}
                {!viewing.player_email && !viewing.player_phone && (
                  <div style={{ color: 'var(--text-secondary)' }}>Aucun contact joueur direct.</div>
                )}
              </Section>

              {(viewing.legal_rep1_firstname || viewing.legal_rep1_email || viewing.legal_rep1_phone) && (
                <Section title="Représentant légal 1" cols={2}>
                  {viewing.legal_rep1_lastname && (
                    <Field label="Nom" value={<CopyValue copyValue={viewing.legal_rep1_lastname} label="nom du représentant 1" />} />
                  )}
                  {viewing.legal_rep1_firstname && (
                    <Field label="Prénom" value={<CopyValue copyValue={viewing.legal_rep1_firstname} label="prénom du représentant 1" />} />
                  )}
                  {viewing.legal_rep1_email && (
                    <Field label="Email" value={<CopyValue copyValue={viewing.legal_rep1_email} label="email du représentant 1" />} />
                  )}
                  {viewing.legal_rep1_phone && (
                    <Field label="Téléphone" value={<CopyValue copyValue={formatPhone(viewing.legal_rep1_phone)} label="téléphone du représentant 1" />} />
                  )}
                </Section>
              )}

              {(viewing.legal_rep2_firstname || viewing.legal_rep2_email || viewing.legal_rep2_phone) && (
                <Section title="Représentant légal 2" cols={2}>
                  {viewing.legal_rep2_lastname && (
                    <Field label="Nom" value={<CopyValue copyValue={viewing.legal_rep2_lastname} label="nom du représentant 2" />} />
                  )}
                  {viewing.legal_rep2_firstname && (
                    <Field label="Prénom" value={<CopyValue copyValue={viewing.legal_rep2_firstname} label="prénom du représentant 2" />} />
                  )}
                  {viewing.legal_rep2_email && (
                    <Field label="Email" value={<CopyValue copyValue={viewing.legal_rep2_email} label="email du représentant 2" />} />
                  )}
                  {viewing.legal_rep2_phone && (
                    <Field label="Téléphone" value={<CopyValue copyValue={formatPhone(viewing.legal_rep2_phone)} label="téléphone du représentant 2" />} />
                  )}
                </Section>
              )}

              <Section title="Documents">
                <div className="grid grid-cols-2 gap-3">
                  {!viewing.has_played_before && (
                    <>
                      <Thumbnail label="CI recto" url={signedUrls.front} onOpen={setPreviewUrl} />
                      <Thumbnail label="CI verso" url={signedUrls.back} onOpen={setPreviewUrl} />
                      <Thumbnail label="Carte d'assurance maladie" url={signedUrls.health} onOpen={setPreviewUrl} />
                    </>
                  )}
                  <Thumbnail label="Photo passeport" url={signedUrls.passport} onOpen={setPreviewUrl} />
                </div>
              </Section>

              <Section title="Autorisation d'image">
                <Field label="Diffusion photos / vidéos autorisée" value={viewing.photo_consent ? 'Oui' : 'Non'} />
              </Section>

              <Section title="Audit" cols={2}>
                <Field label="Soumise le" value={fmtDateTime(viewing.submitted_at)} />
                {viewing.processing_started_at && (
                  <Field label="Prise en charge le" value={fmtDateTime(viewing.processing_started_at)} />
                )}
                {viewing.processed_by && (
                  <Field label="Par" value={processorNames[viewing.processed_by] || '—'} />
                )}
                {viewing.validated_at && <Field label="Validée le" value={fmtDateTime(viewing.validated_at)} />}
                {viewing.rejected_at && <Field label="Refusée le" value={fmtDateTime(viewing.rejected_at)} />}
                {viewing.rejection_reason && <Field label="Motif de refus" value={viewing.rejection_reason} className="md:col-span-2" />}
              </Section>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-3 p-6 border-t" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
              {(viewing.status === 'pending' || viewing.status === 'waitlisted') && (
                <>
                  <Button variant="destructive" onClick={() => setRejectModal({ open: true, request: viewing, reason: '', loading: false })}>Refuser</Button>
                  <Button variant="primary" onClick={() => takeCharge(viewing)}>Prendre en charge</Button>
                </>
              )}
              {viewing.status === 'in_progress' && viewing.processed_by === user?.id && (
                <>
                  <Button variant="secondary" onClick={() => abandon(viewing)}>Abandonner</Button>
                  <Button variant="primary" onClick={() => continueProcessing(viewing)}>Continuer le traitement</Button>
                </>
              )}
              {(viewing.status === 'validated' || viewing.status === 'rejected' || (viewing.status === 'in_progress' && viewing.processed_by !== user?.id)) && (
                <Button variant="secondary" onClick={() => setViewing(null)}>Fermer</Button>
              )}
            </div>
          </div>
        </>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setPreviewUrl(null)}>
          <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 text-[var(--text-inverse)]"><X size={28} /></button>
          <img src={previewUrl} alt="Aperçu" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}

      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24, width: 480, maxWidth: '100%' }}>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Refuser la demande</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Indiquez un motif de refus (optionnel mais recommandé). Le soumissionnaire pourra être notifié ultérieurement.
            </p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal(m => ({ ...m, reason: e.target.value }))}
              rows={4}
              className="w-full p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--danger)]"
              style={{ color: 'var(--text-primary)', background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
              placeholder="Motif du refus…"
            />
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="secondary" disabled={rejectModal.loading} onClick={() => setRejectModal({ open: false, request: null, reason: '', loading: false })}>Annuler</Button>
              <Button variant="destructive" disabled={rejectModal.loading} onClick={submitReject}>
                {rejectModal.loading ? 'Refus…' : 'Refuser'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        confirmStyle={confirm.confirmStyle || 'primary'}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm(c => ({ ...c, open: false }))}
      />

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          background: toast.type === 'success' ? 'var(--success-soft)' : 'var(--danger-soft)',
          color: toast.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
          border: `1px solid ${toast.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
          borderRadius: 10, padding: '12px 18px', fontWeight: 600, fontSize: 14,
          boxShadow: 'var(--shadow-lg)'
        }}>{toast.text}</div>
      )}
    </div>
  );
}

function Section({ title, children, cols = 1 }: { title: string; children: React.ReactNode; cols?: 1 | 2 }) {
  const bodyClass = cols === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2' : 'space-y-2';
  return (
    <div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{title}</div>
      <div className={bodyClass} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: 10, padding: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-[160px_1fr] gap-3${className ? ` ${className}` : ''}`}>
      <div style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function CopyValue({ display, copyValue, label }: { display?: React.ReactNode; copyValue: string; label: string }) {
  if (!copyValue) return <>—</>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>{display ?? copyValue}</span>
      <CopyIconButton value={copyValue} label={label} />
    </span>
  );
}

function Thumbnail({ label, url, onOpen }: { label: string; url?: string; onOpen: (u: string) => void }) {
  return (
    <div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 4 }}>{label}</div>
      {url ? (
        <button
          type="button"
          onClick={() => onOpen(url)}
          style={{
            width: '100%', aspectRatio: '3/4', background: 'var(--bg-input)',
            border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden',
            cursor: 'pointer', padding: 0,
          }}
        >
          <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </button>
      ) : (
        <div style={{
          width: '100%', aspectRatio: '3/4', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'var(--bg-input)', border: '1px dashed var(--border-color)',
          borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12,
        }}>Aucun</div>
      )}
    </div>
  );
}
