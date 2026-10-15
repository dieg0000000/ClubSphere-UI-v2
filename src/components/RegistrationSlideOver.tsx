import { useState, useEffect, useMemo } from 'react'
import { X, RefreshCw, Minus, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Tabs } from './ui/Tabs'
import { Badge } from './ui/Badge'
import Button from './ui/Button'
import PhoneInput from './PhoneInput'
import useEscapeKey from '../hooks/useEscapeKey'

interface PriceOption {
  id: string
  label: string
  seats: number
  price: number
}

interface PublicRegFull {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  price_option_id: string | null
  option_label: string
  option_seats: number
  quantity: number
  total_amount: number
  payment_mode: string | null
  status: string
  participants: Array<{ first_name?: string; last_name?: string; email?: string }>
  source: string | null
  notes: string | null
}

interface Props {
  registration: PublicRegFull
  priceOptions: PriceOption[]
  paymentModes: string[]
  initialTab?: 'details' | 'participants'
  onClose: () => void
  onSaved: () => void
}

export default function RegistrationSlideOver({
  registration,
  priceOptions,
  paymentModes,
  initialTab = 'details',
  onClose,
  onSaved,
}: Props) {
  useEscapeKey(onClose)

  const [tab, setTab] = useState<string>(initialTab)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  // --- Details form state ---
  const [form, setForm] = useState({
    first_name: registration.first_name,
    last_name: registration.last_name,
    company: registration.company || '',
    address: registration.address || '',
    postal_code: registration.postal_code || '',
    city: registration.city || '',
    phone: registration.phone || '',
    email: registration.email || '',
    notes: registration.notes || '',
  })
  const [optionId, setOptionId] = useState(registration.price_option_id || '')
  const [quantity, setQuantity] = useState(registration.quantity)
  const [totalAmount, setTotalAmount] = useState(registration.total_amount)
  const [manualAmount, setManualAmount] = useState(false)
  const [paymentMode, setPaymentMode] = useState(registration.payment_mode || '')
  const [status, setStatus] = useState(registration.status)

  const selectedOption = useMemo(
    () => priceOptions.find(o => o.id === optionId) ?? null,
    [priceOptions, optionId]
  )

  const computedAmount = selectedOption ? selectedOption.price * quantity : 0
  const totalSeats = selectedOption ? selectedOption.seats * quantity : registration.option_seats * registration.quantity

  useEffect(() => {
    if (!manualAmount) {
      setTotalAmount(computedAmount)
    }
  }, [computedAmount, manualAmount])

  function handleRecalculate() {
    setTotalAmount(computedAmount)
    setManualAmount(false)
  }

  // --- Participants state ---
  const [participantRows, setParticipantRows] = useState<Array<{ first_name: string; last_name: string; email: string }>>([])

  useEffect(() => {
    const existing: Array<{ first_name: string; last_name: string; email: string }> = Array.isArray(registration.participants)
      ? registration.participants.map(p => ({
          first_name: p.first_name || '',
          last_name: p.last_name || '',
          email: p.email || '',
        }))
      : []
    const savedSeats = registration.option_seats * registration.quantity
    while (existing.length < savedSeats) {
      existing.push({ first_name: '', last_name: '', email: '' })
    }
    setParticipantRows(existing)
  }, [registration])

  const surplusIndex = totalSeats

  // --- Save details ---
  async function saveDetails() {
    const errs: Record<string, boolean> = {}
    if (!form.first_name.trim()) errs.first_name = true
    if (!form.last_name.trim()) errs.last_name = true
    if (!selectedOption) errs.option = true
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = true
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('event_public_registrations')
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim().toLowerCase() || null,
          phone: form.phone || null,
          company: form.company.trim() || null,
          address: form.address.trim() || null,
          postal_code: form.postal_code.trim() || null,
          city: form.city.trim() || null,
          price_option_id: selectedOption!.id,
          option_label: selectedOption!.label,
          option_seats: selectedOption!.seats,
          quantity,
          total_amount: totalAmount,
          payment_mode: paymentMode || null,
          status,
          notes: form.notes.trim() || null,
        })
        .eq('id', registration.id)
      if (error) throw error
      onSaved()
      onClose()
    } catch (err) {
      console.error('Error updating registration:', err)
    } finally {
      setSaving(false)
    }
  }

  // --- Save participants ---
  async function saveParticipants() {
    setSaving(true)
    try {
      const nonEmpty = participantRows.filter(r => r.first_name.trim() || r.last_name.trim())
      const { error } = await supabase
        .from('event_public_registrations')
        .update({ participants: nonEmpty })
        .eq('id', registration.id)
      if (error) throw error
      onSaved()
      onClose()
    } catch (err) {
      console.error('Error saving participants:', err)
    } finally {
      setSaving(false)
    }
  }

  const origin = registration.source === 'manual' ? 'Manuel' : 'Public'
  const originVariant = registration.source === 'manual' ? 'orange' : 'violet'

  const inputStyle = (hasError?: boolean) => ({
    background: 'var(--bg-input)',
    border: hasError ? '1px solid var(--danger)' : '1px solid var(--border-color)',
    color: 'var(--text-primary)',
  })

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full h-full overflow-y-auto animate-slide-in-right"
        style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)', maxWidth: '680px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between" style={{ background: 'var(--bg-modal-header)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg font-bold truncate" style={{ color: 'var(--text-modal-header)' }}>
              {registration.first_name} {registration.last_name}
            </h2>
            <Badge variant={originVariant as any}>{origin}</Badge>
            <Badge variant={registration.status === 'confirmed' ? 'green' : 'red'}>
              {registration.status === 'confirmed' ? 'Confirme' : 'Annule'}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ color: 'var(--text-modal-header)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4">
          <Tabs
            items={[
              { key: 'details', label: 'Details' },
              { key: 'participants', label: `Participants (${totalSeats})` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {tab === 'details' && (
            <div className="space-y-6">
              {/* Coordonnees */}
              <div>
                <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-muted)' }}>Coordonnees</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Prénom *</label>
                    <input
                      type="text"
                      value={form.first_name}
                      onChange={(e) => { setForm(f => ({ ...f, first_name: e.target.value })); setErrors(er => ({ ...er, first_name: false })) }}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle(errors.first_name)}
                    />
                    {errors.first_name && <span className="text-xs" style={{ color: 'var(--danger)' }}>Requis</span>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Nom *</label>
                    <input
                      type="text"
                      value={form.last_name}
                      onChange={(e) => { setForm(f => ({ ...f, last_name: e.target.value })); setErrors(er => ({ ...er, last_name: false })) }}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle(errors.last_name)}
                    />
                    {errors.last_name && <span className="text-xs" style={{ color: 'var(--danger)' }}>Requis</span>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Entreprise</label>
                    <input
                      type="text"
                      value={form.company}
                      onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle()}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Adresse</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle()}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>NPA</label>
                    <input
                      type="text"
                      value={form.postal_code}
                      onChange={(e) => setForm(f => ({ ...f, postal_code: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle()}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Ville</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle()}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Téléphone</label>
                    <PhoneInput
                      value={form.phone}
                      onChange={(val) => setForm(f => ({ ...f, phone: val }))}
                      placeholder="Téléphone"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => { setForm(f => ({ ...f, email: e.target.value })); setErrors(er => ({ ...er, email: false })) }}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle(errors.email)}
                    />
                    {errors.email && <span className="text-xs" style={{ color: 'var(--danger)' }}>Format invalide</span>}
                  </div>
                </div>
              </div>

              {/* Reservation */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-muted)' }}>Reservation</h4>
                <div className="space-y-3">
                  <div>
                    <select
                      value={optionId}
                      onChange={(e) => { setOptionId(e.target.value); setQuantity(1); setManualAmount(false); setErrors(er => ({ ...er, option: false })) }}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle(errors.option)}
                    >
                      <option value="">-- Choisir une option --</option>
                      {priceOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label} — CHF {opt.price.toFixed(2)}{opt.seats > 1 ? ` (forfait ${opt.seats} places)` : ' / personne'}
                        </option>
                      ))}
                    </select>
                    {errors.option && <span className="text-xs" style={{ color: 'var(--danger)' }}>Requis</span>}
                  </div>

                  {selectedOption && selectedOption.seats === 1 && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Quantite:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setQuantity(Math.max(1, quantity - 1)); setManualAmount(false) }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg"
                          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setQuantity(Math.min(30, quantity + 1)); setManualAmount(false) }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg"
                          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Montant CHF:</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalAmount}
                      onChange={(e) => { setTotalAmount(Number(e.target.value)); setManualAmount(true) }}
                      className="w-28 px-3 py-2 rounded-lg text-sm"
                      style={inputStyle()}
                    />
                    {manualAmount && (
                      <button
                        type="button"
                        onClick={handleRecalculate}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:opacity-80"
                        style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
                        title="Recalculer"
                      >
                        <RefreshCw size={12} />
                        Recalculer
                      </button>
                    )}
                  </div>

                  {selectedOption && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {totalSeats} place{totalSeats > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment mode */}
              {paymentModes.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                  <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-muted)' }}>Mode de paiement</h4>
                  <div className="flex gap-2 flex-wrap">
                    {paymentModes.map(mode => (
                      <label
                        key={mode}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors"
                        style={{
                          background: paymentMode === mode ? 'var(--accent-soft)' : 'var(--bg-input)',
                          border: paymentMode === mode ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <input
                          type="radio"
                          name="so_payment_mode"
                          value={mode}
                          checked={paymentMode === mode}
                          onChange={(e) => setPaymentMode(e.target.value)}
                          className="hidden"
                        />
                        {mode === 'invoice' ? 'Facture' : mode === 'cash_card' ? 'Sur place' : mode}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Status */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-muted)' }}>Statut</h4>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={inputStyle()}
                >
                  <option value="confirmed">Confirme</option>
                  <option value="cancelled">Annule</option>
                </select>
              </div>

              {/* Notes */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-muted)' }}>Notes</h4>
                <textarea
                  rows={3}
                  placeholder="Notes internes..."
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={inputStyle()}
                />
              </div>

              {/* Save */}
              <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                <Button variant="secondary" onClick={onClose}>Fermer</Button>
                <Button loading={saving} onClick={saveDetails}>Enregistrer</Button>
              </div>
            </div>
          )}

          {tab === 'participants' && (
            <div className="space-y-4">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {totalSeats} place{totalSeats > 1 ? 's' : ''} reservee{totalSeats > 1 ? 's' : ''}
              </p>

              <div className="space-y-2">
                {participantRows.map((row, idx) => {
                  const isSurplus = idx >= surplusIndex
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2"
                      style={isSurplus ? { opacity: 0.7 } : undefined}
                    >
                      <span className="text-xs font-medium w-6 shrink-0 text-center" style={{ color: 'var(--text-muted)' }}>
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        placeholder="Prénom"
                        value={row.first_name}
                        onChange={(e) => {
                          const upd = [...participantRows]
                          upd[idx] = { ...upd[idx], first_name: e.target.value }
                          setParticipantRows(upd)
                        }}
                        className="flex-1 px-3 py-2 rounded-lg text-sm"
                        style={inputStyle()}
                      />
                      <input
                        type="text"
                        placeholder="Nom"
                        value={row.last_name}
                        onChange={(e) => {
                          const upd = [...participantRows]
                          upd[idx] = { ...upd[idx], last_name: e.target.value }
                          setParticipantRows(upd)
                        }}
                        className="flex-1 px-3 py-2 rounded-lg text-sm"
                        style={inputStyle()}
                      />
                      <input
                        type="email"
                        placeholder="Email (opt.)"
                        value={row.email}
                        onChange={(e) => {
                          const upd = [...participantRows]
                          upd[idx] = { ...upd[idx], email: e.target.value }
                          setParticipantRows(upd)
                        }}
                        className="flex-1 px-3 py-2 rounded-lg text-sm"
                        style={inputStyle()}
                      />
                      {isSurplus && (
                        <Badge variant="orange">surplus</Badge>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                <Button variant="secondary" onClick={onClose}>Fermer</Button>
                <Button loading={saving} onClick={saveParticipants}>Enregistrer</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
