import { useState, useEffect } from 'react'
import { Save, RotateCcw, Palette } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'
import { defaultClubTheme } from '../config/theme'
import { useModuleAccess } from '../hooks/useModuleAccess'
import { useTenant } from '../context/TenantContext'
import Button from '../components/ui/Button'
import { Alert } from '../components/ui/Alert'

export function AdminTheme() {
  const { clubId } = useTenant()
  const { theme, updateTheme } = useTheme()
  const { canEdit, loading } = useModuleAccess('theme')
  const [formData, setFormData] = useState({
    name: theme.name,
    primary_color: theme.primaryColor,
    primary_dark: theme.primaryDark,
    accent_color: theme.accentColor,
    logo_url: theme.logoUrl
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { document.title = 'Thème - ClubSphere' }, [])

  useEffect(() => {
    setFormData({
      name: theme.name,
      primary_color: theme.primaryColor,
      primary_dark: theme.primaryDark,
      accent_color: theme.accentColor,
      logo_url: theme.logoUrl
    })
  }, [theme])

  function handleInputChange(field: string, value: string) {
    if (!canEdit) return
    setFormData(prev => ({ ...prev, [field]: value }))

    updateTheme({
      name: field === 'name' ? value : theme.name,
      primaryColor: field === 'primary_color' ? value : formData.primary_color,
      primaryDark: field === 'primary_dark' ? value : formData.primary_dark,
      accentColor: field === 'accent_color' ? value : formData.accent_color,
      logoUrl: field === 'logo_url' ? value : formData.logo_url
    })
  }

  async function handleSave() {
    if (!clubId) { setMessage('Club non identifié.'); return }
    setSaving(true)
    setMessage('')

    try {
      const { error } = await supabase
        .from('club_settings')
        .upsert(
          { ...formData, club_id: clubId, updated_at: new Date().toISOString() },
          { onConflict: 'club_id' }
        )

      if (error) throw error

      setMessage('Paramètres sauvegardés avec succès !')
      setTimeout(() => setMessage(''), 3000)
    } catch (error: any) {
      console.error('Error saving theme:', error)
      setMessage(`Erreur: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setFormData({
      name: defaultClubTheme.name,
      primary_color: defaultClubTheme.primaryColor,
      primary_dark: defaultClubTheme.primaryDark,
      accent_color: defaultClubTheme.accentColor,
      logo_url: defaultClubTheme.logoUrl
    })
    updateTheme(defaultClubTheme)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Palette className="w-5 h-5" />
            Thème
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Couleurs et apparence</p>
        </div>
      </div>

      {!loading && !canEdit && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', color: 'var(--warning-text)' }}>
          Vous n'avez pas les droits pour modifier le thème
        </div>
      )}

      <div className="rounded-xl p-6 space-y-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Nom du club
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            disabled={!canEdit}
            className="w-full rounded-lg px-4 py-2 focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            onFocus={(e) => {
              if (!canEdit) return
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)'
              e.currentTarget.style.boxShadow = 'none'
            }}
            placeholder="Ex: FC ClubSphere"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Couleur principale
            </label>
            <div className="flex gap-3">
              <input
                type="color"
                value={formData.primary_color}
                onChange={(e) => handleInputChange('primary_color', e.target.value)}
                disabled={!canEdit}
                className="w-20 h-10 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', cursor: canEdit ? 'pointer' : 'not-allowed' }}
              />
              <input
                type="text"
                value={formData.primary_color}
                onChange={(e) => handleInputChange('primary_color', e.target.value)}
                disabled={!canEdit}
                className="flex-1 rounded-lg px-4 py-2 font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                placeholder="#CC0000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Couleur principale (foncée)
            </label>
            <div className="flex gap-3">
              <input
                type="color"
                value={formData.primary_dark}
                onChange={(e) => handleInputChange('primary_dark', e.target.value)}
                disabled={!canEdit}
                className="w-20 h-10 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', cursor: canEdit ? 'pointer' : 'not-allowed' }}
              />
              <input
                type="text"
                value={formData.primary_dark}
                onChange={(e) => handleInputChange('primary_dark', e.target.value)}
                disabled={!canEdit}
                className="flex-1 rounded-lg px-4 py-2 font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                placeholder="#990000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Couleur d'accent
            </label>
            <div className="flex gap-3">
              <input
                type="color"
                value={formData.accent_color}
                onChange={(e) => handleInputChange('accent_color', e.target.value)}
                disabled={!canEdit}
                className="w-20 h-10 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', cursor: canEdit ? 'pointer' : 'not-allowed' }}
              />
              <input
                type="text"
                value={formData.accent_color}
                onChange={(e) => handleInputChange('accent_color', e.target.value)}
                disabled={!canEdit}
                className="flex-1 rounded-lg px-4 py-2 font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                placeholder="#FFFFFF"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              URL du logo (optionnel)
            </label>
            <input
              type="url"
              value={formData.logo_url}
              onChange={(e) => handleInputChange('logo_url', e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-lg px-4 py-2 focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              onFocus={(e) => {
                if (!canEdit) return
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              placeholder="https://example.com/logo.png"
            />
          </div>
        </div>

        {formData.logo_url && (
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Aperçu du logo
            </label>
            <div className="rounded-lg p-4 flex items-center justify-center" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
              <img
                src={formData.logo_url}
                alt="Logo preview"
                className="max-h-24 max-w-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.parentElement!.innerHTML += '<p style="color:var(--danger-text);font-size:0.875rem">Impossible de charger l\'image</p>'
                }}
              />
            </div>
          </div>
        )}

        <div className="rounded-lg p-6" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Aperçu en direct</h3>
          <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
            Ces couleurs habillent notamment les emails envoyés à vos membres
          </p>

          <div className="rounded-lg overflow-hidden shadow-lg mb-6" style={{ border: '1px solid var(--border-color)', maxWidth: 420 }}>
            <div style={{ background: `linear-gradient(135deg, ${formData.primary_color}, ${formData.primary_dark})`, padding: '24px 20px' }}>
              <div className="flex items-center gap-3">
                {formData.logo_url && (
                  <img src={formData.logo_url} alt="" className="w-10 h-10 rounded object-contain" style={{ background: 'rgba(255,255,255,0.15)' }} />
                )}
                <span className="font-bold text-base" style={{ color: formData.accent_color }}>
                  {formData.name || 'Mon Club'}
                </span>
              </div>
            </div>
            <div style={{ background: '#ffffff', padding: '24px 20px' }}>
              <p style={{ color: '#1f2937', fontSize: 14, marginBottom: 8 }}>
                Bonjour <strong>Jean Dupont</strong>,
              </p>
              <p style={{ color: '#4b5563', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                Vous avez une nouvelle notification de votre club. Cliquez ci-dessous pour consulter les détails.
              </p>
              <a
                href="#"
                onClick={e => e.preventDefault()}
                style={{
                  display: 'inline-block',
                  backgroundColor: formData.primary_color,
                  color: formData.accent_color,
                  padding: '10px 24px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                Voir les détails
              </a>
            </div>
            <div style={{ background: formData.primary_dark, padding: '14px 20px' }}>
              <p style={{ color: formData.accent_color, fontSize: 11, opacity: 0.85 }}>
                © {new Date().getFullYear()} {formData.name || 'Mon Club'} — Envoyé via ClubSphere
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Éléments UI</p>
            <div className="flex flex-wrap gap-3">
              <button
                className="px-4 py-2 rounded-lg font-medium"
                style={{ backgroundColor: formData.primary_color, color: formData.accent_color }}
              >
                Bouton principal
              </button>
              <div
                className="px-4 py-2 rounded-lg font-medium border-2"
                style={{ color: formData.primary_color, borderColor: formData.primary_color }}
              >
                Bordure
              </div>
              <div
                className="px-3 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: formData.primary_color, color: formData.accent_color }}
              >
                Badge
              </div>
            </div>
          </div>
        </div>

        {message && (
          <Alert variant={message.includes('Erreur') ? 'danger' : 'success'}>{message}</Alert>
        )}

        <div className="flex gap-3">
          {!loading && canEdit && (
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              leftIcon={<Save className="w-5 h-5" />}
            >
              {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
            </Button>
          )}

          {!loading && canEdit && (
            <Button
              variant="secondary"
              onClick={handleReset}
              leftIcon={<RotateCcw className="w-5 h-5" />}
            >
              Réinitialiser
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
