import { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, ChevronLeft, Check, Users, Info, CircleCheck as CheckCircle, FileText, CreditCard, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../lib/invokeFunction'
import { Profile } from '../types'
import { formatEventDate } from '../utils/eventHelpers'
import { isValidEmail } from '../utils/email'
import Button from './ui/Button'
import { Alert } from './ui/Alert'
import PhoneInput from './PhoneInput'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import { findBestPriceOption } from '../utils/bestPriceOption'

interface EventData {
  id: string
  title: string
  date: string
  location: string
  cancellation_deadline_days?: number
  cost_price?: number
  payment_modes?: string[]
}

interface PriceOption {
  id: string
  label: string
  seats: number
  price: number
}

interface GuestRow {
  first_name: string
  last_name: string
  company: string
  phone: string
  email: string
}

interface Props {
  event: EventData
  priceOptions: PriceOption[]
  user: Profile | null
  onClose: () => void
  onSuccess: () => void
}

function formatCHF(amount: number): string {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")
}

export default function EventRegistrationModal({ event, priceOptions, user, onClose, onSuccess }: Props) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const [firstName, setFirstName] = useState(user?.first_name || '')
  const [lastName, setLastName] = useState(user?.last_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [paymentMode, setPaymentMode] = useState('')

  const [billingAddress, setBillingAddress] = useState('')
  const [billingNpa, setBillingNpa] = useState('')
  const [billingCity, setBillingCity] = useState('')
  const [addressTouched, setAddressTouched] = useState(false)
  const [identityExpanded, setIdentityExpanded] = useState(true)
  const [prefillReady, setPrefillReady] = useState(false)

  const [isSolo, setIsSolo] = useState(true)
  const [totalPersonsInput, setTotalPersonsInput] = useState(2)
  const [appliedGroupOptionId, setAppliedGroupOptionId] = useState<string | null>(null)
  const [bestPriceNotice, setBestPriceNotice] = useState<string | null>(null)
  const suppressBestPriceRef = useRef(false)

  const [guests, setGuests] = useState<GuestRow[]>([{ first_name: '', last_name: '', company: '', phone: '', email: '' }])
  const [emailTouched, setEmailTouched] = useState(false)
  const [guestEmailTouched, setGuestEmailTouched] = useState<boolean[]>([false])
  const [acceptPolicy, setAcceptPolicy] = useState(false)
  const [showCancellationPopup, setShowCancellationPopup] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => {
    if (!user?.email) return
    const emailLower = user.email.trim().toLowerCase()

    function memberAddr(row: { address?: string | null; street_number?: string | null; postal_code?: string | null; city?: string | null }) {
      const street = [row.address, row.street_number].filter(Boolean).join(' ')
      return { addr: street, npa: row.postal_code || '', city: row.city || '' }
    }

    async function prefillIdentity() {
      let fn = user!.first_name || ''
      let ln = user!.last_name || ''
      let em = user!.email || ''
      let ph = user!.phone || ''
      let addr = ''
      let npa = ''
      let city = ''

      // 1. Profile address
      const { data: profileData } = await supabase
        .from('profiles')
        .select('address, npa, city')
        .eq('id', user!.id)
        .maybeSingle()
      if (profileData) {
        if (profileData.address) addr = profileData.address
        if (profileData.npa) npa = profileData.npa
        if (profileData.city) city = profileData.city
      }

      if (user!.role === 'parent') {
        const { data: childRows } = await supabase
          .from('members')
          .select('address, street_number, postal_code, city, legal_rep1_email, legal_rep1_firstname, legal_rep1_lastname, legal_rep1_phone, legal_rep1_address, legal_rep1_postal_code, legal_rep1_city, legal_rep2_email, legal_rep2_firstname, legal_rep2_lastname, legal_rep2_phone, legal_rep2_address, legal_rep2_postal_code, legal_rep2_city')
          .or(`legal_rep1_email.ilike.${emailLower},legal_rep2_email.ilike.${emailLower}`)
          .limit(5)
        const firstChild = childRows?.[0]
        if (firstChild) {
          const isRep1 = firstChild.legal_rep1_email?.toLowerCase() === emailLower
          const repFn = isRep1 ? firstChild.legal_rep1_firstname : firstChild.legal_rep2_firstname
          const repLn = isRep1 ? firstChild.legal_rep1_lastname : firstChild.legal_rep2_lastname
          const repPh = isRep1 ? firstChild.legal_rep1_phone : firstChild.legal_rep2_phone
          if (repFn) fn = repFn
          if (repLn) ln = repLn
          if (repPh) ph = repPh
          em = emailLower

          // 3. Legal rep address from a child record
          if (!addr) {
            for (const child of childRows!) {
              const r1 = child.legal_rep1_email?.toLowerCase() === emailLower
              const ra = r1 ? child.legal_rep1_address : child.legal_rep2_address
              if (ra) {
                addr = ra
                npa = (r1 ? child.legal_rep1_postal_code : child.legal_rep2_postal_code) || ''
                city = (r1 ? child.legal_rep1_city : child.legal_rep2_city) || ''
                break
              }
            }
          }

          // 4. Child's own member address
          if (!addr) {
            for (const child of childRows!) {
              const m = memberAddr(child)
              if (m.addr) {
                addr = m.addr; npa = m.npa; city = m.city
                break
              }
            }
          }
        }
      } else if (user!.role === 'member' || user!.role === 'supporter') {
        const { data: memberData } = await supabase
          .from('members')
          .select('first_name, last_name, email, phone, address, street_number, postal_code, city, legal_rep1_address, legal_rep1_postal_code, legal_rep1_city')
          .ilike('email', emailLower)
          .limit(1)
          .maybeSingle()
        if (memberData) {
          if (memberData.first_name) fn = memberData.first_name
          if (memberData.last_name) ln = memberData.last_name
          if (memberData.email) em = memberData.email
          if (memberData.phone) ph = memberData.phone
          // 2. Own member record address
          if (!addr) {
            const m = memberAddr(memberData)
            if (m.addr) { addr = m.addr; npa = m.npa; city = m.city }
          }
          // 3. Legal rep address on own record
          if (!addr && memberData.legal_rep1_address) {
            addr = memberData.legal_rep1_address
            npa = memberData.legal_rep1_postal_code || ''
            city = memberData.legal_rep1_city || ''
          }
        }
      }

      setFirstName(fn)
      setLastName(ln)
      setEmail(em)
      setPhone(ph)
      setBillingAddress(addr)
      setBillingNpa(npa)
      setBillingCity(city)

      const allFilled = !!(fn && ln && em && addr && npa && city)
      setIdentityExpanded(!allFilled)
      setPrefillReady(true)
    }

    prefillIdentity()
  }, [user?.email, user?.role, user?.id])

  const isFree = priceOptions.length === 0
  const sortedOptions = [...priceOptions].sort((a, b) => a.price - b.price)
  const unitOption = sortedOptions.find(o => o.seats === 1)
  const unitPrice = unitOption ? unitOption.price : 0
  const groupOptions = sortedOptions.filter(o => o.seats > 1)

  const selectedOptionId = isFree
    ? ''
    : isSolo
      ? unitOption?.id || ''
      : appliedGroupOptionId || unitOption?.id || ''

  const selectedOption = priceOptions.find(o => o.id === selectedOptionId)
  const optionSeats = selectedOption ? selectedOption.seats : 1
  const isGroupOption = optionSeats > 1

  const effectiveGuestCount = isSolo
    ? 0
    : isGroupOption
      ? optionSeats - 1
      : Math.max(0, totalPersonsInput - 1)

  const totalPersons = isSolo ? 1 : (isGroupOption ? optionSeats : totalPersonsInput)
  const totalAmount = isFree
    ? 0
    : isGroupOption && selectedOption
      ? selectedOption.price
      : unitPrice * totalPersons

  const paymentModes = event.payment_modes || []
  const showInvoice = paymentModes.includes('invoice')
  const showCashCard = paymentModes.includes('cash_card')
  const hasBothModes = showInvoice && showCashCard
  const singleMode = !hasBothModes && paymentModes.length === 1 ? paymentModes[0] : null

  const cancellationDate = event.cancellation_deadline_days
    ? new Date(new Date(event.date).getTime() - event.cancellation_deadline_days * 24 * 60 * 60 * 1000)
    : null

  const exactMatchOption = !isSolo
    ? groupOptions.find(o => o.seats === totalPersonsInput)
    : null
  const nearbyGroupOption = !isSolo && !exactMatchOption
    ? groupOptions.find(o => o.seats > totalPersonsInput)
    : null

  function handleSetSolo(solo: boolean) {
    setIsSolo(solo)
    setAppliedGroupOptionId(null)
    setBestPriceNotice(null)
  }

  function handleTotalPersonsChange(value: number) {
    const clamped = Math.max(2, Math.min(99, value))
    setTotalPersonsInput(clamped)
    setAppliedGroupOptionId(null)
  }

  function handleApplyGroupOption(optionId: string) {
    setAppliedGroupOptionId(optionId)
    const o = priceOptions.find(x => x.id === optionId)
    if (o) {
      setTotalPersonsInput(o.seats)
    }
  }

  // Best-price auto-switch: when not solo, evaluate if a cheaper option covers totalPersonsInput seats
  useEffect(() => {
    if (suppressBestPriceRef.current) {
      suppressBestPriceRef.current = false
      return
    }
    if (isFree || isSolo || !priceOptions.length || totalPersonsInput < 2) {
      setBestPriceNotice(null)
      return
    }
    // Effective: current selection is selectedOptionId with its effective quantity
    const effOptionId = selectedOptionId
    const effQuantity = isGroupOption ? 1 : totalPersonsInput
    if (!effOptionId) return

    const result = findBestPriceOption(priceOptions, effOptionId, effQuantity)
    if (result && result.switched) {
      suppressBestPriceRef.current = true
      const bestOpt = priceOptions.find(o => o.id === result.optionId)
      if (bestOpt) {
        if (bestOpt.seats > 1) {
          setAppliedGroupOptionId(bestOpt.id)
          setTotalPersonsInput(bestOpt.seats * result.quantity)
        } else {
          setAppliedGroupOptionId(null)
          setTotalPersonsInput(result.quantity)
        }
      }
      setBestPriceNotice(
        `Tarif le plus avantageux appliqué automatiquement : ${result.label} × ${result.quantity} — ${result.total.toFixed(2)} CHF au lieu de ${result.originalTotal.toFixed(2)} CHF.`
      )
    } else {
      setBestPriceNotice(null)
    }
  }, [isSolo, totalPersonsInput, appliedGroupOptionId, priceOptions])

  function syncGuestsArray(count: number) {
    const updated = [...guests]
    while (updated.length < count) {
      updated.push({ first_name: '', last_name: '', company: '', phone: '', email: '' })
    }
    setGuests(updated.slice(0, count))
    const touched = [...guestEmailTouched]
    while (touched.length < count) touched.push(false)
    setGuestEmailTouched(touched.slice(0, count))
  }

  function updateGuest(index: number, field: keyof GuestRow, value: string) {
    const updated = [...guests]
    updated[index] = { ...updated[index], [field]: value }
    setGuests(updated)
  }

  function handleNextFromStep1() {
    syncGuestsArray(effectiveGuestCount)
    if (effectiveGuestCount === 0) {
      setStep(3)
    } else {
      setStep(2)
    }
  }

  function handleBackFromStep3() {
    if (effectiveGuestCount === 0) {
      setStep(1)
    } else {
      setStep(2)
    }
  }

  const effectivePaymentMode = isFree ? null : (singleMode || paymentMode)
  const needsBillingAddress = effectivePaymentMode === 'invoice'
  const showAddressErrors = addressTouched || singleMode === 'invoice'
  const hasFullAddress = !!(billingAddress.trim() && /^\d{4,5}$/.test(billingNpa) && billingCity.trim())
  const hasFullIdentity = !!(firstName.trim() && lastName.trim() && isValidEmail(email))
  const canCollapse = hasFullIdentity && (!needsBillingAddress || hasFullAddress)

  function canProceedStep1(): boolean {
    if (!firstName.trim() || !lastName.trim() || !isValidEmail(email)) return false
    if (!isFree && !selectedOptionId) return false
    if (!isFree && hasBothModes && !paymentMode) return false
    if (needsBillingAddress && (!billingAddress.trim() || !/^\d{4,5}$/.test(billingNpa) || !billingCity.trim())) return false
    return true
  }

  function canProceedStep2(): boolean {
    return guests.slice(0, effectiveGuestCount).every(g =>
      g.first_name.trim() &&
      g.last_name.trim() &&
      (g.email.trim() === '' || isValidEmail(g.email))
    )
  }

  function canSubmit(): boolean {
    if (event.cost_price && !acceptPolicy) return false
    return true
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const finalPaymentMode = isFree ? null : (singleMode || paymentMode)
      const finalGuests = effectiveGuestCount > 0 ? guests.slice(0, effectiveGuestCount) : []

      const participants = [
        { first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim().toLowerCase() },
        ...finalGuests.map(g => ({ first_name: g.first_name.trim(), last_name: g.last_name.trim(), email: g.email.trim().toLowerCase() }))
      ]

      const { data, error } = await invokeFunction('submit-member-event-registration', {
        body: {
          event_id: event.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          price_option_id: selectedOption?.id || null,
          quantity: isGroupOption ? 1 : (isFree ? 1 : totalPersons),
          payment_mode: finalPaymentMode || null,
          participants,
          send_email: true,
          ...(needsBillingAddress ? { address: billingAddress.trim(), postal_code: billingNpa.trim(), city: billingCity.trim() } : {}),
        }
      })

      if (error) throw new Error(error)
      if (data?.error) throw new Error(data.error)

      setSuccess(true)
    } catch (err: unknown) {
      console.error('Error creating registration:', err)
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'inscription. Veuillez réessayer.'
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = { background: 'var(--bg-input)' }
  const stepLabels = ['Coordonnees & choix', 'Accompagnants', 'Confirmation']
  const displaySteps = [1, 2, 3]

  if (success) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-xl max-w-lg w-full" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
          <div className="p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: 'var(--success-soft)' }}>
              <CheckCircle className="w-9 h-9" style={{ color: 'var(--success-text)' }} />
            </div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Inscription confirmee !</h2>

            <div className="bg-[var(--bg-hover)] rounded-lg p-4 border border-[var(--border-color)] text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Événement</span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{event.title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Date</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatEventDate(event.date)}</span>
              </div>
              {selectedOption && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Tarif</span>
                  <span style={{ color: 'var(--text-primary)' }}>{selectedOption.label}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Personnes</span>
                <span style={{ color: 'var(--text-primary)' }}>{totalPersons}</span>
              </div>
              {isFree ? (
                <div className="border-t border-[var(--border-color)] pt-2 flex justify-center">
                  <Alert variant="success" title="Inscription gratuite" />
                </div>
              ) : (
                <div className="border-t border-[var(--border-color)] pt-2 flex justify-between">
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Total</span>
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>CHF {formatCHF(totalAmount)}</span>
                </div>
              )}
            </div>

            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Un email de confirmation a ete envoye a <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{email}</span>
            </p>

            <Button variant="secondary" onClick={() => { onSuccess() }}>
              Fermer
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-modal-header)' }}>
            S'inscrire à {event.title}
          </h2>
          <button onClick={onClose} className="p-2 hover:opacity-80 rounded-lg transition-opacity" style={{ color: 'var(--text-modal-header)' }} aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-6 pt-4 pb-2">
          {displaySteps.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${
                  step === s ? '' : step > s ? '' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                }`}
                style={step === s ? { background: 'var(--accent)', color: 'var(--text-inverse)' } : step > s ? { background: 'var(--success)', color: 'var(--text-inverse)' } : undefined}
              >
                {step > s ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${step === s ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                {stepLabels[s - 1]}
              </span>
              {i < displaySteps.length - 1 && <div className="flex-1 h-px bg-[var(--bg-hover)] mx-1" />}
            </div>
          ))}
        </div>

        <div className="p-6">
          {/* ========== STEP 1 ========== */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Identity & billing - collapsible summary */}
              {prefillReady && !identityExpanded && canCollapse && (
                <div
                  className="rounded-lg p-4 flex items-start justify-between gap-3"
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {needsBillingAddress ? 'Facturation a' : 'Inscription pour'} : {firstName} {lastName}
                    </div>
                    {needsBillingAddress && hasFullAddress && (
                      <div className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {billingAddress}, {billingNpa} {billingCity}
                      </div>
                    )}
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {email}{phone ? ` — ${phone}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIdentityExpanded(true)}
                    className="flex items-center gap-1 text-sm font-medium whitespace-nowrap flex-shrink-0 px-2 py-1 rounded transition-colors"
                    style={{ color: 'var(--accent-text)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Modifier
                  </button>
                </div>
              )}

              {(identityExpanded || !canCollapse) && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Prénom *</label>
                      <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Nom *</label>
                      <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" style={inputStyle} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Email *</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setEmailTouched(false)}
                        onBlur={() => setEmailTouched(true)}
                        className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" style={inputStyle} />
                      {emailTouched && email.trim() !== '' && !isValidEmail(email) && (
                        <p className="mt-1 text-xs" style={{ color: 'var(--danger-text)' }}>Adresse email invalide</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Téléphone</label>
                      <PhoneInput value={phone} onChange={(v) => setPhone(v)} />
                    </div>
                  </div>
                </>
              )}

              {/* Free badge */}
              {isFree && (
                <Alert variant="success" title="Inscription gratuite" />
              )}

              {/* Tariff info box */}
              {!isFree && (
              <div className="bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <Info className="w-4 h-4" style={{ color: 'var(--accent-text)' }} />
                  Tarifs disponibles :
                </div>
                <ul className="space-y-1">
                  {sortedOptions.map(o => {
                    const savings = o.seats > 1 && unitPrice > 0 ? o.seats * unitPrice - o.price : 0
                    return (
                      <li key={o.id} className="text-sm flex items-baseline gap-1.5">
                        <span style={{ color: 'var(--text-muted)' }}>&#8226;</span>
                        <span>
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{o.label}</span>
                          {' : CHF '}
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCHF(o.price)}</span>
                          {o.seats === 1 && (
                            <span className="text-xs ml-1" style={{ color: 'var(--text-secondary)' }}>(par personne)</span>
                          )}
                          {o.seats > 1 && savings > 0 && (
                            <span className="text-xs ml-1" style={{ color: 'var(--success-text)' }}>
                              (table pour {o.seats} personnes — economisez CHF {formatCHF(savings)})
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              )}

              {/* Solo toggle */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Venez-vous seul(e) ?</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleSetSolo(true)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={isSolo
                        ? { backgroundColor: 'var(--primary)', color: 'var(--text-inverse)', border: '2px solid var(--primary)' }
                        : { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '7px 13px' }
                      }>
                      Oui
                    </button>
                    <button type="button" onClick={() => handleSetSolo(false)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={!isSolo
                        ? { backgroundColor: 'var(--primary)', color: 'var(--text-inverse)', border: '2px solid var(--primary)' }
                        : { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '7px 13px' }
                      }>
                      Non
                    </button>
                  </div>
                </div>

                {!isSolo && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Combien de personnes en tout (vous inclus) ?
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="99"
                        value={totalPersonsInput}
                        onChange={(e) => handleTotalPersonsChange(parseInt(e.target.value) || 2)}
                        className="w-32 px-4 py-2 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        style={inputStyle}
                      />
                    </div>

                    {/* Smart suggestion box */}
                    {exactMatchOption && !appliedGroupOptionId && (
                      <div className="rounded-lg p-4" style={{ background: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 30%, var(--border-color))' }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--success-text)' }}>
                              Tarif groupe disponible !
                            </p>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              Le tarif <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{exactMatchOption.label}</span> inclut exactement {exactMatchOption.seats} personnes pour CHF {formatCHF(exactMatchOption.price)}.
                              {unitPrice > 0 && (
                                <> Vous economisez <span className="font-medium" style={{ color: 'var(--success-text)' }}>CHF {formatCHF(exactMatchOption.seats * unitPrice - exactMatchOption.price)}</span> par rapport au tarif individuel.</>
                              )}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyGroupOption(exactMatchOption.id)}
                          className="mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                          style={{ backgroundColor: 'var(--accent)', color: 'var(--text-inverse)' }}
                        >
                          Appliquer ce tarif
                        </button>
                      </div>
                    )}

                    {nearbyGroupOption && !appliedGroupOptionId && (
                      <div className="rounded-lg p-3" style={{ background: 'var(--info-soft)', border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--border-color))' }}>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          <Info className="w-4 h-4 inline-block mr-1 -mt-0.5" style={{ color: 'var(--info-text)' }} />
                          Le tarif <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{nearbyGroupOption.label}</span> est disponible pour {nearbyGroupOption.seats} personnes a CHF {formatCHF(nearbyGroupOption.price)}. Ajoutez {nearbyGroupOption.seats - totalPersonsInput} personne{nearbyGroupOption.seats - totalPersonsInput > 1 ? 's' : ''} pour en profiter.
                        </p>
                      </div>
                    )}

                    {appliedGroupOptionId && selectedOption && isGroupOption && (
                      <div className="flex items-center gap-2 rounded-lg px-4 py-2" style={{ background: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 30%, var(--border-color))' }}>
                        <Users className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success-text)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Tarif <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedOption.label}</span> applique — {optionSeats} personnes incluses
                        </span>
                        <button
                          type="button"
                          onClick={() => setAppliedGroupOptionId(null)}
                          className="ml-auto transition-colors" style={{ color: 'var(--text-secondary)' }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment mode */}
              {!isFree && hasBothModes && (
                <div>
                  <label className="block text-sm font-medium mb-2">Mode de paiement *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {showInvoice && (
                      <label
                        className="relative flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all"
                        style={paymentMode === 'invoice'
                          ? { border: '2px solid var(--primary)', background: 'var(--accent-soft)' }
                          : { border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '13px 17px' }
                        }
                        onMouseEnter={(e) => { if (paymentMode !== 'invoice') e.currentTarget.style.borderColor = 'var(--text-muted)' }}
                        onMouseLeave={(e) => { if (paymentMode !== 'invoice') e.currentTarget.style.borderColor = 'var(--border-color)' }}
                      >
                        <input type="radio" name="payment" checked={paymentMode === 'invoice'} onChange={() => { setPaymentMode('invoice'); setAddressTouched(true) }} className="hidden" />
                        {paymentMode === 'invoice' && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--primary)' }}>
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        )}
                        <FileText className="w-5 h-5" />
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Par facture</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Je recevrai une facture avant l'événement</div>
                        </div>
                      </label>
                    )}
                    {showCashCard && (
                      <label
                        className="relative flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all"
                        style={paymentMode === 'cash_card'
                          ? { border: '2px solid var(--primary)', background: 'var(--accent-soft)' }
                          : { border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '13px 17px' }
                        }
                        onMouseEnter={(e) => { if (paymentMode !== 'cash_card') e.currentTarget.style.borderColor = 'var(--text-muted)' }}
                        onMouseLeave={(e) => { if (paymentMode !== 'cash_card') e.currentTarget.style.borderColor = 'var(--border-color)' }}
                      >
                        <input type="radio" name="payment" checked={paymentMode === 'cash_card'} onChange={() => setPaymentMode('cash_card')} className="hidden" />
                        {paymentMode === 'cash_card' && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--primary)' }}>
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        )}
                        <CreditCard className="w-5 h-5" />
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Sur place</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Cash ou carte</div>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              )}
              {!isFree && singleMode && (
                <div className="bg-[var(--bg-hover)] rounded-lg px-4 py-3 border border-[var(--border-color)]">
                  <div className="flex items-center gap-2 text-sm">
                    {singleMode === 'invoice' ? <FileText className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                    Paiement : {singleMode === 'invoice' ? 'Par facture' : 'Sur place (cash/carte)'}
                  </div>
                </div>
              )}

              {needsBillingAddress && identityExpanded && (
                <div className="space-y-3">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Adresse de facturation</div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Adresse *</label>
                    <input
                      type="text"
                      value={billingAddress}
                      onChange={e => setBillingAddress(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                      style={{ background: 'var(--bg-card)', border: `1px solid ${showAddressErrors && !billingAddress.trim() ? 'var(--danger)' : 'var(--border-color)'}`, color: 'var(--text-primary)' }}
                    />
                    {showAddressErrors && !billingAddress.trim() && <p className="text-xs mt-1" style={{ color: 'var(--danger-text)' }}>Champ requis</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>NPA *</label>
                      <input
                        type="text"
                        value={billingNpa}
                        onChange={e => setBillingNpa(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                        style={{ background: 'var(--bg-card)', border: `1px solid ${showAddressErrors && !/^\d{4,5}$/.test(billingNpa) ? 'var(--danger)' : 'var(--border-color)'}`, color: 'var(--text-primary)' }}
                        maxLength={5}
                      />
                      {showAddressErrors && !/^\d{4,5}$/.test(billingNpa) && <p className="text-xs mt-1" style={{ color: 'var(--danger-text)' }}>Champ requis</p>}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Localite *</label>
                      <input
                        type="text"
                        value={billingCity}
                        onChange={e => setBillingCity(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                        style={{ background: 'var(--bg-card)', border: `1px solid ${showAddressErrors && !billingCity.trim() ? 'var(--danger)' : 'var(--border-color)'}`, color: 'var(--text-primary)' }}
                      />
                      {showAddressErrors && !billingCity.trim() && <p className="text-xs mt-1" style={{ color: 'var(--danger-text)' }}>Champ requis</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Live total */}
              {selectedOption && (
                <div className="bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[var(--text-primary)] font-bold text-lg">Total : CHF {formatCHF(totalAmount)}</div>
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{totalPersons} personne{totalPersons > 1 ? 's' : ''}</div>
                  </div>
                </div>
              )}

              {bestPriceNotice && (
                <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: 'var(--info-soft)', border: '1px solid var(--border-color)' }}>
                  <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--info-text)' }} />
                  <p className="text-sm" style={{ color: 'var(--info-text)' }}>{bestPriceNotice}</p>
                </div>
              )}
            </div>
          )}

          {/* ========== STEP 2 ========== */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Accompagnants</h3>

              {isGroupOption && selectedOption && (
                <div className="bg-[var(--bg-hover)] border border-[var(--border-color)] rounded-lg px-4 py-2">
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Ces {effectiveGuestCount} accompagnant{effectiveGuestCount > 1 ? 's' : ''} sont inclus dans votre tarif <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedOption.label}</span>
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {guests.slice(0, effectiveGuestCount).map((guest, idx) => (
                  <div key={idx} className="bg-[var(--bg-hover)] rounded-lg p-4 border border-[var(--border-color)]">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                      <span className="text-sm font-medium">Accompagnant {idx + 1} / {effectiveGuestCount}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Prénom *</label>
                        <input type="text" value={guest.first_name} onChange={(e) => updateGuest(idx, 'first_name', e.target.value)}
                          className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Nom *</label>
                        <input type="text" value={guest.last_name} onChange={(e) => updateGuest(idx, 'last_name', e.target.value)}
                          className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Societe</label>
                        <input type="text" value={guest.company} onChange={(e) => updateGuest(idx, 'company', e.target.value)}
                          className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Téléphone</label>
                        <PhoneInput value={guest.phone} onChange={(v) => updateGuest(idx, 'phone', v)} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Email</label>
                        <input type="email" value={guest.email} onChange={(e) => updateGuest(idx, 'email', e.target.value)}
                          onFocus={() => {
                            const t = [...guestEmailTouched]
                            while (t.length <= idx) t.push(false)
                            t[idx] = false
                            setGuestEmailTouched(t)
                          }}
                          onBlur={() => {
                            const t = [...guestEmailTouched]
                            while (t.length <= idx) t.push(false)
                            t[idx] = true
                            setGuestEmailTouched(t)
                          }}
                          className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" style={inputStyle} />
                        {guestEmailTouched[idx] && guest.email.trim() !== '' && !isValidEmail(guest.email) && (
                          <p className="mt-1 text-xs" style={{ color: 'var(--danger-text)' }}>Adresse email invalide</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========== STEP 3 ========== */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Confirmation</h3>

              <div className="bg-[var(--bg-hover)] rounded-lg p-5 border border-[var(--border-color)] space-y-3">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Événement</span>
                  <span className="font-medium text-right" style={{ color: 'var(--text-primary)' }}>{event.title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Date</span>
                  <span className="text-right" style={{ color: 'var(--text-primary)' }}>{formatEventDate(event.date)}</span>
                </div>
                {event.location && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Lieu</span>
                    <span className="text-right" style={{ color: 'var(--text-primary)' }}>{event.location}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Inscrit</span>
                  <span style={{ color: 'var(--text-primary)' }}>{firstName} {lastName}</span>
                </div>
                {!isFree && selectedOption && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Tarif</span>
                    <span style={{ color: 'var(--text-primary)' }}>{selectedOption.label} — CHF {formatCHF(selectedOption.price)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Accompagnants</span>
                  <span style={{ color: 'var(--text-primary)' }}>{effectiveGuestCount} personne{effectiveGuestCount !== 1 ? 's' : ''}</span>
                </div>
                {!isFree && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Paiement</span>
                    <span className="flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                      {(singleMode || paymentMode) === 'invoice' ? (
                        <><FileText className="w-4 h-4 inline mr-1" />Facture</>
                      ) : (
                        <><CreditCard className="w-4 h-4 inline mr-1" />Sur place</>
                      )}
                    </span>
                  </div>
                )}
                {isFree ? (
                  <div className="border-t border-[var(--border-color)] pt-3 flex justify-center">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: 'var(--success-soft)', color: 'var(--success-text)', border: '1px solid var(--success)' }}>
                      Inscription gratuite
                    </span>
                  </div>
                ) : (
                  <div className="border-t border-[var(--border-color)] pt-3 flex justify-between">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Total</span>
                    <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>CHF {formatCHF(totalAmount)}</span>
                  </div>
                )}
              </div>

              {event.cost_price && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowCancellationPopup(true)}
                    className="text-sm underline underline-offset-2 transition-colors"
                    style={{ color: 'var(--accent-text)' }}
                  >
                    Conditions d'annulation
                  </button>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={acceptPolicy} onChange={(e) => setAcceptPolicy(e.target.checked)} className="w-4 h-4 rounded mt-0.5" />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>J'ai lu et accepte les conditions d'annulation</span>
                  </label>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end px-6 pb-6 pt-2" style={{ gap: '12px' }}>
          {step > 1 ? (
            <Button variant="secondary" onClick={() => step === 3 ? handleBackFromStep3() : setStep(1)}>
              <ChevronLeft className="w-4 h-4" />
              Retour
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
          )}

          {step < 3 ? (
            <Button
              variant="primary"
              onClick={() => { setAddressTouched(true); step === 1 ? handleNextFromStep1() : setStep(3) }}
              disabled={step === 1 ? !canProceedStep1() : !canProceedStep2()}
            >
              Suivant
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit()}
            >
              {submitting ? 'Inscription...' : 'Confirmer mon inscription'}
              {!submitting && <Check className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Cancellation popup */}
      {showCancellationPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowCancellationPopup(false)}>
          <div className="rounded-xl max-w-md w-full p-6 space-y-4" style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Conditions d'annulation</h3>
            <div className="text-sm space-y-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {cancellationDate && (
                <p>
                  Annulation gratuite jusqu'au <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{cancellationDate.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}</span>.
                </p>
              )}
              <p>
                Apres cette date, des frais de <span className="font-medium" style={{ color: 'var(--text-primary)' }}>CHF {formatCHF(event.cost_price!)}</span> par personne peuvent etre factures.
              </p>
              <p>
                Passé le jour de l'événement, aucun remboursement n'est possible.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setShowCancellationPopup(false)}>
              Compris
            </Button>
          </div>
        </div>
      )}
      <Toast toast={toast} />
    </div>
  )
}
