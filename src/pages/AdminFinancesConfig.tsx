import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { Pencil, Lightbulb, Mail, TriangleAlert as AlertTriangle, CircleCheck, Wallet, Users } from 'lucide-react'
import { Toggle } from '../components/Toggle'
import { Tabs } from '../components/ui/Tabs'
import { useToast } from '../hooks/useToast'
import { Toast } from '../components/Toast'
import { useTenant } from '../context/TenantContext'
import Button from '../components/ui/Button'
import { AdminFinancesCotisations } from './AdminFinancesCotisations'

interface FinanceConfig {
  id?: string
  bank_name: string
  bank_street?: string
  bank_street_number?: string
  bank_postal_code?: string
  bank_city?: string
  qr_iban: string
  email_sender: string
  email_sender_name: string
  contact_phone?: string
  contact_name?: string
  payment_delay_days: number
  reminder1_days: number
  reminder2_days: number
  reminder2_fee: number
  fratrie_max_age: number
  fratrie_discount_2: number
  fratrie_discount_3: number
  fratrie_discount_4: number
  auto_send_invoices?: boolean
  invoice_number_prefix?: string
  sponsoring_compte?: string
  confrerie_compte?: string
  sponsoring_email_subject?: string
  sponsoring_email_message?: string
  confrerie_amount?: number
  exempt_committee?: boolean
  exempt_coaches?: boolean
}

interface ClubSettings {
  club_name: string
  club_address: string
  club_street_number: string
  club_postal_code: string
  club_city: string
  club_email: string
  club_phone: string
  club_website: string
  confrerie_label?: string
}

