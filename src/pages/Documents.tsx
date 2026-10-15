import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { FileText, Image, Download, ChevronDown } from 'lucide-react';
import { calcAge } from '../utils/charteHelpers';
import { Tabs } from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { reportLoadError } from '../utils/reportLoadError'
import { LoadError } from '../components/LoadError'

const CATEGORY_LABELS: Record<string, string> = {
  pv_ag:                'PV AG',
  pv_technique:         'PV Séances techniques',
  divers:               'Documents divers',
  charte_joueurs:       'Charte joueurs (adultes)',
  charte_joueurs_mineurs: 'Charte enfants & parents',
  charte_entraineurs:   'Charte entraîneurs',
};

type CategoryKey = 'pv_ag' | 'pv_technique' | 'divers' | 'charte_joueurs' | 'charte_joueurs_mineurs' | 'charte_entraineurs';

const ADMIN_ROLES = ['admin', 'president', 'vice_president', 'committee'];
const CHARTE_CATEGORIES: CategoryKey[] = ['charte_joueurs', 'charte_joueurs_mineurs', 'charte_entraineurs'];

function getAllowedCategories(role: string): CategoryKey[] {
  if (ADMIN_ROLES.includes(role)) {
    return ['pv_ag', 'pv_technique', 'divers', 'charte_joueurs', 'charte_joueurs_mineurs', 'charte_entraineurs'];
  }
  if (role === 'coach' || role === 'assistant_coach') {
    return ['pv_technique', 'divers', 'charte_entraineurs'];
  }
  return ['pv_ag', 'divers', 'charte_joueurs', 'charte_joueurs_mineurs'];
}

interface Season { id: string; name: string; active?: boolean; }
interface Doc {
  id: string;
  title: string;
  description?: string;
  category: CategoryKey;
  file_url: string;
  file_name: string;
  file_type: string;
  is_active: boolean;
  created_at: string;
  season_id?: string;
  target_team_ids?: string[] | null;
}

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  email: string | null;
  age: number | null;
}

