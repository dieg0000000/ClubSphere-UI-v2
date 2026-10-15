import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { safeUUID } from '../lib/ids';
import {
  History,
  FileText,
  User,
  CircleCheck as CheckCircle,
  Check,
  Upload,
  X as XIcon,
  Loader as Loader2,
  Shield,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import PhoneInput from '../components/PhoneInput';
import { HelpButton } from '../components/HelpButton';
import { formatPhone, isValidPhone } from '../utils/phoneHelpers';
import { formatAvsInput, isCompleteAvs } from '../utils/avs';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import CountrySelect from '../components/CountrySelect';

type StepKey = 1 | 2 | 3 | 4;
type DocumentType = 'ci' | 'permit' | 'passport';
type DocumentSlot = 'id_card_front' | 'id_card_back' | 'permit_front' | 'permit_back' | 'passport_page' | 'health_insurance' | 'passport_photo';

interface ClubData {
  id: string;
  club_name: string;
  logo_url: string | null;
  primary_color: string | null;
  primary_dark: string | null;
  accent_color: string | null;
  club_email: string | null;
}

interface UploadedDoc {
  path: string;
  url: string;
  fileName: string;
}

interface FormData {
  has_played_before: boolean | null;
  previous_licence_number: string;
  previous_club: string;
  document_type: DocumentType | null;
  id_card_front: UploadedDoc | null;
  id_card_back: UploadedDoc | null;
  permit_front: UploadedDoc | null;
  permit_back: UploadedDoc | null;
  passport_page: UploadedDoc | null;
  health_insurance: UploadedDoc | null;
  passport_photo: UploadedDoc | null;

  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  nationality: string;
  place_of_origin: string;

  address: string;
  postal_code: string;
  city: string;

  player_email: string;
  player_phone: string;

  legal_rep1_firstname: string;
  legal_rep1_lastname: string;
  legal_rep1_email: string;
  legal_rep1_phone: string;
  legal_rep2_firstname: string;
  legal_rep2_lastname: string;
  legal_rep2_email: string;
  legal_rep2_phone: string;

  photo_consent: boolean | null;
  avs_number_ocr: string | null;
  privacy_consent: boolean;
}

const STEPS: { key: StepKey; label: string; icon: typeof History }[] = [
  { key: 1, label: 'Antécédents', icon: History },
  { key: 2, label: 'Documents', icon: FileText },
  { key: 3, label: 'Informations', icon: User },
  { key: 4, label: 'Consentement', icon: CheckCircle },
];

const BUCKET = 'inscription-id-cards';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length === 0 || t.length > 254) return false;
  return EMAIL_RE.test(t);
}