export function AdminFinancesConfig() {
  const { clubId } = useTenant()
  const { canView, canEdit, loading: moduleLoading } = useModuleAccess('finances')
  const [activeTab, setActiveTab] = useState<'club' | 'facturation' | 'cotisations' | 'confrerie'>('club')
  const [config, setConfig] = useState<FinanceConfig>({
    bank_name: '',
    bank_street: '',
    bank_street_number: '',
    bank_postal_code: '',
    bank_city: '',
    qr_iban: '',
    email_sender: '',
    email_sender_name: '',
    contact_name: '',
    contact_phone: '',
    payment_delay_days: 30,
    reminder1_days: 40,
    reminder2_days: 55,
    reminder2_fee: 30,
    fratrie_max_age: 18,
    fratrie_discount_2: 20,
    fratrie_discount_3: 30,
    fratrie_discount_4: 40,
    auto_send_invoices: false,
    invoice_number_prefix: '',
    sponsoring_compte: '',
    confrerie_compte: '',
    sponsoring_email_subject: '',
    sponsoring_email_message: '',
    confrerie_amount: 500,
    exempt_committee: false,
    exempt_coaches: false
  })
  const [clubSettings, setClubSettings] = useState<ClubSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => { document.title = 'Configuration finances - ClubSphere' }, [])

  useEffect(() => {
    loadConfig()
  }, [clubId])

  const loadConfig = async () => {
    if (!clubId) return
    setLoading(true)

    const { data: financeData } = await supabase
      .from('finance_config')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (financeData) {
      setConfig({
        qr_iban: financeData.qr_iban || '',
        bank_name: financeData.bank_name || '',
        bank_street: financeData.bank_street || '',
        bank_street_number: financeData.bank_street_number || '',
        bank_postal_code: financeData.bank_postal_code || '',
        bank_city: financeData.bank_city || '',
        email_sender: financeData.email_sender || '',
        email_sender_name: financeData.email_sender_name || '',
        contact_name: financeData.contact_name || '',
        contact_phone: financeData.contact_phone || '',
        payment_delay_days: financeData.payment_delay_days || 30,
        reminder1_days: financeData.reminder1_days || 40,
        reminder2_days: financeData.reminder2_days || 55,
        reminder2_fee: financeData.reminder2_fee || 30,
        fratrie_max_age: financeData.fratrie_max_age || 18,
        fratrie_discount_2: financeData.fratrie_discount_2 || 20,
        fratrie_discount_3: financeData.fratrie_discount_3 || 30,
        fratrie_discount_4: financeData.fratrie_discount_4 || 40,
        auto_send_invoices: financeData.auto_send_invoices || false,
        invoice_number_prefix: financeData.invoice_number_prefix || '',
        sponsoring_compte: financeData.sponsoring_compte || '',
        confrerie_compte: financeData.confrerie_compte || '',
        sponsoring_email_subject: financeData.sponsoring_email_subject || '',
        sponsoring_email_message: financeData.sponsoring_email_message || '',
        confrerie_amount: financeData.confrerie_amount ?? 500,
        exempt_committee: financeData.exempt_committee ?? false,
        exempt_coaches: financeData.exempt_coaches ?? false
      })
    }

    const { data: clubData } = await supabase
      .from('club_settings')
      .select('*')
      .eq('club_id', clubId)
      .maybeSingle()

    if (clubData) {
      setClubSettings(clubData)
    }

    setLoading(false)
  }

  const updateConfig = (field: keyof FinanceConfig, value: any) => {
    setConfig({ ...config, [field]: value })
  }

  const saveConfig = async () => {
    setSaving(true)

    const updateData = {
      qr_iban: config.qr_iban || null,
      bank_name: config.bank_name || null,
      bank_street: config.bank_street || null,
      bank_street_number: config.bank_street_number || null,
      bank_postal_code: config.bank_postal_code || null,
      bank_city: config.bank_city || null,
      email_sender: config.email_sender || null,
      email_sender_name: config.email_sender_name || null,
      contact_name: config.contact_name || null,
      contact_phone: config.contact_phone || null,
      payment_delay_days: config.payment_delay_days || 30,
      reminder1_days: config.reminder1_days || 40,
      reminder2_days: config.reminder2_days || 55,
      reminder2_fee: config.reminder2_fee || 30,
      fratrie_max_age: config.fratrie_max_age || 18,
      fratrie_discount_2: config.fratrie_discount_2 || 20,
      fratrie_discount_3: config.fratrie_discount_3 || 30,
      fratrie_discount_4: config.fratrie_discount_4 || 40,
      auto_send_invoices: config.auto_send_invoices || false,
      invoice_number_prefix: config.invoice_number_prefix || null,
      sponsoring_compte: config.sponsoring_compte || null,
      confrerie_compte: config.confrerie_compte || null,
      sponsoring_email_subject: config.sponsoring_email_subject || null,
      sponsoring_email_message: config.sponsoring_email_message || null,
      confrerie_amount: config.confrerie_amount || 500,
      exempt_committee: config.exempt_committee ?? false,
      exempt_coaches: config.exempt_coaches ?? false,
      updated_at: new Date().toISOString()
    }

    console.log('Saving finance config:', updateData)

    const { data: existing } = await supabase
      .from('finance_config')
      .select('id')
      .single()

    let error
    if (existing?.id) {
      const result = await supabase
        .from('finance_config')
        .update(updateData)
        .eq('id', existing.id)
      error = result.error
      console.log('Finance config update result:', result.error)
    } else {
      const result = await supabase
        .from('finance_config')
        .insert(updateData)
      error = result.error
      console.log('Finance config insert result:', result.error)
    }

    setSaving(false)

    if (error) {
      console.error('Finance config save error:', error)
      showToast('Erreur: ' + error.message, 'error')
    } else {
      showToast('Configuration sauvegardée !', 'success')
      loadConfig()
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none'
  }

  const smallInputStyle: React.CSSProperties = {
    width: '80px',
    padding: '8px 12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none'
  }

  const helperStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '6px',
    lineHeight: '1.4'
  }

  if (moduleLoading || loading) {
    return <div style={{ color: 'var(--text-primary)' }}>Chargement...</div>
  }

  if (!canView) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '32px', textAlign: 'center' }}>
        Accès non autorisé
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>
          Configuration financière
        </h1>
        {canEdit && (
          <Button
            onClick={saveConfig}
            disabled={saving}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        )}
      </div>

      <Tabs
        items={[
          { key: 'club', label: 'Club & Banque' },
          { key: 'facturation', label: 'Facturation' },
          { key: 'cotisations', label: 'Cotisations' },
          { key: 'confrerie', label: clubSettings?.confrerie_label || 'Club des 500' },
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        className="mb-6"
      />

      {activeTab === 'club' && (
        <div style={{ maxWidth: '600px' }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <div style={{
                color: 'var(--text-muted)',
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: '600'
              }}>
                Informations du club
              </div>
              <a
                href="/admin/parametres-club"
                style={{
                  color: 'var(--accent)',
                  fontSize: '12px',
                  textDecoration: 'none'
                }}
              >
                <Pencil size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Modifier dans Paramètres club →
              </a>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px'
            }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Nom
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
                  {clubSettings?.club_name || '—'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Email
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                  {clubSettings?.club_email || '—'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Adresse
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                  {[clubSettings?.club_address, clubSettings?.club_street_number]
                    .filter(Boolean).join(' ') || '—'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Téléphone
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                  {clubSettings?.club_phone || '—'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  NPA / Ville
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                  {[clubSettings?.club_postal_code, clubSettings?.club_city]
                    .filter(Boolean).join(' ') || '—'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  Site web
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                  {clubSettings?.club_website || '—'}
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px'
          }}>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>
            Informations bancaires
          </h3>

          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label style={labelStyle}>QR-IBAN</label>
              <input
                type="text"
                value={config.qr_iban}
                onChange={(e) => updateConfig('qr_iban', e.target.value)}
                placeholder="CH44 3199 9123 0008 8901 2"
                disabled={!canEdit}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Nom de la banque</label>
              <input
                type="text"
                value={config.bank_name}
                onChange={(e) => updateConfig('bank_name', e.target.value)}
                disabled={!canEdit}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 3 }}>
                  <label style={labelStyle}>Rue de la banque</label>
                  <input
                    type="text"
                    value={config.bank_street || ''}
                    onChange={(e) => updateConfig('bank_street', e.target.value)}
                    placeholder="Route de Lausanne"
                    disabled={!canEdit}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>N°</label>
                  <input
                    type="text"
                    value={config.bank_street_number || ''}
                    onChange={(e) => updateConfig('bank_street_number', e.target.value)}
                    placeholder="12"
                    disabled={!canEdit}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>NPA</label>
                  <input
                    type="text"
                    value={config.bank_postal_code || ''}
                    onChange={(e) => updateConfig('bank_postal_code', e.target.value)}
                    placeholder="1000"
                    disabled={!canEdit}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 3 }}>
                  <label style={labelStyle}>Ville</label>
                  <input
                    type="text"
                    value={config.bank_city || ''}
                    onChange={(e) => updateConfig('bank_city', e.target.value)}
                    placeholder="Lausanne"
                    disabled={!canEdit}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          </div>
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px'
          }}>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>
            Email
          </h3>

          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Email expéditeur</label>
              <input
                type="email"
                value={config.email_sender}
                onChange={(e) => updateConfig('email_sender', e.target.value)}
                placeholder="info@monclub.ch"
                disabled={!canEdit}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Nom expéditeur</label>
              <input
                type="text"
                value={config.email_sender_name}
                onChange={(e) => updateConfig('email_sender_name', e.target.value)}
                placeholder="Nom du club"
                disabled={!canEdit}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
              <div>
                <label style={labelStyle}>Nom du responsable finances</label>
                <input
                  type="text"
                  value={config.contact_name || ''}
                  onChange={(e) => updateConfig('contact_name', e.target.value)}
                  placeholder="ex: Jean Dupont (Trésorier)"
                  disabled={!canEdit}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Téléphone contact facturation</label>
                <input
                  type="text"
                  value={config.contact_phone || ''}
                  onChange={(e) => updateConfig('contact_phone', e.target.value)}
                  placeholder="+41 79 000 00 00"
                  disabled={!canEdit}
                  style={inputStyle}
                />
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                <Lightbulb size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Ce numéro apparaîtra sur les factures pour les questions relatives aux paiements.
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '16px',
              marginTop: '16px'
            }}>
              <div>
                <div style={{
                  color: 'var(--text-primary)', fontWeight: '600',
                  fontSize: '14px', marginBottom: '4px'
                }}>
                  <Mail size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Envoi automatique des factures
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  Si activé, les factures générées depuis la page Émission de factures sont envoyées par email (avec le PDF QR) dès leur génération. Les factures individuelles restent toujours en brouillon : envoyez-les via l'icône enveloppe après relecture.
                </div>
              </div>

              <div
                onClick={() => canEdit && updateConfig(
                  'auto_send_invoices', !config.auto_send_invoices
                )}
                style={{
                  width: '48px',
                  height: '26px',
                  background: config.auto_send_invoices
                    ? 'var(--success)' : 'var(--bg-input)',
                  borderRadius: '99px',
                  cursor: canEdit ? 'pointer' : 'not-allowed',
                  opacity: canEdit ? 1 : 0.5,
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                  marginLeft: '20px'
                }}>
                <div style={{
                  position: 'absolute',
                  top: '3px',
                  left: config.auto_send_invoices ? '25px' : '3px',
                  width: '20px',
                  height: '20px',
                  background: 'var(--text-inverse)',
                  borderRadius: '50%',
                  transition: 'left 0.2s',
                  boxShadow: 'var(--shadow-sm)'
                }} />
              </div>
            </div>

            {!config.auto_send_invoices && (
              <div style={{
                background: 'var(--warning-soft)',
                border: '1px solid var(--warning)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginTop: '10px',
                color: 'var(--warning-text)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertTriangle size={14} aria-hidden="true" />
                <span>
                  Les factures générées en lot (page Émission) resteront en brouillon. Envoyez-les individuellement via l'icône enveloppe après relecture.
                </span>
              </div>
            )}

            {config.auto_send_invoices && (
              <div style={{
                background: 'var(--success-soft)',
                border: '1px solid var(--success)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginTop: '10px',
                color: 'var(--success-text)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CircleCheck size={14} aria-hidden="true" />
                <span>
                  Les factures générées en lot (page Émission) seront envoyées automatiquement par email avec le PDF QR. Les factures créées individuellement restent en brouillon jusqu'à envoi manuel.
                </span>
              </div>
            )}

            <div>
              <label style={labelStyle}>Délai de paiement (jours)</label>
              <input
                type="number"
                value={config.payment_delay_days}
                onChange={(e) => updateConfig('payment_delay_days', parseInt(e.target.value))}
                disabled={!canEdit}
                style={inputStyle}
              />
            </div>
          </div>
          </div>
        </div>
      )}

      {activeTab === 'facturation' && (
        <div>
          {/* Rappels & Rabais - merged into Facturation tab */}
          <div style={{ maxWidth: '600px', marginBottom: '32px' }}>
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px'
            }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>
              Rappels
            </h3>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{
                background: 'var(--bg-hover)',
                borderRadius: '10px',
                padding: '16px'
              }}>
                <div style={{ color: 'var(--warning-text)', fontWeight: '700', marginBottom: '12px' }}>
                  <Mail size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />1er rappel
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    Envoyer après
                  </span>
                  <input
                    type="number"
                    value={config.reminder1_days}
                    onChange={(e) => updateConfig('reminder1_days', parseInt(e.target.value))}
                    disabled={!canEdit}
                    style={smallInputStyle}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    jours — sans frais supplémentaires
                  </span>
                </div>
              </div>

              <div style={{
                background: 'var(--bg-hover)',
                borderRadius: '10px',
                padding: '16px'
              }}>
                <div style={{ color: 'var(--danger)', fontWeight: '700', marginBottom: '12px' }}>
                  <Mail size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />2ème rappel
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    Envoyer après
                  </span>
                  <input
                    type="number"
                    value={config.reminder2_days}
                    onChange={(e) => updateConfig('reminder2_days', parseInt(e.target.value))}
                    disabled={!canEdit}
                    style={smallInputStyle}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    jours
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    Frais de rappel
                  </span>
                  <input
                    type="number"
                    value={config.reminder2_fee}
                    onChange={(e) => updateConfig('reminder2_fee', parseFloat(e.target.value))}
                    disabled={!canEdit}
                    style={smallInputStyle}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    CHF
                  </span>
                </div>
              </div>
            </div>
            </div>

            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px'
            }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>
              Exonérations de cotisation
            </h3>

            <div style={{ display: 'grid', gap: '16px' }}>
              {[
                { key: 'exempt_committee' as keyof FinanceConfig, label: 'Exonérer les membres du comité' },
                { key: 'exempt_coaches' as keyof FinanceConfig, label: 'Exonérer les entraîneurs (staff d’équipe, aides-moniteurs exclus)' }
              ].map(({ key, label }) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px'
                }}>
                  <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{label}</span>
                  <Toggle
                    checked={!!config[key]}
                    onChange={(checked) => updateConfig(key, checked)}
                    disabled={!canEdit}
                  />
                </div>
              ))}
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                <Lightbulb size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Appliqué à la génération des cotisations. Les factures déjà créées ne sont pas modifiées.
              </div>
            </div>
            </div>

            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px'
            }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>
              Rabais fratrie
            </h3>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '14px', minWidth: '200px' }}>
                  Applicable jusqu&apos;à l&apos;âge de
                </span>
                <input
                  type="number"
                  value={config.fratrie_max_age}
                  onChange={(e) => updateConfig('fratrie_max_age', parseInt(e.target.value))}
                  disabled={!canEdit}
                  style={smallInputStyle}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                  ans
                </span>
              </div>

              {[
                { key: 'fratrie_discount_2', label: '2 frères/sœurs' },
                { key: 'fratrie_discount_3', label: '3 frères/sœurs' },
                { key: 'fratrie_discount_4', label: '4 frères/sœurs ou +' }
              ].map(({ key, label }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px', minWidth: '200px' }}>
                    {label}
                  </span>
                  <input
                    type="number"
                    value={config[key as keyof FinanceConfig] as number}
                    onChange={(e) => updateConfig(key as keyof FinanceConfig, parseFloat(e.target.value))}
                    disabled={!canEdit}
                    style={smallInputStyle}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    % de rabais sur la cotisation la moins élevée
                  </span>
                </div>
              ))}

              <div style={{
                color: 'var(--text-muted)',
                fontSize: '12px',
                marginTop: '4px'
              }}>
                <Lightbulb size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Le rabais s&apos;applique sur la facture du joueur avec la cotisation la moins élevée (en général le plus jeune).
              </div>
            </div>
            </div>
          </div>

          <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
              maxWidth: '600px'
            }}>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                Compte confrérie : {config.confrerie_compte ? (
                  <strong style={{ color: 'var(--text-primary)' }}>{config.confrerie_compte}</strong>
                ) : (
                  <em>non configuré</em>
                )}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                — à configurer dans Configuration financière, onglet {clubSettings?.confrerie_label || 'Club des 500'}
              </span>
            </div>

          <FacturationTab
            config={config}
            setConfig={setConfig}
            canEdit={canEdit}
          />
        </div>
      )}

      {activeTab === 'cotisations' && (
        <AdminFinancesCotisations embedded embeddedCanEdit={canEdit} />
      )}

      {activeTab === 'confrerie' && (
        <ConfrerieConfigTab
          config={config}
          updateConfig={updateConfig}
          canEdit={canEdit}
        />
      )}

      <Toast toast={toast} />
    </div>
  )
}

