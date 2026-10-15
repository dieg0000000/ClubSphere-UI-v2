import { Apple, Smartphone } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { ProfileCard } from '../components/ProfileLayout'
import { isNativeApp } from '../lib/nativeApp'

export function InstallHelp() {
  if (isNativeApp()) return <Navigate to="/" replace />
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
        Installer l'application
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.5 }}>
        Installez l'application sur votre téléphone pour un accès rapide et recevoir les notifications push.
      </p>

      <ProfileCard>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #333 0%, #555 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Apple size={20} color="var(--text-inverse)" />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              iPhone (Safari)
            </h2>
          </div>

          <ol style={{
            margin: 0, paddingLeft: 20,
            fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8,
          }}>
            <li>Ouvrez le site de votre club dans <strong>Safari</strong></li>
            <li>Touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut)</li>
            <li>Sélectionnez <strong>« Sur l'écran d'accueil »</strong></li>
            <li>Touchez <strong>Ajouter</strong></li>
          </ol>

          <div style={{
            marginTop: 16,
            padding: '12px 16px',
            background: 'var(--bg-app)',
            borderRadius: 8,
            border: '1px solid var(--border-color)',
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Important :</strong> Sur iPhone, les notifications
              ne fonctionnent que si l'app est installée sur l'écran d'accueil. Après l'installation,
              ouvrez l'app et activez les notifications.
            </p>
          </div>
        </div>
      </ProfileCard>

      <div style={{ height: 16 }} />

      <ProfileCard>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #1a73e8 0%, #34a853 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Smartphone size={20} color="var(--text-inverse)" />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Android (Chrome)
            </h2>
          </div>

          <ol style={{
            margin: 0, paddingLeft: 20,
            fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8,
          }}>
            <li>Ouvrez le site de votre club dans <strong>Chrome</strong></li>
            <li>Touchez le menu <strong>⋮</strong> (trois points en haut à droite)</li>
            <li>Sélectionnez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong></li>
            <li>Suivez les étapes d'installation</li>
            <li>À l'ouverture de l'app, autorisez les notifications</li>
          </ol>
        </div>
      </ProfileCard>
    </div>
  )
}
