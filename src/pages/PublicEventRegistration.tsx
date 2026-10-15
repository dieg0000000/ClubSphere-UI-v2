import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { invokeFunction } from '../lib/invokeFunction';
import { MapPin, Calendar, Minus, Plus, Loader as Loader2, Info, Link2, Clock } from 'lucide-react';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import PhoneInput from '../components/PhoneInput';
import { isValidPhone } from '../utils/phoneHelpers';
import { findBestPriceOption } from '../utils/bestPriceOption';

interface PriceOption {
  id: string;
  label: string;
  seats: number;
  price: number;
}

interface EventData {
  event_id: string;
  title: string;
  description: string;
  event_date: string;
  location: string | null;
  registration_deadline: string | null;
  cancellation_deadline_days: number | null;
  late_cancellation_fee: number | null;
  payment_modes: string[];
  club_name: string;
  logo_url: string | null;
  primary_color: string | null;
  primary_dark: string | null;
  accent_color: string | null;
  price_options: PriceOption[];
}

interface ParticipantRow {
  first_name: string;
  last_name: string;
  email: string;
}

type Step = 1 | 2 | 3 | 'confirm';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAYMENT_MODE_LABELS: Record<string, string> = {
  invoice: 'Facture',
  cash_card: 'Cash / Carte sur place',
};