function toTitleCase(s: string): string {
  if (!s) return s;
  return s.trim().toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function computeAge(birthDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const d = new Date(birthDate + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function applyTheme(club: ClubData) {
  const root = document.documentElement;
  if (club.primary_color) root.style.setProperty('--accent', club.primary_color);
  if (club.primary_dark) root.style.setProperty('--accent-hover', club.primary_dark);
  if (club.accent_color) root.style.setProperty('--accent', club.accent_color);
}

const INITIAL_FORM: FormData = {
  has_played_before: null,
  previous_licence_number: '',
  previous_club: '',
  document_type: null,
  id_card_front: null,
  id_card_back: null,
  permit_front: null,
  permit_back: null,
  passport_page: null,
  health_insurance: null,
  passport_photo: null,
  first_name: '',
  last_name: '',
  birth_date: '',
  gender: '',
  nationality: '',
  place_of_origin: '',
  address: '',
  postal_code: '',
  city: '',
  player_email: '',
  player_phone: '',
  legal_rep1_firstname: '',
  legal_rep1_lastname: '',
  legal_rep1_email: '',
  legal_rep1_phone: '',
  legal_rep2_firstname: '',
  legal_rep2_lastname: '',
  legal_rep2_email: '',
  legal_rep2_phone: '',
  photo_consent: null,
  avs_number_ocr: null,
  privacy_consent: false,
};

interface OcrExtracted {
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  nationality?: string | null;
  place_of_origin?: string | null;
  legal_rep1_firstname?: string | null;
  legal_rep1_lastname?: string | null;
  legal_rep2_firstname?: string | null;
  legal_rep2_lastname?: string | null;
  avs_number?: string | null;
}

export default function PublicInscription() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [club, setClub] = useState<ClubData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepKey>(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const sessionIdRef = useRef<string>(safeUUID());

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [honeyPot, setHoneyPot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [licenceTouched, setLicenceTouched] = useState(false);
  const [ocrInProgress, setOcrInProgress] = useState(false);
  const [ocrWarnings, setOcrWarnings] = useState<string[]>([]);
  const [ocrPrefilled, setOcrPrefilled] = useState(false);
  const [capacityInfo, setCapacityInfo] = useState<{ category_name: string } | null>(null);
  const [waitlisted, setWaitlisted] = useState(false);
  const [attemptedSteps, setAttemptedSteps] = useState<Record<StepKey, boolean>>({ 1: false, 2: false, 3: false, 4: false });
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Inscription au club';
    loadClub();
  }, [slug]);

  const loadClub = async () => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .rpc('get_club_by_inscription_slug', { p_slug: slug })
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setClub(data as ClubData);
        applyTheme(data as ClubData);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const capacityCallId = useRef(0);
  useEffect(() => {
    if (!club?.id || !formData.birth_date) {
      setCapacityInfo(null);
      return;
    }
    const date = new Date(formData.birth_date);
    if (isNaN(date.getTime())) {
      setCapacityInfo(null);
      return;
    }
    const callId = ++capacityCallId.current;
    (async () => {
      try {
        const { data, error } = await supabase
          .rpc('check_inscription_capacity', { p_club_id: club.id, p_birth_date: formData.birth_date });
        if (callId !== capacityCallId.current) return;
        if (error) {
          setCapacityInfo(null);
          return;
        }
        const cap = Array.isArray(data) ? data[0] : data;
        if (cap && cap.is_full) {
          setCapacityInfo({ category_name: cap.category_name });
        } else {
          setCapacityInfo(null);
        }
      } catch {
        if (callId === capacityCallId.current) setCapacityInfo(null);
      }
    })();
  }, [formData.birth_date, club?.id]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const age = useMemo(() => computeAge(formData.birth_date), [formData.birth_date]);
  const isMinor = age !== null && age < 18;
  const isAdult = age !== null && age >= 18;

  const getStepErrors = (step: StepKey): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (formData.has_played_before === null) errs['has_played_before'] = 'Champ obligatoire';
      const lic = formData.previous_licence_number;
      if (lic && !/^\d{6,10}$/.test(lic)) errs['licence'] = 'Le numéro doit contenir 6 à 10 chiffres';
    }
    if (step === 2) {
      if (formData.has_played_before === true) {
        // passport_photo is optional
      } else {
        if (!formData.document_type) errs['document_type'] = 'Champ obligatoire';
        if (!formData.health_insurance) errs['health_insurance'] = 'Champ obligatoire';
        if (formData.document_type === 'ci') {
          if (!formData.id_card_front) errs['id_card_front'] = 'Champ obligatoire';
          if (!formData.id_card_back) errs['id_card_back'] = 'Champ obligatoire';
        }
        if (formData.document_type === 'permit') {
          if (!formData.permit_front) errs['permit_front'] = 'Champ obligatoire';
          if (!formData.permit_back) errs['permit_back'] = 'Champ obligatoire';
        }
        if (formData.document_type === 'passport') {
          if (!formData.passport_page) errs['passport_page'] = 'Champ obligatoire';
        }
      }
    }
    if (step === 3) {
      if (!formData.first_name.trim()) errs['first_name'] = 'Champ obligatoire';
      if (!formData.last_name.trim()) errs['last_name'] = 'Champ obligatoire';
      if (age === null || age < 4 || age > 99) errs['birth_date'] = age === null ? 'Champ obligatoire' : 'Âge invalide (4-99 ans)';
      if (!formData.gender) errs['gender'] = 'Champ obligatoire';
      if (!formData.nationality.trim()) errs['nationality'] = 'Champ obligatoire';
      if (!formData.address.trim()) errs['address'] = 'Champ obligatoire';
      if (!/^\d{4,5}$/.test(formData.postal_code)) errs['postal_code'] = formData.postal_code.trim() ? 'Code postal invalide' : 'Champ obligatoire';
      if (!formData.city.trim()) errs['city'] = 'Champ obligatoire';
      if (isAdult) {
        if (!formData.player_email.trim()) errs['player_email'] = 'Champ obligatoire';
        else if (!isValidEmail(formData.player_email)) errs['player_email'] = 'Adresse email invalide';
      } else if (formData.player_email.trim() && !isValidEmail(formData.player_email)) {
        errs['player_email'] = 'Adresse email invalide';
      }
      if (formData.player_phone.trim() && !isValidPhone(formData.player_phone)) errs['player_phone'] = 'Numéro invalide';
      if (isMinor) {
        if (!formData.legal_rep1_firstname.trim()) errs['legal_rep1_firstname'] = 'Champ obligatoire';
        if (!formData.legal_rep1_lastname.trim()) errs['legal_rep1_lastname'] = 'Champ obligatoire';
        if (!formData.legal_rep1_email.trim()) errs['legal_rep1_email'] = 'Champ obligatoire';
        else if (!isValidEmail(formData.legal_rep1_email)) errs['legal_rep1_email'] = 'Adresse email invalide';
        if (!formData.legal_rep1_phone.trim()) errs['legal_rep1_phone'] = 'Champ obligatoire';
        else if (!isValidPhone(formData.legal_rep1_phone)) errs['legal_rep1_phone'] = 'Numéro invalide';
      }
      if (formData.legal_rep2_email.trim() && !isValidEmail(formData.legal_rep2_email)) errs['legal_rep2_email'] = 'Adresse email invalide';
      if (formData.legal_rep2_phone.trim() && !isValidPhone(formData.legal_rep2_phone)) errs['legal_rep2_phone'] = 'Numéro invalide';
      if (formData.avs_number_ocr && !isCompleteAvs(formData.avs_number_ocr)) errs['avs_number_ocr'] = 'Numéro AVS incomplet (13 chiffres)';
    }
    if (step === 4) {
      if (formData.photo_consent === null) errs['photo_consent'] = 'Champ obligatoire';
      if (!formData.privacy_consent) errs['privacy_consent'] = 'Champ obligatoire';
    }
    return errs;
  };

  const currentErrors = attemptedSteps[currentStep] ? getStepErrors(currentStep) : {};
  const currentErrorCount = Object.keys(currentErrors).length;

  const scrollToFirstError = () => {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector('[data-field-error="true"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const isStepValid = useMemo(() => {
    if (currentStep === 1) {
      if (formData.has_played_before === null) return false;
      const lic = formData.previous_licence_number;
      if (lic && !/^\d{6,10}$/.test(lic)) return false;
      return true;
    }
    if (currentStep === 2) {
      if (formData.has_played_before === true) {
        return true;
      }
      if (!formData.document_type) return false;
      if (!formData.health_insurance) return false;
      if (formData.document_type === 'ci') {
        return !!formData.id_card_front && !!formData.id_card_back;
      }
      if (formData.document_type === 'permit') {
        return !!formData.permit_front && !!formData.permit_back;
      }
      if (formData.document_type === 'passport') {
        return !!formData.passport_page;
      }
      return false;
    }
    if (currentStep === 3) {
      if (!formData.first_name.trim() || !formData.last_name.trim()) return false;
      if (age === null || age < 4 || age > 99) return false;
      if (!formData.gender) return false;
      if (!formData.nationality.trim()) return false;
      if (!formData.address.trim()) return false;
      if (!/^\d{4,5}$/.test(formData.postal_code)) return false;
      if (!formData.city.trim()) return false;
      if (isAdult) {
        if (!formData.player_email.trim() || !isValidEmail(formData.player_email)) return false;
      }
      if (formData.player_email.trim() && !isValidEmail(formData.player_email)) return false;
      if (formData.player_phone.trim() && !isValidPhone(formData.player_phone)) return false;
      if (isMinor) {
        if (!formData.legal_rep1_firstname.trim()) return false;
        if (!formData.legal_rep1_lastname.trim()) return false;
        if (!formData.legal_rep1_email.trim() || !isValidEmail(formData.legal_rep1_email)) return false;
        if (!formData.legal_rep1_phone.trim() || !isValidPhone(formData.legal_rep1_phone)) return false;
      }
      if (formData.legal_rep2_email.trim() && !isValidEmail(formData.legal_rep2_email)) return false;
      if (formData.legal_rep2_phone.trim() && !isValidPhone(formData.legal_rep2_phone)) return false;
      if (formData.avs_number_ocr && !isCompleteAvs(formData.avs_number_ocr)) return false;
      return true;
    }
    if (currentStep === 4) {
      return formData.photo_consent !== null && formData.privacy_consent === true;
    }
    return true;
  }, [currentStep, formData, age, isAdult, isMinor]);

  const runOcrAndAdvance = async () => {
    if (!slug) {
      setCurrentStep(3);
      return;
    }
    const docType = formData.document_type;
    let frontPath: string | undefined;
    let backPath: string | undefined;
    if (docType === 'ci') {
      frontPath = formData.id_card_front?.path;
      backPath = formData.id_card_back?.path;
    } else if (docType === 'permit') {
      frontPath = formData.permit_front?.path;
      backPath = formData.permit_back?.path;
    } else if (docType === 'passport') {
      frontPath = formData.passport_page?.path;
      backPath = undefined;
    }
    const healthPath = formData.health_insurance?.path;
    if (!frontPath || !healthPath) {
      setCurrentStep(3);
      return;
    }
    setOcrInProgress(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-identity-card`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug,
          document_type: docType,
          id_card_front_path: frontPath,
          id_card_back_path: backPath || null,
          health_insurance_card_path: healthPath,
        }),
      });
      const json = await res.json().catch(() => ({} as { success?: boolean; extracted?: OcrExtracted; warnings?: string[] }));
      if (json?.success && json.extracted) {
        const ex = json.extracted as OcrExtracted;
        const hasAny =
          !!ex.first_name || !!ex.last_name || !!ex.birth_date || !!ex.gender ||
          !!ex.nationality || !!ex.place_of_origin ||
          !!ex.legal_rep1_firstname || !!ex.legal_rep1_lastname ||
          !!ex.legal_rep2_firstname || !!ex.legal_rep2_lastname ||
          !!ex.avs_number;
        if (hasAny) {
          setFormData((prev) => ({
            ...prev,
            first_name: ex.first_name || prev.first_name,
            last_name: ex.last_name || prev.last_name,
            birth_date: ex.birth_date || prev.birth_date,
            gender: ex.gender || prev.gender,
            nationality: ex.nationality || prev.nationality,
            place_of_origin: ex.place_of_origin || prev.place_of_origin,
            legal_rep1_firstname: ex.legal_rep1_firstname || prev.legal_rep1_firstname,
            legal_rep1_lastname: ex.legal_rep1_lastname || prev.legal_rep1_lastname,
            legal_rep2_firstname: ex.legal_rep2_firstname || prev.legal_rep2_firstname,
            legal_rep2_lastname: ex.legal_rep2_lastname || prev.legal_rep2_lastname,
            avs_number_ocr: ex.avs_number ? formatAvsInput(ex.avs_number) : prev.avs_number_ocr,
          }));
          setOcrPrefilled(true);
        }
        if (Array.isArray(json.warnings)) setOcrWarnings(json.warnings);
      }
    } catch (err) {
      console.error('OCR failed silently:', err);
    } finally {
      setOcrInProgress(false);
      setCurrentStep(3);
    }
  };

  const handleNext = () => {
    if (ocrInProgress) return;
    if (!isStepValid) {
      setAttemptedSteps((prev) => ({ ...prev, [currentStep]: true }));
      scrollToFirstError();
      return;
    }
    setAttemptedSteps((prev) => ({ ...prev, [currentStep]: false }));
    if (currentStep === 2) {
      if (formData.has_played_before === true) {
        setCurrentStep(3);
        return;
      }
      void runOcrAndAdvance();
      return;
    }
    if (currentStep < 4) setCurrentStep((s) => (s + 1) as StepKey);
  };

  const handlePrevious = () => {
    if (currentStep > 1) setCurrentStep((s) => (s - 1) as StepKey);
  };

  const handleSubmit = async () => {
    if (submitting || !club || !slug) return;
    if (!isStepValid) {
      setAttemptedSteps((prev) => ({ ...prev, [currentStep]: true }));
      scrollToFirstError();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      slug,
      honey_pot: honeyPot,
      form_data: {
        has_played_before: !!formData.has_played_before,
        asf_licence_number: formData.previous_licence_number.trim() || null,
        previous_club: formData.has_played_before ? (formData.previous_club.trim() || null) : null,
        first_name: formData.first_name,
        last_name: formData.last_name,
        birth_date: formData.birth_date,
        gender: formData.gender || null,
        nationality: formData.nationality || null,
        place_of_origin: formData.place_of_origin || null,
        address: formData.address || null,
        postal_code: formData.postal_code || null,
        city: formData.city || null,
        player_email: formData.player_email.trim().toLowerCase() || null,
        player_phone: formData.player_phone.trim() || null,
        legal_rep1_firstname: formData.legal_rep1_firstname || null,
        legal_rep1_lastname: formData.legal_rep1_lastname || null,
        legal_rep1_email: formData.legal_rep1_email.trim().toLowerCase() || null,
        legal_rep1_phone: formData.legal_rep1_phone.trim() || null,
        legal_rep2_firstname: formData.legal_rep2_firstname || null,
        legal_rep2_lastname: formData.legal_rep2_lastname || null,
        legal_rep2_email: formData.legal_rep2_email.trim().toLowerCase() || null,
        legal_rep2_phone: formData.legal_rep2_phone.trim() || null,
        photo_consent: !!formData.photo_consent,
        privacy_consent: !!formData.privacy_consent,
        document_type: formData.has_played_before ? null : (formData.document_type ?? null),
        id_card_front_path: formData.has_played_before ? null : (formData.document_type === 'ci' ? (formData.id_card_front?.path ?? null) : null),
        id_card_back_path: formData.has_played_before ? null : (formData.document_type === 'ci' ? (formData.id_card_back?.path ?? null) : null),
        permit_front_path: formData.has_played_before ? null : (formData.document_type === 'permit' ? (formData.permit_front?.path ?? null) : null),
        permit_back_path: formData.has_played_before ? null : (formData.document_type === 'permit' ? (formData.permit_back?.path ?? null) : null),
        passport_page_path: formData.has_played_before ? null : (formData.document_type === 'passport' ? (formData.passport_page?.path ?? null) : null),
        health_insurance_card_path: formData.has_played_before ? null : (formData.health_insurance?.path ?? null),
        passport_photo_path: formData.passport_photo?.path ?? null,
        avs_number_ocr: formData.avs_number_ocr ?? null,
      },
    };

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-inscription`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok || !result?.success) {
        setSubmitError(result?.error || 'Une erreur est survenue. Veuillez réessayer plus tard.');
        setSubmitting(false);
        return;
      }

      if (result.waitlisted) {
        setWaitlisted(true);
      }
      setSubmitted(true);
    } catch (err: any) {
      console.error('Submit error:', err);
      setSubmitError('Impossible de contacter le serveur. Vérifiez votre connexion.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={publicPageStyle}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '80px 20px' }}>
          <Loader2 className="animate-spin" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
          Chargement...
        </div>
      </div>
    );
  }

  if (notFound || !club) {
    return (
      <div style={publicPageStyle}>
        <div style={{ ...cardStyle, maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
          <div style={{ color: 'var(--danger)', marginBottom: 12 }}>
            <XIcon style={{ width: 40, height: 40, margin: '0 auto' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Lien invalide ou expiré
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
            Le lien d'inscription que vous avez utilisé n'est pas valide. Veuillez contacter le club pour obtenir un nouveau lien.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={publicPageStyle}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '80px 20px' }}>
          <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
            <div style={{
              width: 72, height: 72, margin: '0 auto 20px',
              borderRadius: '50%', background: 'var(--success-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle style={{ width: 44, height: 44, color: 'var(--success)' }} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              {waitlisted ? 'Demande enregistrée — liste d\'attente' : 'Demande envoyée avec succès !'}
            </h1>
            {waitlisted ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
                Votre demande a bien été enregistrée et placée en liste d'attente. Le club vous recontactera dès qu'une place se libère — vous n'avez rien d'autre à faire.
              </p>
            ) : (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, marginBottom: 12 }}>
                  Merci d'avoir soumis votre demande d'inscription au club <strong>{club.club_name}</strong> pour{' '}
                  <strong>{formData.first_name} {formData.last_name}</strong>.
                  Un membre du comité va l'examiner et vous contactera prochainement.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
                  Un email récapitulatif a été envoyé à l'adresse fournie.
                </p>
              </>
            )}
            <Button
              variant="primary"
              type="button"
              onClick={() => navigate('/')}
            >
              Fermer cette page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={publicPageStyle}>
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
            color: 'var(--text-inverse)',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            fontWeight: 500,
          }}
        >
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 20px 80px' }}>
        <header style={{ textAlign: 'center', marginBottom: 32 }}>
          {club.logo_url && (
            <img
              src={club.logo_url}
              alt={club.club_name}
              style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', marginBottom: 16 }}
            />
          )}
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
            {club.club_name}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Inscription au club
          </h1>
        </header>

        <Stepper currentStep={currentStep} />

        <div ref={formRef} style={{ ...cardStyle, marginTop: 24 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, fontStyle: 'italic' }}>* champs obligatoires</p>
          {currentStep === 1 && (
            <Step1
              clubName={club.club_name}
              clubEmail={club.club_email}
              value={formData.has_played_before}
              licence={formData.previous_licence_number}
              previousClub={formData.previous_club}
              onChange={(val) =>
                setFormData((prev) => ({
                  ...prev,
                  has_played_before: val,
                  previous_licence_number: val === false ? '' : prev.previous_licence_number,
                  previous_club: val === false ? '' : prev.previous_club,
                }))
              }
              onLicenceChange={(val) => {
                setLicenceTouched(false);
                setFormData((prev) => ({ ...prev, previous_licence_number: val }));
              }}
              onLicenceBlur={() => setLicenceTouched(true)}
              onPreviousClubChange={(val) => setFormData((prev) => ({ ...prev, previous_club: val }))}
              licenceError={
                licenceTouched &&
                !!formData.previous_licence_number &&
                !/^\d{6,10}$/.test(formData.previous_licence_number)
              }
            />
          )}

          {currentStep === 2 && (
            <Step2
              slug={slug!}
              sessionId={sessionIdRef.current}
              formData={formData}
              setFormData={setFormData}
              onError={(msg) => showToast(msg, 'error')}
            />
          )}

          {currentStep === 3 && (
            <>
              {ocrPrefilled && (
                <div style={{ marginBottom: 16 }}>
                  <Alert variant="info">
                    Les informations ci-dessous ont été pré-remplies à partir de vos documents. Veuillez vérifier et corriger si nécessaire.
                  </Alert>
                </div>
              )}
              <Step3 formData={formData} setFormData={setFormData} age={age} isMinor={isMinor} capacityInfo={capacityInfo} fieldErrors={currentErrors} />
            </>
          )}

          {currentStep === 4 && (
            <>
              {ocrWarnings.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <Alert variant="warning" title="Avertissements lors de la lecture automatique">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {ocrWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                    <div style={{ marginTop: 8 }}>
                      Vérifiez attentivement les informations avant de soumettre.
                    </div>
                  </Alert>
                </div>
              )}
              {capacityInfo && (
                <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                  <p style={{ color: 'var(--warning-text)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                    Les équipes de la catégorie <strong>{capacityInfo.category_name}</strong> sont actuellement complètes : votre demande sera placée en liste d'attente. Le club mettra tout en œuvre pour intégrer votre enfant dès qu'une place se libère et vous recontactera dès que possible.
                  </p>
                </div>
              )}
              <Step4
                formData={formData}
                setFormData={setFormData}
                club={club}
                isMinor={isMinor}
                honeyPot={honeyPot}
                setHoneyPot={setHoneyPot}
                submitError={submitError}
                fieldErrors={currentErrors}
              />
            </>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 32,
              paddingTop: 24,
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <Button
              variant="secondary"
              type="button"
              onClick={handlePrevious}
              disabled={currentStep === 1 || submitting}
            >
              Précédent
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={currentStep === 4 ? handleSubmit : handleNext}
              disabled={submitting || ocrInProgress}
              loading={submitting}
              style={{ minWidth: 160 }}
            >
              {currentStep === 4 ? (submitting ? 'Envoi en cours…' : 'Soumettre') : 'Suivant'}
            </Button>
          </div>
          {currentErrorCount > 0 && (
            <p style={{ textAlign: 'right', color: 'var(--danger)', fontSize: 13, fontWeight: 600, marginTop: 12 }}>
              {currentErrorCount} champ{currentErrorCount > 1 ? 's' : ''} obligatoire{currentErrorCount > 1 ? 's' : ''} à compléter
            </p>
          )}
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 24 }}>
          Vos données sont transmises de manière sécurisée au club.
        </p>
      </div>

      {ocrInProgress && <OcrOverlay />}
    </div>
  );
}

function OcrOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 22,
          padding: '28px 28px 24px',
          maxWidth: 440,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: 'var(--accent)' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Extraction des informations…
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
          Nous lisons votre pièce d'identité et votre carte d'assurance maladie pour pré-remplir le formulaire.
        </p>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: 'var(--border-color)',
            overflow: 'hidden',
            marginBottom: 18,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              height: '100%',
              width: '40%',
              background: 'var(--accent)',
              borderRadius: 999,
              animation: 'ocr-indet 1.3s ease-in-out infinite',
            }}
          />
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OcrStep label="Lecture de la carte d'identité – Recto…" />
          <OcrStep label="Lecture de la carte d'identité – Verso…" />
          <OcrStep label="Lecture de la carte d'assurance maladie…" />
        </ul>
      </div>
      <style>{`@keyframes ocr-indet { 0% { left: -40%; } 100% { left: 100%; } }`}</style>
    </div>
  );
}