export function Documents() {
  const { user, effectiveRole } = useAuth();
  const role = effectiveRole ?? 'member';
  const tabs = getAllowedCategories(role).map(k => ({ key: k, label: CATEGORY_LABELS[k] }));

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState('all');
  const [activeTab, setActiveTab] = useState<CategoryKey>(tabs[0]?.key ?? 'divers');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  // ack maps: [`${docId}:self`] or [`${docId}:child:${memberId}`]
  const [ackMap, setAckMap] = useState<Record<string, { at: string; validatedByParent?: boolean }>>({});
  const [ackChecked, setAckChecked] = useState<Record<string, boolean>>({});
  const [ackLoading, setAckLoading] = useState<string | null>(null);
  const [ackDone, setAckDone] = useState<Record<string, boolean>>({});

  const [selfAge, setSelfAge] = useState<number | null>(null);
  const [selfLegalReps, setSelfLegalReps] = useState<string[]>([]);
  const [selfMemberId, setSelfMemberId] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [coachTeamIds, setCoachTeamIds] = useState<string[]>([]);
  const [allCharteDocs, setAllCharteDocs] = useState<{ id: string; category: string }[]>([]);
  const [allCharteAckMap, setAllCharteAckMap] = useState<Record<string, boolean>>({});

  const [dlLoading, setDlLoading] = useState<string | null>(null);
  const [tabPendingCounts, setTabPendingCounts] = useState<Record<string, number>>({});
  const { toast, showToast } = useToast();
  const [loadFailed, setLoadFailed] = useState(false)

  const [searchParams] = useSearchParams();
  // Deep-link: open a specific document from ?doc=<id>&cat=<category> (runs once on mount).
  useEffect(() => {
    const doc = searchParams.get('doc');
    const cat = searchParams.get('cat');
    if (cat) setActiveTab(cat as CategoryKey);
    if (doc) {
      setSelectedSeason('all');   // avoid hiding the doc behind a season filter
      setOpenId(doc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Once docs are loaded, scroll to the deep-linked, opened document.
  useEffect(() => {
    const doc = searchParams.get('doc');
    if (!doc || openId !== doc) return;
    if (!docs.some(d => d.id === doc)) return;
    const el = document.getElementById(`doc-${doc}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, openId]);

  useEffect(() => {
    document.title = 'Documents - ClubSphere';
    loadSeasons();
    loadUserContext();
    loadAllCharteStatus();
  }, [user?.id]);

  useEffect(() => { loadDocs(); }, [activeTab, selectedSeason, selfAge, children, coachTeamIds]);
  useEffect(() => { loadAckMap(); }, [docs, children, selfMemberId]);
  useEffect(() => { computeTabPendingCounts(); }, [allCharteDocs, allCharteAckMap, selfMemberId, selfAge, children]);

  async function loadUserContext() {
    if (!user?.id) return;
    try {
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).maybeSingle();
      if (profile?.email) {
        const { data: members } = await supabase
          .from('members')
          .select('id, birth_date, legal_rep1_email, legal_rep2_email, departure_date')
          .ilike('email', profile.email);
        const member = members?.find(m => !m.departure_date) ?? members?.[0] ?? null;
        if (member) {
          setSelfMemberId(member.id);
          setSelfAge(calcAge(member.birth_date));
          const reps = [member.legal_rep1_email, member.legal_rep2_email].filter(Boolean) as string[];
          setSelfLegalReps(reps);
        }
      }
      const { data: pm } = await supabase
        .from('parent_members')
        .select('member_id, members:member_id(id, first_name, last_name, birth_date, email)')
        .eq('parent_user_id', user.id);
      const list: Child[] = [];
      for (const row of pm ?? []) {
        const c: any = row.members;
        if (!c) continue;
        list.push({
          id: c.id,
          first_name: c.first_name ?? '',
          last_name: c.last_name ?? '',
          birth_date: c.birth_date ?? null,
          email: c.email ?? null,
          age: calcAge(c.birth_date),
        });
      }
      setChildren(list);

      // Coach team lookup (not gated by role - works for admin+coach, committee+coach, etc.)
      const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle();
      if (coach) {
        const { data: staffRows } = await supabase
          .from('team_staff')
          .select('team_id')
          .eq('coach_id', coach.id);
        setCoachTeamIds((staffRows ?? []).map(t => t.team_id));
      }
    } catch (error) {
      reportLoadError('Documents', error)
      setLoadFailed(true)
    }
  }

  async function loadSeasons() {
    try {
      const { data } = await supabase.from('seasons').select('id, name, active').order('name', { ascending: false });
      const list: Season[] = data ?? [];
      setSeasons(list);
      const active = list.find(s => s.active);
      if (active) setSelectedSeason(active.id);
    } catch (error) {
      reportLoadError('Documents', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  async function loadAllCharteStatus() {
    if (!user?.id) return;
    const { data: seasons } = await supabase.from('seasons').select('id, active');
    const activeSeason = seasons?.find(s => s.active);
    let q = supabase
      .from('documents')
      .select('id, category')
      .in('category', ['charte_joueurs', 'charte_joueurs_mineurs'])
      .eq('is_active', true);
    if (activeSeason) q = q.eq('season_id', activeSeason.id);
    const { data: charteDocs } = await q;
    setAllCharteDocs((charteDocs ?? []) as { id: string; category: string }[]);
    const charteIds = (charteDocs ?? []).map(d => d.id);
    if (!charteIds.length) { setAllCharteAckMap({}); return; }
    const { data: acks } = await supabase
      .from('document_acknowledgements')
      .select('document_id, member_id')
      .in('document_id', charteIds);
    const map: Record<string, boolean> = {};
    for (const a of acks ?? []) {
      if (a.member_id) map[`${a.document_id}:${a.member_id}`] = true;
    }
    setAllCharteAckMap(map);
  }

  async function loadDocs() {
    setLoadFailed(false)
    setLoading(true)
    try {
      let q = supabase.from('documents').select('*').eq('category', activeTab).eq('is_active', true).order('created_at', { ascending: false });
      if (selectedSeason !== 'all') q = q.eq('season_id', selectedSeason);
      const { data } = await q;
      let list = (data ?? []) as Doc[];
      if (activeTab === 'charte_entraineurs' && coachTeamIds.length > 0) {
        list = list.filter(d => {
          const t = d.target_team_ids;
          return !t || t.length === 0 || coachTeamIds.some(id => t.includes(id));
        });
      }
      if (activeTab === 'charte_joueurs_mineurs') {
        const hasMinor = children.some(c => c.age === null || c.age < 18);
        if (!hasMinor) list = [];
      }
      setDocs(list);
    } catch (error) {
      reportLoadError('Documents', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  async function loadAckMap() {
    if (!user?.id) return;
    const charteIds = docs.filter(d => CHARTE_CATEGORIES.includes(d.category)).map(d => d.id);
    if (!charteIds.length) { setAckMap({}); return; }
    const { data } = await supabase
      .from('document_acknowledgements')
      .select('document_id, acknowledged_at, user_id, member_id, validated_by_parent_id')
      .in('document_id', charteIds);
    const childIds = new Set(children.map(c => c.id));
    const map: Record<string, { at: string; validatedByParent?: boolean }> = {};
    for (const r of data ?? []) {
      if (r.member_id && childIds.has(r.member_id)) {
        map[`${r.document_id}:child:${r.member_id}`] = { at: r.acknowledged_at, validatedByParent: true };
      } else if (r.user_id === user.id && !r.member_id) {
        map[`${r.document_id}:self`] = { at: r.acknowledged_at };
      } else if (selfMemberId && r.member_id === selfMemberId) {
        map[`${r.document_id}:self`] = { at: r.acknowledged_at, validatedByParent: !!r.validated_by_parent_id };
      }
    }
    setAckMap(map);
  }

  function computeTabPendingCounts() {
    const counts: Record<string, number> = {};
    if (allCharteDocs.length === 0) { setTabPendingCounts({}); return; }

    // charte_joueurs: 1 if self adult member not yet validated
    if (selfMemberId && (selfAge === null || selfAge >= 18)) {
      const hasPending = allCharteDocs.some(d => d.category === 'charte_joueurs' && !allCharteAckMap[`${d.id}:${selfMemberId}`]);
      if (hasPending) counts['charte_joueurs'] = 1;
    }

    // charte_joueurs_mineurs: count of minor children not yet validated
    const minors = children.filter(c => c.age === null || c.age < 18);
    let minorPending = 0;
    for (const child of minors) {
      const hasPending = allCharteDocs.some(d => d.category === 'charte_joueurs_mineurs' && !allCharteAckMap[`${d.id}:${child.id}`]);
      if (hasPending) minorPending++;
    }
    if (minorPending > 0) counts['charte_joueurs_mineurs'] = minorPending;

    setTabPendingCounts(counts);
  }

  async function handleDownload(doc: Doc) {
    setDlLoading(doc.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-document-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ document_id: doc.id }),
        }
      );
      let json: any = {};
      try { json = await res.json(); } catch { /* non-JSON response */ }
      if (json.signed_url) window.open(json.signed_url, '_blank');
      else showToast(`[${res.status}] ${json.error ?? 'Impossible de télécharger'}`, 'error');
    } catch (e: any) { showToast('Erreur réseau: ' + (e?.message ?? e), 'error'); }
    finally { setDlLoading(null); }
  }

  async function handleAcknowledge(doc: Doc, childId?: string) {
    if (!user?.id) return;
    const key = childId ? `${doc.id}:child:${childId}` : `${doc.id}:self`;
    setAckLoading(key);
    try {
      let memberId: string | null = childId ?? null;
      if (!childId) {
        if (selfMemberId) {
          memberId = selfMemberId;
        } else {
          const { data: authData } = await supabase.auth.getUser();
          const email = authData.user?.email;
          if (email) {
            const { data: memberRow } = await supabase
              .from('members')
              .select('id')
              .ilike('email', email)
              .maybeSingle();
            if (memberRow?.id) memberId = memberRow.id;
            else console.warn('No member row matched authenticated user email for self-acknowledgement', { email });
          } else {
            console.warn('Authenticated user has no email for self-acknowledgement lookup');
          }
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-document-acknowledgement`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: doc.id, member_id: memberId, validated_by_parent: !!childId }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setAckMap(p => ({ ...p, [key]: { at: new Date().toISOString(), validatedByParent: !!childId } }));
        setAckDone(p => ({ ...p, [key]: true }));
        const ackedMemberId = childId ?? selfMemberId;
        if (ackedMemberId) setAllCharteAckMap(p => ({ ...p, [`${doc.id}:${ackedMemberId}`]: true }));
      } else {
        showToast(json.error ?? 'Erreur lors de la confirmation', 'error');
      }
    } catch { showToast('Erreur lors de la confirmation', 'error'); }
    finally { setAckLoading(null); }
  }

  if (!user) return null;

  return (
    <div className="p-4 lg:p-8 w-full max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Documents</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Documents officiels du club</p>
      </div>

      {/* Season selector */}
      <div className="mb-5">
        <select
          value={selectedSeason}
          onChange={e => setSelectedSeason(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
        >
          <option value="all">Toutes les saisons</option>
          {seasons.map(s => (
            <option key={s.id} value={s.id}>{s.name}{s.active ? ' (active)' : ''}</option>
          ))}
        </select>
      </div>

      {/* Category tabs */}
      <Tabs
        items={tabs.map(tab => ({ key: tab.key, label: tab.label, count: tabPendingCounts[tab.key] || undefined }))}
        value={activeTab}
        onChange={(id) => setActiveTab(id as CategoryKey)}
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2" style={{ borderColor: 'var(--accent)' }} />
        </div>
      ) : loadFailed ? (
        <LoadError onRetry={loadDocs} />
      ) : docs.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>Aucun document disponible pour cette catégorie.</div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => {
            const isOpen = openId === doc.id;
            const isCharte = CHARTE_CATEGORIES.includes(doc.category);
            const selfAcked = ackMap[`${doc.id}:self`];

            return (
              <div
                key={doc.id}
                id={`doc-${doc.id}`}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}
              >
                <button
                  onClick={() => setOpenId(p => p === doc.id ? null : doc.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', gap: '12px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                    {doc.file_type === 'pdf'
                      ? <FileText size={17} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                      : <Image size={17} style={{ color: 'var(--info-text)', flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                        {new Date(doc.created_at).toLocaleDateString('fr-CH')}
                        {isCharte && selfAcked && <span style={{ color: 'var(--success)', marginLeft: '8px' }}>Validé</span>}
                      </div>
                    </div>
                  </div>
                  <ChevronDown
                    size={17}
                    style={{ color: 'var(--text-secondary)', flexShrink: 0, transition: 'transform 0.25s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>

                <div style={{ maxHeight: isOpen ? '1200px' : '0', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                  <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border-color)' }}>
                    {doc.description && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '12px', marginBottom: '12px' }}>{doc.description}</p>
                    )}

                    <div style={{ marginTop: '14px' }}>
                      <Button
                        variant="primary"
                        leftIcon={<Download size={14} />}
                        loading={dlLoading === doc.id}
                        disabled={dlLoading === doc.id}
                        onClick={() => handleDownload(doc)}
                      >
                        {isCharte ? 'Télécharger et lire' : 'Télécharger'}
                      </Button>
                    </div>

                    {isCharte && renderValidationBlock(doc)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Toast toast={toast} />
    </div>
  );

  function renderValidationBlock(doc: Doc) {
    const selfAcked = ackMap[`${doc.id}:self`];
    const selfKey = `${doc.id}:self`;

    // charte_joueurs_mineurs: show children (minors) validation
    if (doc.category === 'charte_joueurs_mineurs') {
      const minors = children.filter(c => c.age === null || c.age < 18);
      if (minors.length === 0) {
        return (
          <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-hover)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
            Aucun enfant mineur lié à votre compte.
          </div>
        );
      }
      return (
        <div style={{ marginTop: '16px' }}>
          {minors.map(child => {
            const childKey = `${doc.id}:child:${child.id}`;
            const acked = ackMap[childKey];
            return (
              <div key={child.id} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', marginBottom: '10px' }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
                  {child.first_name} {child.last_name}
                </div>
                {acked ? (
                  <div style={{ color: 'var(--success)', fontSize: '13px' }}>
                    Validé le {new Date(acked.at).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                ) : ackDone[childKey] ? (
                  <div style={{ color: 'var(--success)', fontSize: '13px' }}>Validation enregistrée.</div>
                ) : (
                  <>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
                      <input
                        type="checkbox"
                        checked={!!ackChecked[childKey]}
                        onChange={e => setAckChecked(p => ({ ...p, [childKey]: e.target.checked }))}
                        style={{ marginTop: '2px', width: '16px', height: '16px' }}
                      />
                      <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        J'atteste avoir pris connaissance de la charte au nom de mon enfant <strong>{child.first_name} {child.last_name}</strong>
                      </span>
                    </label>
                    <button
                      onClick={() => handleAcknowledge(doc, child.id)}
                      disabled={!ackChecked[childKey] || ackLoading === childKey}
                      style={{
                        background: ackChecked[childKey] ? 'var(--success-soft)' : 'var(--bg-hover)',
                        color: ackChecked[childKey] ? 'var(--success)' : 'var(--text-muted)',
                        border: `1px solid ${ackChecked[childKey] ? 'var(--success)' : 'var(--border-color)'}`,
                        padding: '7px 14px', borderRadius: '7px',
                        fontWeight: 600, fontSize: '13px',
                        cursor: ackChecked[childKey] && ackLoading !== childKey ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {ackLoading === childKey ? 'Enregistrement…' : `Confirmer pour ${child.first_name}`}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // charte_joueurs (adults): self-validation for the user's own adult member record
    if (doc.category === 'charte_joueurs') {
      if (selfAge !== null && selfAge < 18) {
        return (
          <div style={{ marginTop: '16px' }}>
            <Alert variant="info">
              Cette charte doit être validée par votre représentant légal.
              {selfLegalReps.length > 0 && (
                <div style={{ marginTop: '6px', fontSize: '12px', opacity: 0.85 }}>
                  Représentant(s) : {selfLegalReps.join(', ')}
                </div>
              )}
            </Alert>
          </div>
        );
      }
      if (!selfMemberId) {
        return (
          <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-hover)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
            Aucun profil joueur adulte lié à votre compte.
          </div>
        );
      }
    }

    // default (adult member, coach): self-validation
    if (selfAcked) {
      return (
        <div style={{ marginTop: '16px' }}>
          <Alert variant="success">
            {selfAcked.validatedByParent
              ? `Validé par votre représentant légal le ${new Date(selfAcked.at).toLocaleDateString('fr-CH')}`
              : `Vous avez validé ce document le ${new Date(selfAcked.at).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })}`}
          </Alert>
        </div>
      );
    }
    if (ackDone[selfKey]) {
      return (
        <div style={{ marginTop: '16px' }}>
          <Alert variant="success">Votre confirmation a été enregistrée.</Alert>
        </div>
      );
    }
    return (
      <div style={{ marginTop: '16px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '12px' }}>
          <input
            type="checkbox"
            checked={!!ackChecked[selfKey]}
            onChange={e => setAckChecked(p => ({ ...p, [selfKey]: e.target.checked }))}
            style={{ marginTop: '2px', width: '16px', height: '16px' }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            J'ai lu et accepté la charte <strong>{doc.title}</strong>
          </span>
        </label>
        <button
          onClick={() => handleAcknowledge(doc)}
          disabled={!ackChecked[selfKey] || ackLoading === selfKey}
          style={{
            background: ackChecked[selfKey] ? 'var(--success-soft)' : 'var(--bg-hover)',
            color: ackChecked[selfKey] ? 'var(--success)' : 'var(--text-muted)',
            border: `1px solid ${ackChecked[selfKey] ? 'var(--success)' : 'var(--border-color)'}`,
            padding: '8px 18px', borderRadius: '7px',
            fontWeight: 600, fontSize: '14px',
            cursor: ackChecked[selfKey] && ackLoading !== selfKey ? 'pointer' : 'not-allowed',
          }}
        >
          {ackLoading === selfKey ? 'Enregistrement…' : 'Confirmer ma prise de connaissance'}
        </button>
      </div>
    );
  }
}
