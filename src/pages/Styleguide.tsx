import { useState, type CSSProperties } from 'react';
import { Plus, Moon, Sun } from 'lucide-react';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusPill } from '../components/ui/StatusPill';
import { Alert } from '../components/ui/Alert';
import { StandardModal } from '../components/StandardModal';
import { Tabs } from '../components/ui/Tabs';

type Variant = 'blue' | 'green' | 'orange' | 'yellow' | 'red' | 'neutral' | 'violet' | 'sky' | 'pink';

const VARIANTS = ['primary', 'secondary', 'destructive', 'warning', 'ghost'] as const;

const BADGE_COLORS: Variant[] = [
  'blue', 'green', 'orange', 'yellow', 'red', 'neutral', 'violet', 'sky', 'pink',
];

const ROLE_BADGES: { label: string; variant: Variant }[] = [
  { label: 'Admin', variant: 'red' },
  { label: 'Comité', variant: 'violet' },
  { label: 'Entraîneur', variant: 'blue' },
  { label: 'Parent', variant: 'green' },
  { label: 'Membre', variant: 'sky' },
  { label: 'Supporter', variant: 'orange' },
];

const STATUS_GROUPS: { title: string; items: { label: string; variant: Exclude<Variant, 'pink'> }[] }[] = [
  {
    title: 'Comptes',
    items: [
      { label: 'Actif', variant: 'green' },
      { label: 'Inactif', variant: 'neutral' },
    ],
  },
  {
    title: 'Factures',
    items: [
      { label: 'Brouillon', variant: 'neutral' },
      { label: 'Envoyée', variant: 'blue' },
      { label: 'Partielle', variant: 'yellow' },
      { label: 'En retard', variant: 'red' },
      { label: 'Payée', variant: 'green' },
      { label: 'Annulée', variant: 'neutral' },
    ],
  },
  {
    title: 'Matchs',
    items: [
      { label: 'Planifié', variant: 'blue' },
      { label: 'À confirmer', variant: 'orange' },
      { label: 'Annulé', variant: 'red' },
      { label: 'Reporté', variant: 'yellow' },
    ],
  },
  {
    title: 'Séances',
    items: [
      { label: 'Brouillon', variant: 'orange' },
      { label: 'Finalisé', variant: 'green' },
      { label: 'Approuvé', variant: 'blue' },
    ],
  },
];

const sectionTitle = {
  fontSize: '14px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  color: 'var(--text-secondary)',
  marginBottom: '20px',
};

const subLabel = {
  fontSize: '13px',
  color: 'var(--text-muted)',
  marginBottom: '10px',
  fontWeight: 600,
};

export default function Styleguide() {
  const [dark, setDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [sectionTab, setSectionTab] = useState('profil');
  const [filterTab, setFilterTab] = useState('all');

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
  };

  const noop = () => {};

  // Surcharge LOCALE de l'accent (cyan + texte navy) — aperçu, n'affecte que cette page.
  const accentPreview = {
    background: 'var(--bg-app)',
    color: 'var(--text-primary)',
    minHeight: '100vh',
    '--accent': '#38BDF8',
    '--accent-hover': '#0EA5E9',
    '--accent-ink': '#0B1120',
  } as CSSProperties;

  return (
    <div style={accentPreview}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Design System — Styleguide</h1>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Aperçu accent cyan #38BDF8 (texte navy sur les boutons primary)
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={dark ? <Sun size={16} /> : <Moon size={16} />}
          onClick={toggleTheme}
        >
          {dark ? 'Thème clair' : 'Thème sombre'}
        </Button>
      </div>

      <div style={{ padding: '32px', maxWidth: '980px' }}>
        {/* Boutons */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={sectionTitle}>Boutons</h2>
          {VARIANTS.map((variant) => (
            <div key={variant} style={{ marginBottom: '24px' }}>
              <div style={subLabel}>{variant}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                <Button variant={variant} size="lg">Large</Button>
                <Button variant={variant} size="md">Medium</Button>
                <Button variant={variant} size="sm">Small</Button>
                <Button variant={variant} leftIcon={<Plus size={16} />}>Avec icône</Button>
                <Button variant={variant} loading>Chargement</Button>
                <Button variant={variant} disabled>Désactivé</Button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            « danger » est un alias de « destructive » (rendu identique).
          </div>
        </section>

        {/* Badges */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={sectionTitle}>Badges</h2>
          <div style={subLabel}>Couleurs</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
            {BADGE_COLORS.map((c) => (
              <Badge key={c} variant={c}>{c}</Badge>
            ))}
          </div>
          <div style={subLabel}>Rôles</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            {ROLE_BADGES.map((r) => (
              <Badge key={r.label} variant={r.variant}>{r.label}</Badge>
            ))}
          </div>
        </section>

        {/* StatusPill */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={sectionTitle}>StatusPill (point coloré)</h2>
          {STATUS_GROUPS.map((g) => (
            <div key={g.title} style={{ marginBottom: '20px' }}>
              <div style={subLabel}>{g.title}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                {g.items.map((it) => (
                  <StatusPill key={it.label} variant={it.variant}>{it.label}</StatusPill>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Alerts */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={sectionTitle}>Alerts</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '560px' }}>
            <Alert variant="success" title="Enregistré" onClose={noop}>
              Les modifications ont été sauvegardées avec succès.
            </Alert>
            <Alert variant="info" title="Information" onClose={noop}>
              Un email de confirmation a été envoyé au membre.
            </Alert>
            <Alert variant="warning" title="Attention" onClose={noop}>
              Le diplôme J+S de cet entraîneur expire dans moins de 10 mois.
            </Alert>
            <Alert variant="danger" title="Erreur" onClose={noop}>
              Impossible de supprimer ce compte : des données y sont rattachées.
            </Alert>
            <Alert variant="info">Alerte simple, sans titre ni bouton fermer.</Alert>
          </div>
        </section>

        {/* Onglets */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={sectionTitle}>Onglets</h2>
          <div style={subLabel}>Sections (sans compteur)</div>
          <div style={{ marginBottom: '28px' }}>
            <Tabs
              items={[
                { key: 'profil', label: 'Profil' },
                { key: 'reps', label: 'Représentants légaux' },
                { key: 'club', label: 'Club' },
                { key: 'notes', label: 'Notes' },
                { key: 'factu', label: 'Facturation' },
              ]}
              value={sectionTab}
              onChange={setSectionTab}
            />
          </div>
          <div style={subLabel}>Filtres (avec compteur)</div>
          <Tabs
            items={[
              { key: 'all', label: 'Toutes' },
              { key: 'draft', label: 'Brouillons', count: 45 },
              { key: 'sent', label: 'Envoyées', count: 64 },
              { key: 'overdue', label: 'En retard', count: 0 },
              { key: 'paid', label: 'Payées', count: 1 },
            ]}
            value={filterTab}
            onChange={setFilterTab}
          />
        </section>

        {/* Modal */}
        <section style={{ marginBottom: '48px' }}>
          <h2 style={sectionTitle}>Modal</h2>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>Ouvrir le modal</Button>
          <StandardModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Titre du modal"
            subtitle="Sous-titre optionnel"
          >
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
              Contenu de démonstration. Le corps défile si nécessaire, l'en-tête et le pied
              restent en place.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Annuler</Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>Confirmer</Button>
            </div>
          </StandardModal>
        </section>
      </div>
    </div>
  );
}