function OcrStep({ label }: { label: string }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
      <Loader2 className="animate-spin" style={{ width: 14, height: 14, color: 'var(--accent)' }} />
      {label}
    </li>
  );
}

function Stepper({ currentStep }: { currentStep: StepKey }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 4,
        padding: '0 8px',
      }}
    >
      {STEPS.map((step, idx) => {
        const status: 'current' | 'completed' | 'future' =
          step.key < currentStep ? 'completed' : step.key === currentStep ? 'current' : 'future';
        const Icon = step.icon;

        const circleBg = status === 'future' ? 'var(--bg-card)' : 'var(--accent)';
        const circleBorder = status === 'future' ? '2px solid var(--border-color)' : '2px solid var(--accent)';
        const iconColor = status === 'future' ? 'var(--text-muted)' : 'var(--text-inverse)';
        const labelColor = status === 'current' ? 'var(--accent)' : status === 'completed' ? 'var(--text-secondary)' : 'var(--text-muted)';

        return (
          <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {idx < STEPS.length - 1 && (
              <div
                style={{
                  position: 'absolute', top: 18, left: '50%',
                  width: '100%', height: 2,
                  background: step.key < currentStep ? 'var(--accent)' : 'var(--border-color)',
                  zIndex: 0,
                }}
              />
            )}
            <div
              style={{
                width: 38, height: 38, borderRadius: '50%',
                background: circleBg, border: circleBorder,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', zIndex: 1, transition: 'all 0.2s',
              }}
            >
              {status === 'completed' ? (
                <Check style={{ width: 18, height: 18, color: iconColor }} strokeWidth={3} />
              ) : (
                <Icon style={{ width: 18, height: 18, color: iconColor }} />
              )}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: status === 'current' ? 600 : 500,
                color: labelColor,
                textAlign: 'center',
              }}
              className="stepper-label"
            >
              {step.label}
            </div>
          </div>
        );
      })}
      <style>{`
        @media (max-width: 520px) {
          .stepper-label { font-size: 11px; }
        }
      `}</style>
    </div>
  );
}