function applyTheme(ev: EventData) {
  const root = document.documentElement;
  if (ev.primary_color) root.style.setProperty('--primary', ev.primary_color);
  if (ev.primary_dark) root.style.setProperty('--primary-dark', ev.primary_dark);
  if (ev.accent_color) root.style.setProperty('--accent', ev.accent_color);
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PublicEventRegistration() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>(1);

  // Step 1 fields
  const [company, setCompany] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [step1Touched, setStep1Touched] = useState(false);

  // Step 2 fields
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [bestPriceNotice, setBestPriceNotice] = useState<string | null>(null);
  const suppressBestPriceRef = useRef(false);
  const [paymentMode, setPaymentMode] = useState('');
  const [step2Touched, setStep2Touched] = useState(false);

  // Step 3 (participants)
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Inscription événement';
    loadEvent();
  }, [slug]);

  const loadEvent = async () => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .rpc('get_event_by_public_slug', { p_slug: slug })
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        const ev = data as EventData;
        setEvent(ev);
        applyTheme(ev);
        if (ev.price_options?.length > 0) {
          setSelectedOptionId(ev.price_options[0].id);
        }
        if (ev.payment_modes?.length === 1) {
          setPaymentMode(ev.payment_modes[0]);
        }
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const selectedOption = useMemo(
    () => event?.price_options?.find(o => o.id === selectedOptionId) ?? null,
    [event, selectedOptionId]
  );

  const totalSeats = useMemo(() => {
    if (!selectedOption) return 0;
    return selectedOption.seats * quantity;
  }, [selectedOption, quantity]);

  const total = useMemo(() => {
    if (!selectedOption) return 0;
    return selectedOption.price * quantity;
  }, [selectedOption, quantity]);

  useEffect(() => {
    if (suppressBestPriceRef.current) {
      suppressBestPriceRef.current = false;
      return;
    }
    if (!event?.price_options?.length || !selectedOptionId || quantity <= 0) {
      setBestPriceNotice(null);
      return;
    }
    const result = findBestPriceOption(event.price_options, selectedOptionId, quantity);
    if (result && result.switched) {
      suppressBestPriceRef.current = true;
      setSelectedOptionId(result.optionId);
      setQuantity(result.quantity);
      setBestPriceNotice(
        `Tarif le plus avantageux appliqué automatiquement : ${result.label} × ${result.quantity} — ${result.total.toFixed(2)} CHF au lieu de ${result.originalTotal.toFixed(2)} CHF.`
      );
    } else {
      setBestPriceNotice(null);
    }
  }, [selectedOptionId, quantity, event?.price_options]);

  const phoneValid = useMemo(() => isValidPhone(phone), [phone]);

  const isStep1Valid = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      address.trim().length > 0 &&
      /^\d{4,5}$/.test(postalCode) &&
      city.trim().length > 0 &&
      phoneValid &&
      EMAIL_RE.test(email.trim())
    );
  }, [firstName, lastName, address, postalCode, city, phoneValid, email]);

  const isStep2Valid = useMemo(() => {
    if (!selectedOptionId) return false;
    if (event?.payment_modes && event.payment_modes.length > 0 && !paymentMode) return false;
    return true;
  }, [selectedOptionId, paymentMode, event]);

  const handleStep1Continue = () => {
    setStep1Touched(true);
    if (isStep1Valid) setStep(2);
  };

  const handleStep2Continue = () => {
    setStep2Touched(true);
    if (!isStep2Valid) return;
    // Initialize participants array
    const count = totalSeats;
    const rows: ParticipantRow[] = Array.from({ length: count }, (_, i) => {
      if (i === 0) return { first_name: firstName, last_name: lastName, email };
      return { first_name: '', last_name: '', email: '' };
    });
    setParticipants(rows);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!event) return;

    setSubmitting(true);
    setSubmitError(null);

    const filledParticipants = participants
      .filter(p => p.first_name.trim() || p.last_name.trim() || p.email.trim())
      .map(p => ({
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        email: p.email.trim().toLowerCase(),
      }));

    try {
      const { error } = await invokeFunction('submit-event-registration', {
        body: {
          slug,
          company: company.trim() || null,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          address: address.trim(),
          postal_code: postalCode.trim(),
          city: city.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          price_option_id: selectedOptionId,
          quantity,
          payment_mode: paymentMode || null,
          website: honeypot,
          participants: filledParticipants,
        },
      });

      if (error) throw new Error(error);
      setStep('confirm');
    } catch (err: any) {
      const msg = err?.context?.json?.error || err?.message || "Une erreur est survenue lors de l'envoi.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // When user manually changes option to multi-seat, reset quantity (skip when auto-switched)
  useEffect(() => {
    if (suppressBestPriceRef.current) return;
    if (selectedOption && selectedOption.seats > 1) {
      setQuantity(1);
    }
  }, [selectedOptionId]);

  const updateParticipant = (idx: number, field: keyof ParticipantRow, value: string) => {
    setParticipants(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const filledParticipantCount = useMemo(
    () => participants.filter(p => p.first_name.trim() || p.last_name.trim()).length,
    [participants]
  );

  const inputStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    borderRadius: 10,
  };

  const errorBorder = { borderColor: 'var(--danger)' };

  const fieldMissing = (val: string, touched: boolean) =>
    touched && val.trim().length === 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-app)' }}>
        <div className="max-w-md w-full text-center p-8" style={{ background: 'var(--bg-card)', borderRadius: 22, boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-color)' }}>
          <Link2 className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Lien invalide ou expire</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Ce lien d'inscription n'existe pas ou n'est plus actif.
          </p>
        </div>
      </div>
    );
  }

  const deadlinePassed = event.registration_deadline && new Date(event.registration_deadline) < new Date();

  if (deadlinePassed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-app)' }}>
        <div className="max-w-md w-full text-center p-8" style={{ background: 'var(--bg-card)', borderRadius: 22, boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-color)' }}>
          <Clock className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Inscriptions closes</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            La date limite d'inscription pour cet evenement est depassee.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: 'var(--bg-app)' }}>
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          {event.logo_url && (
            <img
              src={event.logo_url}
              alt={event.club_name}
              className="w-16 h-16 mx-auto object-contain rounded-lg"
            />
          )}
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {event.club_name}
          </p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {event.title}
          </h1>
          <div className="flex flex-col items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDateLong(event.event_date)}
            </span>
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {event.location}
              </span>
            )}
          </div>
        </div>

        {/* Card */}
        <div className="overflow-hidden" style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-color)', borderRadius: 22 }}>

          {step === 'confirm' && (
            <div className="p-6 space-y-4">
              <Alert variant="success" title="Inscription enregistree !">
                Un email de confirmation vous a ete envoye a {email}.
              </Alert>
              <div className="rounded-lg p-4" style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Recapitulatif</h3>
                <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <p><span className="font-medium">Option :</span> {selectedOption?.label}</p>
                  <p><span className="font-medium">Quantite :</span> {quantity}</p>
                  <p><span className="font-medium">Total :</span> CHF {total.toFixed(2)}</p>
                  {paymentMode && <p><span className="font-medium">Paiement :</span> {PAYMENT_MODE_LABELS[paymentMode] || paymentMode}</p>}
                  <p><span className="font-medium">Participants :</span> {filledParticipantCount} / {totalSeats} renseignes</p>
                  {filledParticipantCount > 0 && (
                    <ul className="mt-1 pl-4 list-disc">
                      {participants.filter(p => p.first_name.trim() || p.last_name.trim()).map((p, i) => (
                        <li key={i}>{p.first_name} {p.last_name}{p.email && ` (${p.email})`}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Vos coordonnees
              </h2>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Entreprise</label>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={inputStyle}
                  placeholder="Optionnel"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Nom *</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ ...inputStyle, ...(fieldMissing(lastName, step1Touched) ? errorBorder : {}) }}
                  />
                  {fieldMissing(lastName, step1Touched) && <p className="text-xs mt-1 text-[var(--danger)]">Champ requis</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Prénom *</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ ...inputStyle, ...(fieldMissing(firstName, step1Touched) ? errorBorder : {}) }}
                  />
                  {fieldMissing(firstName, step1Touched) && <p className="text-xs mt-1 text-[var(--danger)]">Champ requis</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Adresse *</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ ...inputStyle, ...(fieldMissing(address, step1Touched) ? errorBorder : {}) }}
                />
                {fieldMissing(address, step1Touched) && <p className="text-xs mt-1 text-[var(--danger)]">Champ requis</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>NPA *</label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={e => setPostalCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ ...inputStyle, ...(step1Touched && !/^\d{4,5}$/.test(postalCode) ? errorBorder : {}) }}
                    maxLength={5}
                  />
                  {step1Touched && !/^\d{4,5}$/.test(postalCode) && <p className="text-xs mt-1 text-[var(--danger)]">Champ requis</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Ville *</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ ...inputStyle, ...(fieldMissing(city, step1Touched) ? errorBorder : {}) }}
                  />
                  {fieldMissing(city, step1Touched) && <p className="text-xs mt-1 text-[var(--danger)]">Champ requis</p>}
                </div>
              </div>

              <div>
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  label="Mobile"
                  required
                  error={step1Touched && !phoneValid ? 'Numero invalide (ex. 079 123 45 67)' : null}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>E-mail *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ ...inputStyle, ...(step1Touched && !EMAIL_RE.test(email.trim()) ? errorBorder : {}) }}
                />
                {step1Touched && !EMAIL_RE.test(email.trim()) && <p className="text-xs mt-1 text-[var(--danger)]">Email invalide</p>}
              </div>

              {/* Honeypot */}
              <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
                <input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} />
              </div>

              <div className="pt-2">
                <Button onClick={handleStep1Continue} style={{ width: '100%' }}>
                  Continuer
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Votre reservation
              </h2>

              {event.price_options.length > 0 && (
                <Alert variant="info" title="Options disponibles">
                  <ul className="space-y-0.5">
                    {event.price_options.map(opt => (
                      <li key={opt.id}>
                        {opt.label} — CHF {opt.price.toFixed(2)}
                        {opt.seats > 1 && ` (forfait, ${opt.seats} places)`}
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}

              {event.price_options.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Type de reservation *</label>
                  <select
                    value={selectedOptionId}
                    onChange={e => setSelectedOptionId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ ...inputStyle, ...(step2Touched && !selectedOptionId ? errorBorder : {}) }}
                  >
                    {event.price_options.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label} — CHF {opt.price.toFixed(2)}{opt.seats > 1 ? ` (forfait ${opt.seats} places)` : ' / personne'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedOption && (selectedOption.seats === 1 || quantity > 1) && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Nombre de places *</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
                      style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-lg font-semibold w-10 text-center" style={{ color: 'var(--text-primary)' }}>
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.min(30, quantity + 1))}
                      className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
                      style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {selectedOption && (
                <div className="rounded-lg p-4 text-center" style={{ background: 'var(--success-soft)', border: '1px solid var(--success)' }}>
                  <p className="text-xs uppercase font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Montant total</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    CHF {total.toFixed(2)}
                  </p>
                </div>
              )}

              {bestPriceNotice && (
                <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'var(--info-soft)', border: '1px solid var(--info)' }}>
                  <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--info-text)' }} />
                  <p className="text-sm" style={{ color: 'var(--info-text)' }}>{bestPriceNotice}</p>
                </div>
              )}

              {event.payment_modes && event.payment_modes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Mode de paiement *</label>
                  <div className="space-y-2">
                    {event.payment_modes.map(mode => (
                      <label
                        key={mode}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                        style={{
                          border: `1px solid ${paymentMode === mode ? 'var(--accent)' : 'var(--border-color)'}`,
                          background: paymentMode === mode ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                        }}
                      >
                        <input
                          type="radio"
                          name="payment_mode"
                          value={mode}
                          checked={paymentMode === mode}
                          onChange={e => setPaymentMode(e.target.value)}
                          className="accent-blue-600"
                        />
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                          {PAYMENT_MODE_LABELS[mode] || mode}
                        </span>
                      </label>
                    ))}
                  </div>
                  {step2Touched && !paymentMode && <p className="text-xs mt-1 text-[var(--danger)]">Champ requis</p>}
                </div>
              )}

              {(event.cancellation_deadline_days || event.late_cancellation_fee) && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Annulation par email au club jusqu'à {event.cancellation_deadline_days ?? 7} jours avant l'événement.
                  {event.late_cancellation_fee != null && ` Passé ce délai, CHF ${event.late_cancellation_fee.toFixed(2)} seront facturés.`}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>
                  Retour
                </Button>
                <Button onClick={handleStep2Continue} style={{ flex: 1 }}>
                  Continuer
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Participants
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {totalSeats} {totalSeats > 1 ? 'places' : 'place'} — veuillez renseigner les participants.
              </p>

              <div className="space-y-3">
                {participants.map((p, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg p-3 space-y-2"
                    style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}
                  >
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      Participant {idx + 1} {idx === 0 && '(vous)'}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Prénom"
                        value={p.first_name}
                        onChange={e => updateParticipant(idx, 'first_name', e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        placeholder="Nom"
                        value={p.last_name}
                        onChange={e => updateParticipant(idx, 'last_name', e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                        style={inputStyle}
                      />
                    </div>
                    <input
                      type="email"
                      placeholder="E-mail (optionnel)"
                      value={p.email}
                      onChange={e => updateParticipant(idx, 'email', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>

              {totalSeats > 1 && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Vous pourrez communiquer les noms manquants ulterieurement au club.
                </p>
              )}

              {submitError && (
                <Alert variant="danger" title="Erreur">
                  {submitError}
                </Alert>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setStep(2)} style={{ flex: 1 }}>
                  Retour
                </Button>
                <Button onClick={handleSubmit} loading={submitting} style={{ flex: 1 }}>
                  Verifier et confirmer
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