const PLACEHOLDER_CHIPS = [
  { key: '{numero}', label: 'Numéro' },
  { key: '{sponsor}', label: 'Sponsor' },
  { key: '{montant}', label: 'Montant' },
  { key: '{echeance}', label: 'Échéance' },
  { key: '{saison}', label: 'Saison' },
  { key: '{club}', label: 'Club' },
]

function FacturationTab({ config, setConfig, canEdit }: {
  config: FinanceConfig
  setConfig: (c: FinanceConfig) => void
  canEdit: boolean
}) {
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)

  const insertPlaceholder = (placeholder: string, target: 'subject' | 'message') => {
    const el = target === 'message' ? messageRef.current : subjectRef.current
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const before = el.value.slice(0, start)
    const after = el.value.slice(end)
    const newValue = before + placeholder + after
    const field = target === 'message' ? 'sponsoring_email_message' : 'sponsoring_email_subject'
    setConfig({ ...config, [field]: newValue })
    setTimeout(() => {
      el.focus()
      const pos = start + placeholder.length
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  const stdLabel: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  }

  const stdInput: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none'
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px'
  }

  const helperStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '6px',
    lineHeight: '1.4'
  }

  return (
    <div>
      {/* Invoice Number Prefix */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Numérotation des factures
        </h3>
        <div>
          <label style={stdLabel}>Préfixe de numérotation des factures</label>
          <input
            type="text"
            style={stdInput}
            value={config.invoice_number_prefix || ''}
            onChange={(e) => setConfig({ ...config, invoice_number_prefix: e.target.value })}
            placeholder="FA2526-"
            disabled={!canEdit}
          />
          <p style={helperStyle}>
            Laissez vide pour conserver le format automatique actuel. Ce préfixe s'applique à TOUTES les factures (cotisations et sponsoring), qui partagent une seule série de numérotation.
          </p>
        </div>
      </div>

      {/* Sponsoring Accounting */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
          Sponsoring
        </h3>
        <div style={{ marginBottom: '20px' }}>
          <label style={stdLabel}>Compte comptable Sponsoring</label>
          <input
            type="text"
            style={stdInput}
            value={config.sponsoring_compte || ''}
            onChange={(e) => setConfig({ ...config, sponsoring_compte: e.target.value })}
            placeholder="3200"
            disabled={!canEdit}
          />
          <p style={helperStyle}>
            Compte utilisé pour les factures de sponsoring dans la Situation financière.
          </p>
        </div>
        {/* Sponsoring Email Template */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Email de facture sponsoring
          </h4>

          <div style={{ marginBottom: '16px' }}>
            <label style={stdLabel}>Sujet</label>
            <input
              ref={subjectRef}
              type="text"
              style={stdInput}
              value={config.sponsoring_email_subject || ''}
              onChange={(e) => setConfig({ ...config, sponsoring_email_subject: e.target.value })}
              placeholder="Facture {numero} — Sponsoring {saison}"
              disabled={!canEdit}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={stdLabel}>Message</label>
            <textarea
              ref={messageRef}
              style={{
                ...stdInput,
                minHeight: '180px',
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: '1.5'
              }}
              value={config.sponsoring_email_message || ''}
              onChange={(e) => setConfig({ ...config, sponsoring_email_message: e.target.value })}
              placeholder={"Madame, Monsieur,\n\nVeuillez trouver ci-joint la facture {numero} d'un montant de {montant} CHF relative à votre sponsoring pour la saison {saison}.\n\nÉchéance: {echeance}\n\nAvec nos remerciements,\n{club}"}
              disabled={!canEdit}
              rows={8}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {PLACEHOLDER_CHIPS.map(chip => (
              <button
                key={chip.key}
                type="button"
                disabled={!canEdit}
                onClick={() => insertPlaceholder(chip.key, 'message')}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '14px',
                  color: 'var(--text-secondary)',
                  cursor: canEdit ? 'pointer' : 'default',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (canEdit) {
                    e.currentTarget.style.background = 'var(--accent)'
                    e.currentTarget.style.color = 'var(--text-inverse)'
                    e.currentTarget.style.borderColor = 'var(--accent)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                }}
              >
                {chip.key} <span style={{ opacity: 0.7, marginLeft: '2px' }}>{chip.label}</span>
              </button>
            ))}
          </div>
          <p style={helperStyle}>
            Ces espaces réservés seront remplacés automatiquement à l'envoi. Laissez vide pour utiliser le texte par défaut.
          </p>
        </div>
      </div>
    </div>
  )
}

function ConfrerieConfigTab({ config, updateConfig, canEdit }: {
  config: FinanceConfig
  updateConfig: (field: keyof FinanceConfig, value: any) => void
  canEdit: boolean
}) {
  const stdLabel: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  }

  const stdInput: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none'
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px'
  }

  const helperStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '6px',
    lineHeight: '1.4'
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={16} aria-hidden="true" />
          Cercle de donateurs
        </h3>

        <div style={{ marginBottom: '20px' }}>
          <label style={stdLabel}>Montant de la cotisation</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              step="0.01"
              min="0"
              value={config.confrerie_amount ?? 500}
              onChange={(e) => updateConfig('confrerie_amount', parseFloat(e.target.value) || 0)}
              disabled={!canEdit}
              style={{ ...stdInput, flex: 1 }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px', flexShrink: 0 }}>CHF</span>
          </div>
          <p style={helperStyle}>
            Montant facturé annuellement à chaque membre actif du cercle.
          </p>
        </div>

        <div>
          <label style={stdLabel}>N° de compte</label>
          <input
            type="text"
            style={stdInput}
            value={config.confrerie_compte || ''}
            onChange={(e) => updateConfig('confrerie_compte', e.target.value)}
            placeholder="3210"
            disabled={!canEdit}
          />
          <p style={helperStyle}>
            Compte comptable utilisé pour les cotisations de la confrérie dans la Situation financière.
          </p>
        </div>
      </div>
    </div>
  )
}