function PrivacyNotice({ clubName, clubEmail }: { clubName: string; clubEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const contact = clubEmail && clubEmail.trim() ? clubEmail.trim() : null;
  return (
    <div
      style={{
        marginBottom: 24,
        border: '1px solid var(--border-color)',
        borderRadius: 10,
        background: 'var(--bg-app)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '12px 16px', background: 'transparent',
          border: 'none', cursor: 'pointer', color: 'var(--text-primary)',
          fontSize: 14, fontWeight: 600, textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Shield style={{ width: 16, height: 16, color: 'var(--accent)' }} />
          Information sur la protection des données
        </span>
        {open
          ? <ChevronUp style={{ width: 18, height: 18, color: 'var(--text-muted)' }} />
          : <ChevronDown style={{ width: 18, height: 18, color: 'var(--text-muted)' }} />}
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.65 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 8px' }}>
            Protection de vos données personnelles
          </h3>
          <p style={{ margin: '0 0 10px' }}>
            En remplissant ce formulaire, vous nous transmettez des données personnelles soumises
            à la Loi fédérale suisse sur la protection des données (LPD) et au Règlement général
            sur la protection des données (RGPD).
          </p>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
            Les informations collectées servent exclusivement à :
          </p>
          <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
            <li>Inscrire le joueur au {clubName}</li>
            <li>Effectuer les démarches administratives auprès de l'ASF (Association Suisse de Football)</li>
            <li>Communiquer avec le joueur ou son représentant légal</li>
          </ul>
          <p style={{ margin: '0 0 10px' }}>
            Vos données sont stockées de manière sécurisée. Les images de pièces d'identité
            (carte d'identité, carte d'assurance maladie) sont automatiquement supprimées une
            fois l'inscription validée par l'administration du club.
          </p>
          <p style={{ margin: 0 }}>
            Vous disposez d'un droit d'accès, de rectification et de suppression de vos données.
            Pour toute demande, contactez {contact
              ? <a href={`mailto:${contact}`} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{contact}</a>
              : 'le club'}.
          </p>
        </div>
      )}
    </div>
  );
}

function Step1({
  value, licence, previousClub, onChange, onLicenceChange, onLicenceBlur, onPreviousClubChange, licenceError,
  clubName, clubEmail,
}: {
  value: boolean | null; licence: string; previousClub: string;
  onChange: (val: boolean) => void; onLicenceChange: (val: string) => void;
  onLicenceBlur?: () => void; onPreviousClubChange: (val: string) => void;
  licenceError?: boolean;
  clubName: string; clubEmail: string | null;
}) {
  return (
    <div>
      <PrivacyNotice clubName={clubName} clubEmail={clubEmail} />
      <h2 style={stepTitleStyle}>Antécédents sportifs</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        Pour préparer l'inscription, nous avons besoin de savoir si le joueur a déjà été licencié dans un club.
      </p>

      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          Le joueur a-t-il déjà joué dans un club de football ?
        </legend>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <RadioCard selected={value === true} onClick={() => onChange(true)} title="Oui, il/elle a déjà été licencié(e)" />
          <RadioCard selected={value === false} onClick={() => onChange(false)} title="Non, c'est sa première inscription" />
        </div>
      </fieldset>

      {value === true && (
        <>
          <div
            style={{
              marginTop: 24,
              padding: '14px 16px',
              background: 'var(--success-soft)',
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--success)',
              borderRadius: 10,
              color: 'var(--success-text)',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <strong>Bonne nouvelle !</strong> Comme le joueur est déjà licencié à l'ASF, l'inscription est simplifiée.
            Vous n'aurez pas besoin d'uploader la carte d'identité ni la carte d'assurance maladie.
            Une photo récente pourra être ajoutée (optionnel).
          </div>

          <div style={{ marginTop: 20 }}>
            <label style={labelStyle} htmlFor="licence">Numéro de licence ASF (facultatif)</label>
            <input
              id="licence" type="text" value={licence}
              inputMode="numeric" maxLength={10}
              onChange={(e) => onLicenceChange(e.target.value.replace(/\D/g, ''))}
              onBlur={() => onLicenceBlur?.()}
              style={{
                ...inputStyle,
                borderColor: licenceError ? 'var(--danger)' : 'var(--border-color)',
              }}
              placeholder="Ex : 123456789"
              aria-invalid={licenceError ? true : undefined}
            />
            <p style={helperStyle}>6 à 10 chiffres (visible dans Clubcorner). Si vous ne l'avez pas, laissez vide.</p>
            {licenceError && (
              <p style={{ ...helperStyle, color: 'var(--danger)', marginTop: 4 }}>
                Le numéro de licence doit contenir 6 à 10 chiffres.
              </p>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle} htmlFor="previous_club">Club précédent</label>
            <input
              id="previous_club" type="text" value={previousClub}
              onChange={(e) => onPreviousClubChange(e.target.value)}
              style={inputStyle}
              placeholder="Ex : FC Lausanne-Sport"
            />
            <p style={helperStyle}>Facultatif. Cela nous aide à retrouver votre dossier plus rapidement.</p>
          </div>
        </>
      )}
    </div>
  );
}

function RadioCard({
  selected, onClick, title,
}: { selected: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 18px', borderRadius: 10,
        border: selected ? '2px solid var(--accent)' : '2px solid var(--border-color)',
        background: selected ? 'var(--bg-hover)' : 'var(--bg-card)',
        cursor: 'pointer', textAlign: 'left',
        fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, transition: 'all 0.15s',
      }}
    >
      <span
        style={{
          width: 20, height: 20, borderRadius: '50%',
          border: selected ? '6px solid var(--accent)' : '2px solid var(--border-color)',
          background: 'var(--bg-card)', flexShrink: 0, transition: 'all 0.15s',
        }}
      />
      {title}
    </button>
  );
}

function Step2({
  slug, sessionId, formData, setFormData, onError,
}: {
  slug: string; sessionId: string;
  formData: FormData; setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  onError: (msg: string) => void;
}) {
  const isTransfer = formData.has_played_before === true;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ ...stepTitleStyle, marginBottom: 0 }}>{isTransfer ? 'Photo du joueur' : 'Documents d\'identité'}</h2>
        {!isTransfer && (
          <HelpButton
            title="Comment prendre les photos ?"
            content={
              <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                <p style={{ marginBottom: 12 }}>Pour que vos documents soient lisibles et acceptés rapidement, suivez ces conseils :</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <li>&#128247; Document a plat sur une surface unie (table, sol)</li>
                  <li>&#9728;&#65039; Bonne luminosite, pas de reflets ni d'ombre</li>
                  <li>&#128208; Cadre bien centre, toutes les informations visibles (pas de coupe sur les bords)</li>
                  <li>&#128269; Image nette, pas floue</li>
                  <li>&#128241; Utilisez votre smartphone, c'est plus facile qu'un scanner</li>
                </ul>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 14 }}>
                  Astuce : ouvrez l'application photo, cadrez correctement, puis prenez la photo. Evitez les photos prises depuis un ecran.
                </p>
              </div>
            }
          />
        )}
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16, marginTop: 8, lineHeight: 1.6 }}>
        {isTransfer
          ? 'Veuillez uploader une photo récente du joueur (visage clairement visible, fond neutre si possible).'
          : 'Pour valider l\'inscription, le club a besoin de copies des documents d\'identité du joueur.'}
      </p>
      <div style={{ marginBottom: 20 }}>
        <Alert variant="info" icon={<Shield style={{ width: 16, height: 16 }} />}>
          Les images uploadées sont sécurisées et automatiquement supprimées après validation de votre inscription.
        </Alert>
      </div>

      {!isTransfer && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ ...labelStyle, marginBottom: 10 }}>Type de document d'identité <span style={{ color: 'var(--accent)' }}>*</span></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {([
              { value: 'ci' as DocumentType, label: 'Carte d\'identité', desc: 'Suisse' },
              { value: 'permit' as DocumentType, label: 'Permis B/C', desc: 'Séjour' },
              { value: 'passport' as DocumentType, label: 'Passeport', desc: 'International' },
            ]).map((opt) => {
              const sel = formData.document_type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, document_type: opt.value }))}
                  style={{
                    padding: '14px 12px',
                    borderRadius: 10,
                    border: sel ? '2px solid var(--accent)' : '2px solid var(--border-color)',
                    background: sel ? 'var(--bg-hover)' : 'var(--bg-card)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!isTransfer && formData.document_type === 'ci' && (
          <>
            <UploadZone slot="id_card_front" label="Carte d'identité — Recto" required slug={slug} sessionId={sessionId}
              current={formData.id_card_front}
              onChange={(doc) => setFormData((prev) => ({ ...prev, id_card_front: doc }))} onError={onError}
              helpButton={<HelpButton title="Photo recto de la carte d'identité" content={<p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>Le côté avec la photo, le nom, le prénom et la date de naissance. Assurez-vous que la photo est nette et que le MRZ (lignes de chiffres en bas) est lisible.</p>} />} />
            <UploadZone slot="id_card_back" label="Carte d'identité — Verso" required slug={slug} sessionId={sessionId}
              current={formData.id_card_back}
              onChange={(doc) => setFormData((prev) => ({ ...prev, id_card_back: doc }))} onError={onError}
              helpButton={<HelpButton title="Photo verso de la carte d'identité" content={<p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>Le côté avec la signature, le lieu d'origine et la date de validité.</p>} />} />
          </>
        )}
        {!isTransfer && formData.document_type === 'permit' && (
          <>
            <UploadZone slot="permit_front" label="Permis B/C — Recto" required slug={slug} sessionId={sessionId}
              current={formData.permit_front}
              onChange={(doc) => setFormData((prev) => ({ ...prev, permit_front: doc }))} onError={onError}
              helpButton={<HelpButton title="Photo recto du permis de séjour" content={<p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>Le côté avec votre photo et vos informations personnelles.</p>} />} />
            <UploadZone slot="permit_back" label="Permis B/C — Verso" required slug={slug} sessionId={sessionId}
              current={formData.permit_back}
              onChange={(doc) => setFormData((prev) => ({ ...prev, permit_back: doc }))} onError={onError}
              helpButton={<HelpButton title="Photo verso du permis de séjour" content={<p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>Le côté avec les détails du permis (type de permis, date de validité, autorité).</p>} />} />
          </>
        )}
        {!isTransfer && formData.document_type === 'passport' && (
          <UploadZone slot="passport_page" label="Passeport — Page d'identité" required slug={slug} sessionId={sessionId}
            current={formData.passport_page}
            onChange={(doc) => setFormData((prev) => ({ ...prev, passport_page: doc }))} onError={onError}
            helpButton={<HelpButton title="Photo du passeport" content={<p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>La page d'identité biométrique : celle avec votre photo, vos informations personnelles et le MRZ (lignes de chiffres en bas). Une seule photo suffit pour un passeport.</p>} />} />
        )}
        {!isTransfer && formData.document_type && (
          <UploadZone slot="health_insurance" label="Carte d'assurance maladie"
            helper="Une photo de la carte d'assurance maladie du joueur (recto suffit). Elle sera utilisée pour valider le numéro AVS."
            required slug={slug} sessionId={sessionId}
            current={formData.health_insurance}
            onChange={(doc) => setFormData((prev) => ({ ...prev, health_insurance: doc }))} onError={onError}
            helpButton={<HelpButton title="Photo de la carte d'assurance maladie" content={<p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>Le recto de votre carte d'assurance, avec votre nom, votre numéro AVS et le nom de la caisse maladie. La date d'expiration doit être visible.</p>} />} />
        )}
        <UploadZone slot="passport_photo" label="Photo type passeport du joueur"
          helper="Optionnel — pourra être ajoutée plus tard. Photo récente, visage de face, fond uni."
          slug={slug} sessionId={sessionId}
          current={formData.passport_photo}
          onChange={(doc) => setFormData((prev) => ({ ...prev, passport_photo: doc }))} onError={onError}
          helpButton={<HelpButton title="Photo style passeport" content={<p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>Une photo récente de face, fond uni clair (mur blanc, beige, gris clair), bonne luminosité. Visage centré, regard vers l'objectif, pas de lunettes de soleil ni de casquette.</p>} />} />
      </div>
    </div>
  );
}

function UploadZone({
  slot, label, helper, required, slug, sessionId, current, onChange, onError, helpButton,
}: {
  slot: DocumentSlot; label: string; helper?: string; required?: boolean;
  slug: string; sessionId: string;
  current: UploadedDoc | null;
  onChange: (doc: UploadedDoc | null) => void; onError: (msg: string) => void;
  helpButton?: React.ReactNode;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  const handleFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      onError('Format accepté : JPG, PNG ou WEBP');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      onError('Le fichier ne doit pas dépasser 5 MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${slug}/${sessionId}/${slot}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const blobUrl = URL.createObjectURL(file);
      blobUrlRef.current = blobUrl;

      onChange({ path, url: blobUrl, fileName: file.name });
    } catch (err: any) {
      console.error('Upload error:', err);
      onError('Erreur lors de l\'upload : ' + (err?.message || 'inconnue'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!current) return;
    try { await supabase.storage.from(BUCKET).remove([current.path]); } catch { /* ignore */ }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    onChange(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0]; if (file) handleFile(file);
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = '';
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>
          {label}{required && <span style={{ color: 'var(--accent)' }}>*</span>}
        </label>
        {helpButton}
      </div>

      {current ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-app)' }}>
          <img src={current.url} alt={label} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, background: 'var(--bg-card)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {current.fileName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check style={{ width: 14, height: 14 }} /> Téléversé
            </div>
          </div>
          <button type="button" onClick={handleDelete}
            style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, color: 'var(--danger)', background: 'var(--bg-card)', border: '1px solid var(--danger-soft)', borderRadius: 6, cursor: 'pointer' }}>
            Supprimer
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-color)'}`,
            background: dragOver ? 'var(--bg-hover)' : 'var(--bg-input)',
            borderRadius: 10, padding: '24px 16px', textAlign: 'center',
            cursor: uploading ? 'wait' : 'pointer', transition: 'all 0.15s',
          }}
        >
          {uploading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} />
              Upload en cours...
            </div>
          ) : (
            <>
              <Upload style={{ width: 24, height: 24, color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                Glisser-déposer ou cliquer pour choisir
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>JPG, PNG ou WEBP — max 5 MB</div>
            </>
          )}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }} onChange={handleInputChange} />
        </div>
      )}

      {helper && <p style={helperStyle}>{helper}</p>}
    </div>
  );
}

