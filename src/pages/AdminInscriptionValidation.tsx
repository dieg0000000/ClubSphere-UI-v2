import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatAVS, validateAVS } from '../utils/formatHelpers';
import { formatPhone as formatPhoneIntl } from '../utils/phoneHelpers';
import Button from '../components/ui/Button';
import ConfirmModal from '../components/ConfirmModal';
import { StandardModal } from '../components/StandardModal';
import findLegalRepAccounts from '../lib/legalRepAccountLookup';
import CopyIconButton from '../components/CopyIconButton';
import { Alert } from '../components/ui/Alert';
import CountrySelect from '../components/CountrySelect';

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
  legal_rep1_relation: string | null;
  legal_rep2_firstname: string | null;
  legal_rep2_lastname: string | null;
  legal_rep2_email: string | null;
  legal_rep2_phone: string | null;
  legal_rep2_relation: string | null;
  photo_consent: boolean;
  id_card_front_path: string | null;
  id_card_back_path: string | null;
  health_insurance_card_path: string | null;
  passport_photo_path: string | null;
  avs_number_ocr: string | null;
  status: string;
  processed_by: string | null;
  submitted_at: string;
}

interface TeamRow {
  id: string;
  name: string;
  active: boolean;
}

const BUCKET = 'inscription-id-cards';

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{title}</div>
      <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: 10, padding: 14 }}>
        {children}
      </div>
    </div>
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

function Input({ label, value, onChange, required = false, type = 'text', readOnly = false, copyable = false, copyValue, copyLabel, id }: { label: string; value: string; onChange?: (v: string) => void; required?: boolean; type?: string; readOnly?: boolean; copyable?: boolean; copyValue?: string; copyLabel?: string; id?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={type}
          value={value}
          readOnly={readOnly}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          style={{
            width: '100%', padding: copyable ? '8px 36px 8px 12px' : '8px 12px', borderRadius: 8,
            background: readOnly ? 'var(--bg-hover)' : 'var(--bg-input)',
            color: readOnly ? 'var(--text-secondary)' : 'var(--text-primary)',
            border: '1px solid var(--border-color)', fontSize: 14,
          }}
        />
        {copyable && (
          <div style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>
            <CopyIconButton value={copyValue ?? value} label={copyLabel ?? label} size={15} />
          </div>
        )}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options, required = false }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 8,
          background: 'var(--bg-input)', color: 'var(--text-primary)',
          border: '1px solid var(--border-color)', fontSize: 14,
        }}
      >
        <option value="">— Sélectionner —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Check2({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 20, height: 20, borderRadius: 6,
          border: `1px solid ${checked ? 'var(--primary)' : 'var(--border-color)'}`,
          background: checked ? 'var(--primary)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {checked && <Check size={14} color="var(--text-inverse)" />}
      </span>
      <span style={{ color: 'var(--text-primary)', fontSize: 14 }}>{label}</span>
    </label>
  );
}