function Step3({
  formData, setFormData, age, isMinor, capacityInfo, fieldErrors,
}: {
  formData: FormData; setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  age: number | null; isMinor: boolean;
  capacityInfo: { category_name: string } | null;
  fieldErrors: Record<string, string>;
}) {
  const update = (patch: Partial<FormData>) => setFormData((prev) => ({ ...prev, ...patch }));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const fe = (key: string) => fieldErrors[key] || null;

  const emailError = (key: 'player_email' | 'legal_rep1_email' | 'legal_rep2_email', required: boolean) => {
    if (fe(key)) return fe(key);
    const v = (formData[key] || '').trim();
    if (!touched[key]) return null;
    if (!v) return required ? 'Email requis' : null;
    if (!isValidEmail(v)) return 'Adresse email invalide';
    return null;
  };

  const phoneError = (key: 'player_phone' | 'legal_rep1_phone' | 'legal_rep2_phone', required: boolean) => {
    if (fe(key)) return fe(key);
    const v = (formData[key] || '').trim();
    if (!touched[key]) return null;
    if (!v) return required ? 'Téléphone requis' : null;
    if (!isValidPhone(v)) return 'Numéro invalide pour le pays sélectionné.';
    return null;
  };

  return (
    <div>
      <h2 style={stepTitleStyle}>Informations du joueur</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        Merci de renseigner les informations concernant le joueur.
      </p>

      <SubSection title="Identité">
        <Row>
          <Field label="Prénom" required error={fe('first_name')}>
            <input type="text" style={inputStyle} value={formData.first_name}
              onChange={(e) => update({ first_name: e.target.value })}
              onBlur={() => update({ first_name: toTitleCase(formData.first_name) })}
            />
          </Field>
          <Field label="Nom" required error={fe('last_name')}>
            <input type="text" style={inputStyle} value={formData.last_name}
              onChange={(e) => update({ last_name: e.target.value })}
              onBlur={() => update({ last_name: toTitleCase(formData.last_name) })}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Date de naissance" required error={fe('birth_date')} helper={!fe('birth_date') && age !== null ? `Âge : ${age} ans` : undefined}>
            <input type="date" style={inputStyle} value={formData.birth_date}
              onChange={(e) => update({ birth_date: e.target.value })} />
          </Field>
          <Field label="Sexe" required error={fe('gender')}>
            <select style={inputStyle} value={formData.gender}
              onChange={(e) => update({ gender: e.target.value })}>
              <option value="">Sélectionner…</option>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
              <option value="O">Autre</option>
            </select>
          </Field>
        </Row>
        {capacityInfo && (
          <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, marginTop: 4 }}>
            <p style={{ color: 'var(--warning-text)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              Les équipes de la catégorie <strong>{capacityInfo.category_name}</strong> sont actuellement complètes : votre demande sera placée en liste d'attente. Le club mettra tout en œuvre pour intégrer votre enfant dès qu'une place se libère et vous recontactera dès que possible.
            </p>
          </div>
        )}
        <Row>
          <Field label="Nationalité" required error={fe('nationality')}>
            <CountrySelect
              value={formData.nationality}
              onChange={(v) => update({ nationality: v })}
              placeholder="Ex : Suisse"
              required
            />
          </Field>
          <Field label="Lieu d'origine" helper="Uniquement pour les citoyens suisses">
            <input type="text" style={inputStyle} value={formData.place_of_origin}
              onChange={(e) => update({ place_of_origin: e.target.value })} />
          </Field>
        </Row>
        <Row>
          <Field label="N° AVS" error={fe('avs_number_ocr') || (touched['avs_number_ocr'] && formData.avs_number_ocr && !isCompleteAvs(formData.avs_number_ocr) ? 'Numéro AVS incomplet (13 chiffres attendus)' : null)}>
            <input type="text" inputMode="numeric" maxLength={16} style={inputStyle}
              value={formData.avs_number_ocr || ''}
              onChange={(e) => update({ avs_number_ocr: formatAvsInput(e.target.value) || null })}
              onBlur={() => markTouched('avs_number_ocr')}
              placeholder="756.1234.5678.97" />
          </Field>
          <Alert variant="info" className="mt-2">Le numéro AVS est utilisé uniquement pour l'annonce J+S (base de données nationale du sport) et la vérification du dossier de membre. Il n'est jamais utilisé à d'autres fins ni transmis à des tiers.</Alert>
          <div />
        </Row>
      </SubSection>

      <SubSection title="Adresse">
        <Field label="Adresse (rue et numéro)" required error={fe('address')}>
          <input type="text" style={inputStyle} value={formData.address}
            onChange={(e) => update({ address: e.target.value })} placeholder="Route du Village 12" />
        </Field>
        <Row>
          <Field label="Code postal" required error={fe('postal_code')}>
            <input type="text" inputMode="numeric" style={inputStyle} value={formData.postal_code}
              onChange={(e) => update({ postal_code: e.target.value.replace(/\D/g, '').slice(0, 5) })}
              placeholder="1032" />
          </Field>
          <Field label="Localité" required error={fe('city')}>
            <input type="text" style={inputStyle} value={formData.city}
              onChange={(e) => update({ city: e.target.value })}
              onBlur={() => update({ city: toTitleCase(formData.city) })} />
          </Field>
        </Row>
      </SubSection>

      <SubSection title="Contact joueur">
        <Row>
          <Field label="Email du joueur" required={!isMinor} error={emailError('player_email', !isMinor)}
            helper={isMinor ? 'Facultatif pour un joueur mineur' : undefined}>
            <input type="email" style={inputStyle} value={formData.player_email}
              onChange={(e) => update({ player_email: e.target.value })}
              onBlur={() => markTouched('player_email')} />
          </Field>
          <Field label="Téléphone du joueur" error={phoneError('player_phone', false)}>
            <PhoneInput
              value={formData.player_phone}
              onChange={(v) => {
                update({ player_phone: v });
                markTouched('player_phone');
              }}
            />
          </Field>
        </Row>
      </SubSection>

      {isMinor && (
        <>
          <div style={{
            background: 'var(--warning-soft)', border: '1px solid var(--warning)',
            color: 'var(--warning-text)', padding: '10px 14px', borderRadius: 8,
            fontSize: 13, marginBottom: 16,
          }}>
            Le joueur étant mineur, au moins un représentant légal doit être indiqué.
          </div>

          <SubSection title="Représentant légal 1">
            <Row>
              <Field label="Prénom" required error={fe('legal_rep1_firstname')}>
                <input type="text" style={inputStyle} value={formData.legal_rep1_firstname}
                  onChange={(e) => update({ legal_rep1_firstname: e.target.value })}
                  onBlur={() => update({ legal_rep1_firstname: toTitleCase(formData.legal_rep1_firstname) })} />
              </Field>
              <Field label="Nom" required error={fe('legal_rep1_lastname')}>
                <input type="text" style={inputStyle} value={formData.legal_rep1_lastname}
                  onChange={(e) => update({ legal_rep1_lastname: e.target.value })}
                  onBlur={() => update({ legal_rep1_lastname: toTitleCase(formData.legal_rep1_lastname) })} />
              </Field>
            </Row>
            <Row>
              <Field label="Email" required error={emailError('legal_rep1_email', true)}>
                <input type="email" style={inputStyle} value={formData.legal_rep1_email}
                  onChange={(e) => update({ legal_rep1_email: e.target.value })}
                  onBlur={() => markTouched('legal_rep1_email')} />
              </Field>
              <Field label="Téléphone" required error={phoneError('legal_rep1_phone', true)}>
                <PhoneInput
                  value={formData.legal_rep1_phone}
                  onChange={(v) => {
                    update({ legal_rep1_phone: v });
                    markTouched('legal_rep1_phone');
                  }}
                />
              </Field>
            </Row>
          </SubSection>

          <SubSection title="Représentant légal 2 (facultatif)">
            <Row>
              <Field label="Prénom">
                <input type="text" style={inputStyle} value={formData.legal_rep2_firstname}
                  onChange={(e) => update({ legal_rep2_firstname: e.target.value })}
                  onBlur={() => update({ legal_rep2_firstname: toTitleCase(formData.legal_rep2_firstname) })} />
              </Field>
              <Field label="Nom">
                <input type="text" style={inputStyle} value={formData.legal_rep2_lastname}
                  onChange={(e) => update({ legal_rep2_lastname: e.target.value })}
                  onBlur={() => update({ legal_rep2_lastname: toTitleCase(formData.legal_rep2_lastname) })} />
              </Field>
            </Row>
            <Row>
              <Field label="Email" error={emailError('legal_rep2_email', false)}>
                <input type="email" style={inputStyle} value={formData.legal_rep2_email}
                  onChange={(e) => update({ legal_rep2_email: e.target.value })}
                  onBlur={() => markTouched('legal_rep2_email')} />
              </Field>
              <Field label="Téléphone" error={phoneError('legal_rep2_phone', false)}>
                <PhoneInput
                  value={formData.legal_rep2_phone}
                  onChange={(v) => {
                    update({ legal_rep2_phone: v });
                    markTouched('legal_rep2_phone');
                  }}
                />
              </Field>
            </Row>
          </SubSection>
        </>
      )}
    </div>
  );
}

function Step4({
  formData, setFormData, club, isMinor, honeyPot, setHoneyPot, submitError, fieldErrors,
}: {
  formData: FormData; setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  club: ClubData; isMinor: boolean;
  honeyPot: string; setHoneyPot: (v: string) => void;
  submitError: string | null;
  fieldErrors: Record<string, string>;
}) {
  return (
    <div>
      <h2 style={stepTitleStyle}>Vérification et soumission</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        Vérifiez les informations avant d'envoyer votre demande. Vous pouvez revenir en arrière pour corriger.
      </p>

      <Recap formData={formData} isMinor={isMinor} />

      <div style={{ marginTop: 28 }}>
        <h3 style={subSectionTitleStyle}>Autorisation d'utilisation de l'image</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          J'autorise <strong>{club.club_name}</strong> à diffuser des photos ou vidéos du joueur dans le cadre
          des activités du club (site web, réseaux sociaux, publications). Cette autorisation peut être révoquée
          à tout moment en contactant le club.
        </p>
        <div data-field-error={fieldErrors['photo_consent'] ? 'true' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <RadioCard
            selected={formData.photo_consent === true}
            onClick={() => setFormData((p) => ({ ...p, photo_consent: true }))}
            title="Oui, j'autorise"
          />
          <RadioCard
            selected={formData.photo_consent === false}
            onClick={() => setFormData((p) => ({ ...p, photo_consent: false }))}
            title="Non, je n'autorise pas"
          />
          {fieldErrors['photo_consent'] && (
            <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{fieldErrors['photo_consent']}</p>
          )}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <label
          htmlFor="privacy_consent"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '14px 16px', borderRadius: 10,
            border: formData.privacy_consent ? '2px solid var(--accent)' : '2px solid var(--border-color)',
            background: formData.privacy_consent ? 'var(--bg-hover)' : 'var(--bg-card)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <input
            id="privacy_consent"
            type="checkbox"
            checked={formData.privacy_consent}
            onChange={(e) => setFormData((p) => ({ ...p, privacy_consent: e.target.checked }))}
            style={{ marginTop: 3, width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.55 }}>
            J'ai pris connaissance de l'information sur la protection des données et j'accepte le
            traitement de mes données personnelles dans le cadre de cette inscription.
            <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>
          </span>
        </label>
        {!formData.privacy_consent && (
          <p style={{ margin: '8px 4px 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Vous devez accepter l'information sur la protection des données pour soumettre votre inscription.
          </p>
        )}
      </div>

      <div aria-hidden="true" style={{ position: 'absolute', left: -9999, top: -9999, opacity: 0, pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
        <label aria-hidden="true" htmlFor="honey_pot">Ne pas remplir</label>
        <input
          id="honey_pot" name="honey_pot" type="text" tabIndex={-1} autoComplete="off"
          value={honeyPot} onChange={(e) => setHoneyPot(e.target.value)}
        />
      </div>

      {submitError && (
        <div style={{
          marginTop: 20, background: 'var(--danger-soft)',
          border: '1px solid var(--danger)', color: 'var(--danger-text)',
          padding: '10px 14px', borderRadius: 8, fontSize: 14,
        }}>
          {submitError}
        </div>
      )}
    </div>
  );
}

function Recap({ formData, isMinor }: { formData: FormData; isMinor: boolean }) {
  const recapRow = (label: string, value: string) => (
    value ? (
      <div style={{ display: 'flex', gap: 12, padding: '6px 0', fontSize: 14 }}>
        <div style={{ color: 'var(--text-muted)', minWidth: 160 }}>{label}</div>
        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</div>
      </div>
    ) : null
  );

  return (
    <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: 10, padding: 20 }}>
      <h3 style={{ ...subSectionTitleStyle, marginBottom: 12 }}>Récapitulatif</h3>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
          Antécédents
        </div>
        {recapRow('Déjà licencié', formData.has_played_before ? 'Oui' : 'Non')}
        {recapRow('Licence ASF', formData.previous_licence_number)}
        {formData.has_played_before && recapRow('Club précédent', formData.previous_club)}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
          Identité
        </div>
        {recapRow('Nom complet', `${formData.first_name} ${formData.last_name}`)}
        {recapRow('Date de naissance', formData.birth_date)}
        {recapRow('Sexe', formData.gender === 'M' ? 'Masculin' : formData.gender === 'F' ? 'Féminin' : formData.gender === 'O' ? 'Autre' : formData.gender)}
        {recapRow('Nationalité', formData.nationality)}
        {recapRow('Lieu d\'origine', formData.place_of_origin)}
        {recapRow('Adresse', [formData.address, `${formData.postal_code} ${formData.city}`].filter(Boolean).join(', '))}
        {recapRow('Email joueur', formData.player_email)}
        {recapRow('Téléphone joueur', formatPhone(formData.player_phone))}
      </div>

      {isMinor && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Représentant légal 1
          </div>
          {recapRow('Nom complet', `${formData.legal_rep1_firstname} ${formData.legal_rep1_lastname}`)}
          {recapRow('Email', formData.legal_rep1_email)}
          {recapRow('Téléphone', formatPhone(formData.legal_rep1_phone))}
          {formData.legal_rep2_firstname && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '10px 0 4px' }}>
                Représentant légal 2
              </div>
              {recapRow('Nom complet', `${formData.legal_rep2_firstname} ${formData.legal_rep2_lastname}`)}
              {recapRow('Email', formData.legal_rep2_email)}
              {recapRow('Téléphone', formatPhone(formData.legal_rep2_phone))}
            </>
          )}
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Documents
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[formData.id_card_front, formData.id_card_back, formData.health_insurance, formData.passport_photo]
            .filter(Boolean)
            .map((doc, i) => (
              <img
                key={i}
                src={(doc as UploadedDoc).url}
                alt=""
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={subSectionTitleStyle}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
      {children}
    </div>
  );
}

function Field({
  label, required, helper, error, children,
}: {
  label: string; required?: boolean; helper?: string; error?: string | null; children: React.ReactNode;
}) {
  const hasError = !!error;
  return (
    <div data-field-error={hasError || undefined}>
      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}{required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      <div style={hasError ? { '--field-border': 'var(--danger)' } as React.CSSProperties : undefined} className={hasError ? 'pi-field-error' : undefined}>
        {children}
      </div>
      {error ? <p style={{ ...helperStyle, color: 'var(--danger)' }}>{error}</p> : helper ? <p style={helperStyle}>{helper}</p> : null}
    </div>
  );
}

const publicPageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg-app)',
  color: 'var(--text-primary)',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: 22,
  padding: 28,
  border: '1px solid var(--border-color)',
  boxShadow: 'var(--shadow-lg)',
};

const stepTitleStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8,
};

const subSectionTitleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, letterSpacing: '-0.01em',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 15,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border-color)', borderRadius: 10,
  background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
};

const helperStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5,
};