export default function AdminInscriptionValidation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<InscriptionRequest | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<{ front?: string; back?: string; health?: string; passport?: string }>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [nationality, setNationality] = useState('');
  const [placeOfOrigin, setPlaceOfOrigin] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [lr1First, setLr1First] = useState('');
  const [lr1Last, setLr1Last] = useState('');
  const [lr1Email, setLr1Email] = useState('');
  const [lr1Phone, setLr1Phone] = useState('');
  const [lr1Relation, setLr1Relation] = useState('');
  const [lr2First, setLr2First] = useState('');
  const [lr2Last, setLr2Last] = useState('');
  const [lr2Email, setLr2Email] = useState('');
  const [lr2Phone, setLr2Phone] = useState('');
  const [lr2Relation, setLr2Relation] = useState('');
  const [avsNumber, setAvsNumber] = useState('');
  const [affiliationDate, setAffiliationDate] = useState(new Date().toISOString().slice(0, 10));
  const [teamId, setTeamId] = useState('');
  const [photoConsent, setPhotoConsent] = useState(false);
  const [asfLicence, setAsfLicence] = useState('');

  const [chkIdentity, setChkIdentity] = useState(false);
  const [chkClubcornerPlayer, setChkClubcornerPlayer] = useState(false);
  const [chkClubcornerPhotos, setChkClubcornerPhotos] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [accountMatch, setAccountMatch] = useState<{ name: string; field: 'lr1' | 'lr2' } | null>(null);
  const [checkingMatch, setCheckingMatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadSignedUrls = useCallback(async (r: InscriptionRequest) => {
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
  }, []);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const { data: reqData, error: reqErr } = await supabase
      .from('inscription_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (reqErr || !reqData) {
      setError('Demande introuvable.');
      setLoading(false);
      return;
    }
    const r = reqData as InscriptionRequest;
    if (r.status !== 'in_progress') {
      setError("Cette demande n'est pas en cours de traitement.");
      setRequest(r);
      setLoading(false);
      return;
    }
    if (r.processed_by !== user?.id) {
      setError('Cette demande est traitée par un autre administrateur.');
      setRequest(r);
      setLoading(false);
      return;
    }
    setRequest(r);

    setFirstName(r.first_name || '');
    setLastName(r.last_name || '');
    setBirthDate(r.birth_date || '');
    setGender((() => {
      const g = (r.gender || '').trim().toLowerCase();
      if (g === 'm' || g === 'masculin' || g === 'male') return 'M';
      if (g === 'f' || g === 'féminin' || g === 'feminin' || g === 'female') return 'F';
      if (g === 'o' || g === 'autre' || g === 'other') return 'O';
      return '';
    })());
    setNationality(r.nationality || '');
    setPlaceOfOrigin(r.place_of_origin || '');
    setAddress(r.address || '');
    setPostalCode(r.postal_code || '');
    setCity(r.city || '');
    setPlayerEmail(r.player_email || '');
    setPlayerPhone(r.player_phone || '');
    setLr1First(r.legal_rep1_firstname || '');
    setLr1Last(r.legal_rep1_lastname || '');
    setLr1Email(r.legal_rep1_email || '');
    setLr1Phone(r.legal_rep1_phone || '');
    setLr1Relation(r.legal_rep1_relation || '');
    setLr2First(r.legal_rep2_firstname || '');
    setLr2Last(r.legal_rep2_lastname || '');
    setLr2Email(r.legal_rep2_email || '');
    setLr2Phone(r.legal_rep2_phone || '');
    setLr2Relation(r.legal_rep2_relation || '');
    setPhotoConsent(!!r.photo_consent);
    setAsfLicence(r.asf_licence_number || '');

    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name, active')
      .eq('active', true)
      .order('name');
    setTeams((teamsData || []) as TeamRow[]);

    await loadSignedUrls(r);
    setLoading(false);
  }, [id, user?.id, loadSignedUrls]);

  useEffect(() => { document.title = 'Inscriptions - ClubSphere' }, [])
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const allChecksDone = chkIdentity && chkClubcornerPlayer && chkClubcornerPhotos;
  const isTransfer = request?.has_played_before === true;
  const avsValid = isTransfer ? (!avsNumber || validateAVS(avsNumber)) : validateAVS(avsNumber);
  const asfValid = !asfLicence || /^\d{6,10}$/.test(asfLicence);
  const canSubmit = !!firstName.trim() && !!lastName.trim() && !!birthDate && avsValid && asfValid && !!affiliationDate && !!teamId && allChecksDone && !submitting;

  const handleCreateClick = async () => {
    const candidates: Array<{ field: 'lr1' | 'lr2'; email: string }> = [];
    const e1 = lr1Email.trim();
    const e2 = lr2Email.trim();
    if (e1) candidates.push({ field: 'lr1', email: e1 });
    if (e2) candidates.push({ field: 'lr2', email: e2 });
    if (candidates.length === 0) {
      setConfirmOpen(true);
      return;
    }
    setCheckingMatch(true);
    try {
      const matches = await findLegalRepAccounts(candidates.map((c) => c.email));
      const hit = candidates.find((c) => matches.get(c.email.toLowerCase()));
      if (hit) {
        setAccountMatch({ name: matches.get(hit.email.toLowerCase())!, field: hit.field });
        return;
      }
      setConfirmOpen(true);
    } finally {
      setCheckingMatch(false);
    }
  };

  const confirmAccountMatch = () => {
    setAccountMatch(null);
    setConfirmOpen(true);
  };

  const cancelAccountMatch = () => {
    const field = accountMatch?.field;
    setAccountMatch(null);
    setTimeout(() => {
      const el = document.getElementById(field === 'lr2' ? 'lr2-email' : 'lr1-email');
      if (el) (el as HTMLInputElement).focus();
    }, 50);
  };

  const handleSubmit = async () => {
    if (!request) return;
    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        showToast('error', 'Session expirée, veuillez vous reconnecter.');
        setSubmitting(false);
        return;
      }

      const payload = {
        inscription_request_id: request.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birth_date: birthDate,
        gender: gender || null,
        nationality: nationality || null,
        address: address || null,
        postal_code: postalCode || null,
        city: city || null,
        email: playerEmail || null,
        phone: playerPhone || null,
        legal_rep1_firstname: lr1First || null,
        legal_rep1_lastname: lr1Last || null,
        legal_rep1_email: lr1Email || null,
        legal_rep1_phone: lr1Phone || null,
        legal_rep1_relation: lr1Relation || null,
        legal_rep2_firstname: lr2First || null,
        legal_rep2_lastname: lr2Last || null,
        legal_rep2_email: lr2Email || null,
        legal_rep2_phone: lr2Phone || null,
        legal_rep2_relation: lr2Relation || null,
        avs_number: avsNumber || null,
        asf_licence_number: asfLicence.trim() || null,
        affiliation_date: affiliationDate,
        team_id: teamId,
        photo_consent: photoConsent,
      };

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-inscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detailsParts = [data?.details, data?.code ? `(${data.code})` : null, data?.hint].filter(Boolean);
        const fullMsg = [data?.error || 'Erreur lors de la création du joueur.', detailsParts.join(' ')].filter(Boolean).join(' — ');
        showToast('error', fullMsg);
        setSubmitting(false);
        setConfirmOpen(false);
        return;
      }
      showToast('success', 'Joueur créé avec succès.');
      setConfirmOpen(false);
      setTimeout(() => navigate('/admin/inscriptions'), 900);
    } catch (e) {
      console.error(e);
      showToast('error', 'Erreur réseau. Veuillez réessayer.');
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-6" style={{ background: 'var(--bg-page)' }}>
        <button onClick={() => navigate('/admin/inscriptions')} className="flex items-center gap-2 mb-6" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={16} /> Retour
        </button>
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }

  if (!request) return null;

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--bg-page)' }}>
      <div className="w-full mx-auto" style={{ maxWidth: 1400 }}>
        <button onClick={() => navigate('/admin/inscriptions')} className="flex items-center gap-2 mb-4 hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={16} /> Retour aux demandes
        </button>

        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Valider la demande d'inscription</h1>
              {request.has_played_before ? (
                <span style={{ background: 'var(--info-soft)', color: 'var(--info-text)', border: '1px solid var(--info)', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>Transfert ASF</span>
              ) : (
                <span style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>Première inscription</span>
              )}
            </div>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              {request.first_name} {request.last_name} · né(e) le {fmtDate(request.birth_date)} ({computeAge(request.birth_date)} ans)
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 24 }}>
          <div>
            <Section title="A. Antécédents">
              <Input label="Déjà licencié" value={request.has_played_before ? 'Oui' : 'Non'} readOnly />
              <Input
                label="N° licence ASF (facultatif, 6 à 10 chiffres)"
                value={asfLicence}
                onChange={(v) => setAsfLicence(v.replace(/\D/g, '').slice(0, 10))}
                copyable
              />
              {asfLicence && !asfValid && (
                <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: -6, marginBottom: 8 }}>
                  Le numéro de licence doit contenir 6 à 10 chiffres.
                </div>
              )}
              {request.has_played_before && request.previous_club && (
                <Input label="Club précédent (déclaré)" value={request.previous_club} readOnly copyable />
              )}
            </Section>

            <Section title="B. Identité">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input label="Prénom" value={firstName} onChange={setFirstName} required copyable />
                <Input label="Nom" value={lastName} onChange={setLastName} required copyable />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input
                  label="Date de naissance"
                  type="date"
                  value={birthDate}
                  onChange={setBirthDate}
                  required
                  copyable
                  copyValue={birthDate ? fmtDate(birthDate) : ''}
                  copyLabel="date de naissance"
                />
                <Select
                  label="Sexe"
                  value={gender}
                  onChange={setGender}
                  options={[{ value: 'M', label: 'Masculin' }, { value: 'F', label: 'Féminin' }, { value: 'O', label: 'Autre' }]}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Nationalité</label>
                  <CountrySelect value={nationality} onChange={setNationality} />
                </div>
                <Input label="Lieu d'origine (info Clubcorner)" value={placeOfOrigin} readOnly />
              </div>
            </Section>

            <Section title="C. Adresse">
              <Input label="Adresse" value={address} onChange={setAddress} copyable />
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                <Input label="NPA" value={postalCode} onChange={setPostalCode} copyable />
                <Input label="Localité" value={city} onChange={setCity} copyable />
              </div>
            </Section>

            <Section title="D. Contact joueur">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input label="Email" type="email" value={playerEmail} onChange={setPlayerEmail} copyable />
                <Input
                  label="Téléphone"
                  value={playerPhone}
                  onChange={setPlayerPhone}
                  copyable
                  copyValue={playerPhone ? formatPhoneIntl(playerPhone) : ''}
                  copyLabel="téléphone du joueur"
                />
              </div>
            </Section>

            <Section title="E. Représentants légaux">
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>Représentant 1</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input label="Prénom" value={lr1First} onChange={setLr1First} copyable />
                <Input label="Nom" value={lr1Last} onChange={setLr1Last} copyable />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Input label="Email" type="email" value={lr1Email} onChange={setLr1Email} copyable id="lr1-email" />
                <Input
                  label="Téléphone"
                  value={lr1Phone}
                  onChange={setLr1Phone}
                  copyable
                  copyValue={lr1Phone ? formatPhoneIntl(lr1Phone) : ''}
                  copyLabel="téléphone du représentant 1"
                />
                <Input label="Lien" value={lr1Relation} onChange={setLr1Relation} />
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 12, marginBottom: 8 }}>Représentant 2 (optionnel)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input label="Prénom" value={lr2First} onChange={setLr2First} copyable />
                <Input label="Nom" value={lr2Last} onChange={setLr2Last} copyable />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Input label="Email" type="email" value={lr2Email} onChange={setLr2Email} copyable id="lr2-email" />
                <Input
                  label="Téléphone"
                  value={lr2Phone}
                  onChange={setLr2Phone}
                  copyable
                  copyValue={lr2Phone ? formatPhoneIntl(lr2Phone) : ''}
                  copyLabel="téléphone du représentant 2"
                />
                <Input label="Lien" value={lr2Relation} onChange={setLr2Relation} />
              </div>
            </Section>

            <Section title="F. Informations club">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input
                  label="Numéro AVS (756.XXXX.XXXX.XX)"
                  value={avsNumber}
                  onChange={(v) => setAvsNumber(formatAVS(v))}
                  required={!isTransfer}
                  copyable
                  copyLabel="numéro AVS"
                />
                <Input label="Date d'affiliation" type="date" value={affiliationDate} onChange={setAffiliationDate} required />
              </div>
              {isTransfer && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: -6, marginBottom: 12 }}>
                  En cas de transfert, l'AVS peut être renseigné plus tard si non disponible dans Clubcorner.
                </div>
              )}
              {!!avsNumber && !validateAVS(avsNumber) && (
                <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: -6, marginBottom: 12 }}>
                  Format attendu : 756.XXXX.XXXX.XX
                </div>
              )}
              {request.avs_number_ocr && request.avs_number_ocr !== avsNumber && (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, padding: '8px 12px', marginBottom: 12,
                    background: 'var(--info-soft)',
                    border: '1px solid var(--info)',
                    borderRadius: 8, color: 'var(--info-text)', fontSize: 12,
                  }}
                >
                  <span>Suggestion OCR : <strong style={{ color: 'var(--text-primary)' }}>{request.avs_number_ocr}</strong></span>
                  <button
                    type="button"
                    onClick={() => setAvsNumber(formatAVS(request.avs_number_ocr!))}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)',
                      background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Utiliser
                  </button>
                </div>
              )}
              <Select
                label="Équipe d'affectation"
                value={teamId}
                onChange={setTeamId}
                options={teams.map(t => ({ value: t.id, label: t.name }))}
                required
              />
              <div style={{ marginTop: 8 }}>
                <Check2 checked={photoConsent} onChange={setPhotoConsent} label="Diffusion photos / vidéos autorisée" />
              </div>
            </Section>
          </div>

          <div>
            <div style={{ position: 'sticky', top: 16 }}>
              <Section title="Documents">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {!request.has_played_before && (
                    <>
                      <Thumbnail label="CI recto" url={signedUrls.front} onOpen={setPreviewUrl} />
                      <Thumbnail label="CI verso" url={signedUrls.back} onOpen={setPreviewUrl} />
                      <Thumbnail label="Assurance maladie" url={signedUrls.health} onOpen={setPreviewUrl} />
                    </>
                  )}
                  <Thumbnail label="Photo passeport" url={signedUrls.passport} onOpen={setPreviewUrl} />
                </div>
              </Section>

              <Section title="Checklist de validation">
                <Check2 checked={chkIdentity} onChange={setChkIdentity} label="Identité contrôlée" />
                <Check2 checked={chkClubcornerPlayer} onChange={setChkClubcornerPlayer} label="Joueur créé dans Clubcorner" />
                <Check2 checked={chkClubcornerPhotos} onChange={setChkClubcornerPhotos} label="Photos uploadées dans Clubcorner" />
              </Section>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Button variant="primary" disabled={!canSubmit || checkingMatch} onClick={handleCreateClick}>
                  Créer le joueur
                </Button>
                <Button variant="secondary" onClick={() => navigate('/admin/inscriptions')}>
                  Annuler
                </Button>
                {!canSubmit && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                    Complétez les champs obligatoires et cochez la checklist.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setPreviewUrl(null)}>
          <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 text-white"><X size={28} /></button>
          <img src={previewUrl} alt="Aperçu" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}

      <StandardModal
        isOpen={!!accountMatch}
        onClose={cancelAccountMatch}
        title="Compte existant détecté"
        width="440px"
      >
        <p style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>
          Un compte existe pour cet email : <strong>{accountMatch?.name}</strong>. Il sera automatiquement lié comme parent de <strong>{firstName.trim() || "l'enfant"}</strong>.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="secondary" onClick={cancelAccountMatch}>Annuler</Button>
          <Button variant="primary" onClick={confirmAccountMatch}>OK</Button>
        </div>
      </StandardModal>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Créer le joueur"
        message={`Confirmez-vous la création du joueur ${firstName} ${lastName} dans l'équipe sélectionnée ? Cette action créera définitivement la fiche membre et archivera la demande.`}
        confirmLabel="Créer le joueur"
        confirmStyle="primary"
        loading={submitting}
        loadingLabel="Création…"
        onConfirm={handleSubmit}
        onCancel={() => setConfirmOpen(false)}
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
