import { type CSSProperties, type ReactNode } from 'react';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusPill } from '../components/ui/StatusPill';
import { Alert } from '../components/ui/Alert';
import MatchStatusPill from '../components/MatchStatusPill';
import {
  type TokenGroup,
  type TextBgPair,
  useTokenEditor,
  TokenEditorRow,
  hexToRgb,
  contrastRatio,
  wcagLevel,
  suggestCompliantColor,
} from '../components/styleguide/TokenColorEditor';

/* ─── Static data ─── */

const TOKEN_GROUPS: TokenGroup[] = [
  {
    title: 'Surfaces',
    tokens: [
      { token: '--bg-app', label: 'bg-app' },
      { token: '--bg-sidebar', label: 'bg-sidebar' },
      { token: '--bg-card', label: 'bg-card' },
      { token: '--bg-card-hover', label: 'bg-card-hover' },
      { token: '--bg-hover', label: 'bg-hover' },
      { token: '--bg-input', label: 'bg-input' },
      { token: '--bg-modal', label: 'bg-modal' },
      { token: '--bg-table-header', label: 'bg-table-header' },
      { token: '--bg-row-alt', label: 'bg-row-alt' },
    ],
  },
  {
    title: 'Texte',
    tokens: [
      { token: '--text-primary', label: 'text-primary' },
      { token: '--text-secondary', label: 'text-secondary' },
      { token: '--text-muted', label: 'text-muted' },
      { token: '--text-inverse', label: 'text-inverse' },
      { token: '--text-table-header', label: 'text-table-header' },
    ],
  },
  {
    title: 'Bordures',
    tokens: [
      { token: '--border-color', label: 'border-color' },
      { token: '--border-strong', label: 'border-strong' },
    ],
  },
  {
    title: 'Accent (club)',
    tokens: [
      { token: '--accent', label: 'accent' },
      { token: '--accent-hover', label: 'accent-hover' },
      { token: '--accent-soft', label: 'accent-soft' },
      { token: '--accent-text', label: 'accent-text' },
    ],
  },
  {
    title: 'Succès',
    tokens: [
      { token: '--success', label: 'success' },
      { token: '--success-soft', label: 'success-soft' },
      { token: '--success-text', label: 'success-text' },
    ],
  },
  {
    title: 'Avertissement',
    tokens: [
      { token: '--warning', label: 'warning' },
      { token: '--warning-soft', label: 'warning-soft' },
      { token: '--warning-text', label: 'warning-text' },
    ],
  },
  {
    title: 'Info',
    tokens: [
      { token: '--info', label: 'info' },
      { token: '--info-soft', label: 'info-soft' },
      { token: '--info-text', label: 'info-text' },
    ],
  },
  {
    title: 'Danger',
    tokens: [
      { token: '--danger', label: 'danger' },
      { token: '--danger-soft', label: 'danger-soft' },
      { token: '--danger-text', label: 'danger-text' },
    ],
  },
  {
    title: 'Couleurs additionnelles',
    tokens: [
      { token: '--purple-soft', label: 'purple-soft' },
      { token: '--purple-text', label: 'purple-text' },
      { token: '--orange-soft', label: 'orange-soft' },
      { token: '--orange-text', label: 'orange-text' },
      { token: '--sky-soft', label: 'sky-soft' },
      { token: '--sky-text', label: 'sky-text' },
      { token: '--pink-soft', label: 'pink-soft' },
      { token: '--pink-text', label: 'pink-text' },
    ],
  },
  {
    title: 'Scrollbars',
    tokens: [
      { token: '--scrollbar-thumb', label: 'scrollbar-thumb' },
      { token: '--scrollbar-thumb-hover', label: 'scrollbar-thumb-hover' },
      { token: '--scrollbar-track', label: 'scrollbar-track' },
    ],
  },
];

const TEXT_BG_PAIRS: TextBgPair[] = [
  { fg: '--text-primary', bg: '--bg-app', context: 'Texte principal / fond page' },
  { fg: '--text-primary', bg: '--bg-card', context: 'Texte principal / carte' },
  { fg: '--text-secondary', bg: '--bg-app', context: 'Texte secondaire / fond page' },
  { fg: '--text-secondary', bg: '--bg-card', context: 'Texte secondaire / carte' },
  { fg: '--text-muted', bg: '--bg-app', context: 'Texte discret / fond page' },
  { fg: '--text-muted', bg: '--bg-card', context: 'Texte discret / carte' },
  { fg: '--text-inverse', bg: '--accent', context: 'Texte inverse / accent' },
  { fg: '--text-table-header', bg: '--bg-table-header', context: 'En-tête tableau' },
  { fg: '--accent-text', bg: '--accent-soft', context: 'Badge accent' },
  { fg: '--success-text', bg: '--success-soft', context: 'Badge succès' },
  { fg: '--warning-text', bg: '--warning-soft', context: 'Badge avertissement' },
  { fg: '--danger-text', bg: '--danger-soft', context: 'Badge danger' },
  { fg: '--info-text', bg: '--info-soft', context: 'Badge info' },
  { fg: '--purple-text', bg: '--purple-soft', context: 'Badge violet' },
  { fg: '--orange-text', bg: '--orange-soft', context: 'Badge orange' },
  { fg: '--sky-text', bg: '--sky-soft', context: 'Badge sky' },
  { fg: '--pink-text', bg: '--pink-soft', context: 'Badge pink' },
  { fg: '--text-secondary', bg: '--bg-hover', context: 'Texte secondaire / hover' },
];

/* ─── Small UI helpers ─── */

function ContrastChip({ ratio }: { ratio: number }) {
  const { label, pass } = wcagLevel(ratio);
  const isAA = ratio >= 4.5;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
      background: !pass ? '#FEE2E2' : isAA ? '#D1FAE5' : '#FEF9C3',
      color: !pass ? '#B91C1C' : isAA ? '#047857' : '#A16207',
    }}>
      {ratio.toFixed(1)}:1 — {label}
    </span>
  );
}

function DualTheme({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
      <div style={{ padding: '24px', borderRadius: '12px 0 0 12px', border: '1px solid #E2E8F0' }} className="styleguide-light-pane">
        {label && <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px', color: '#94A3B8' }}>Clair</div>}
        {children}
      </div>
      <div style={{ padding: '24px', borderRadius: '0 12px 12px 0', border: '1px solid #1E293B', borderLeft: 'none' }} className="styleguide-dark-pane">
        {label && <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px', color: '#7C8AA5' }}>Sombre</div>}
        {children}
      </div>
    </div>
  );
}

function CopyToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: '#0F172A', color: '#F1F5F9', padding: '12px 20px',
      borderRadius: '10px', fontSize: '13px', fontWeight: 600,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      animation: 'fade-in 0.2s ease',
    }}>
      Valeurs copiées dans le presse-papiers
    </div>
  );
}

/* ─── Main page ─── */

export default function Styleguide2() {
  const editor = useTokenEditor(TOKEN_GROUPS);
  const pairs = editor.computePairs(TEXT_BG_PAIRS);
  const failures = pairs.filter(p => !p.pass);

  const sectionTitle: CSSProperties = {
    fontSize: '20px', fontWeight: 700, color: '#0F172A',
    marginBottom: '8px', marginTop: '48px',
  };
  const groupTitle: CSSProperties = {
    fontSize: '13px', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#64748B', marginBottom: '12px', marginTop: '24px',
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
            Guide des styles — Audit couleurs
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B' }}>
            Jetons de couleur, composants et vérification des contrastes WCAG — éditeur en direct
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          {editor.hasAnyModification && (
            <>
              <button onClick={editor.resetAll} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#64748B', cursor: 'pointer',
              }}>
                Tout réinitialiser
              </button>
              <button onClick={editor.copyModified} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: 'none', background: '#3B82F6', color: '#FFFFFF', cursor: 'pointer',
              }}>
                Copier les nouvelles valeurs
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── SECTION 0: Contrast failures summary ── */}
      <div style={{
        background: failures.length > 0 ? '#FEF2F2' : '#F0FDF4',
        border: `1px solid ${failures.length > 0 ? '#FECACA' : '#BBF7D0'}`,
        borderRadius: '12px', padding: '20px 24px', marginBottom: '40px',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: failures.length > 0 ? '#991B1B' : '#166534', marginBottom: '12px' }}>
          {failures.length === 0 ? 'Tous les contrastes sont suffisants' : `Contrastes insuffisants (${failures.length})`}
        </h2>
        {failures.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {failures.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#7F1D1D', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, minWidth: '60px' }}>{f.theme}</span>
                <span>{f.context}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{f.fg} sur {f.bg}</span>
                <ContrastChip ratio={f.ratio} />
                <button
                  onClick={() => editor.suggestFix(f.fg, f.bg, f.theme === 'Clair' ? 'light' : 'dark')}
                  style={{
                    fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px',
                    border: '1px solid #FECACA', background: '#FFF', color: '#B91C1C', cursor: 'pointer',
                  }}
                >
                  Proposer une couleur conforme
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 1: Token swatches with editors ── */}
      <h2 style={sectionTitle}>1. Jetons de couleur</h2>
      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px' }}>
        Toutes les propriétés CSS personnalisées. Cliquez sur un échantillon ou entrez un code hex pour modifier en direct.
      </p>

      {TOKEN_GROUPS.map(group => (
        <div key={group.title}>
          <h3 style={groupTitle}>{group.title}</h3>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
            gap: '10px', marginBottom: '16px',
          }}>
            {group.tokens.map(t => {
              const lightVal = editor.values[t.token]?.light || '#000000';
              const darkVal = editor.values[t.token]?.dark || '#000000';
              const lightMod = editor.isModified(t.token, 'light');
              const darkMod = editor.isModified(t.token, 'dark');
              return (
                <div key={t.token} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid #E2E8F0', background: '#FFFFFF',
                }}>
                  {/* Light swatch */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '6px',
                      border: '1px solid #CBD5E1', background: lightVal,
                    }} />
                    <span style={{ fontSize: '9px', color: '#94A3B8' }}>L</span>
                  </div>
                  {/* Dark swatch */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '6px',
                      border: '1px solid #334155', background: darkVal,
                    }} />
                    <span style={{ fontSize: '9px', color: '#94A3B8' }}>D</span>
                  </div>
                  {/* Label & editors */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', fontFamily: 'monospace', marginBottom: '4px' }}>
                      {t.label}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <TokenEditorRow
                        token={t.token} theme="light" value={lightVal}
                        modified={lightMod}
                        onChange={hex => editor.setValue(t.token, 'light', hex)}
                        onReset={() => editor.resetToken(t.token, 'light')}
                      />
                      <TokenEditorRow
                        token={t.token} theme="dark" value={darkVal}
                        modified={darkMod}
                        onChange={hex => editor.setValue(t.token, 'dark', hex)}
                        onReset={() => editor.resetToken(t.token, 'dark')}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── SECTION 2: Contrast table ── */}
      <h2 style={sectionTitle}>2. Contrastes texte/fond</h2>
      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px' }}>
        Chaque paire texte-sur-fond dans les deux thèmes, recalculée en temps réel.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
              {['Contexte', 'Thème', 'Aperçu', 'Texte', 'Fond', 'Contraste', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#64748B', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{p.context}</td>
                <td style={{ padding: '8px 12px' }}>{p.theme}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    display: 'inline-block', padding: '4px 12px', borderRadius: '6px',
                    background: p.bgHex, color: p.fgHex, fontWeight: 600, fontSize: '12px',
                    border: '1px solid #E2E8F0',
                  }}>
                    Exemple Aa
                  </span>
                </td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', userSelect: 'all' }}>{p.fgHex}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', userSelect: 'all' }}>{p.bgHex}</td>
                <td style={{ padding: '8px 12px' }}><ContrastChip ratio={p.ratio} /></td>
                <td style={{ padding: '8px 12px' }}>
                  {!p.pass && (
                    <button
                      onClick={() => editor.suggestFix(p.fg, p.bg, p.theme === 'Clair' ? 'light' : 'dark')}
                      style={{
                        fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px',
                        border: '1px solid #FECACA', background: '#FFF', color: '#B91C1C',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      Proposer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── SECTION 3: Real components ── */}
      <h2 style={sectionTitle}>3. Composants réels</h2>
      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px' }}>
        Composants importés de l'application, rendus dans les deux thèmes avec les couleurs éditées.
      </p>

      <h3 style={groupTitle}>Boutons</h3>
      <DualTheme label="Boutons">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <Button variant="primary">Primaire</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="destructive">Destructif</Button>
          <Button variant="warning">Avertissement</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <Button variant="primary" disabled>Primaire (off)</Button>
          <Button variant="secondary" disabled>Secondaire (off)</Button>
          <Button variant="destructive" disabled>Destructif (off)</Button>
        </div>
      </DualTheme>

      <h3 style={groupTitle}>Badges</h3>
      <DualTheme label="Badges">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {(['blue', 'green', 'orange', 'yellow', 'red', 'neutral', 'violet', 'sky', 'pink'] as const).map(v => (
            <Badge key={v} variant={v}>{v}</Badge>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Badge variant="red">Admin</Badge>
          <Badge variant="violet">Comité</Badge>
          <Badge variant="blue">Entraîneur</Badge>
          <Badge variant="green">Parent</Badge>
          <Badge variant="sky">Membre</Badge>
          <Badge variant="orange">Supporter</Badge>
        </div>
      </DualTheme>

      <h3 style={groupTitle}>Status Pills</h3>
      <DualTheme label="StatusPill">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {(['blue', 'green', 'orange', 'yellow', 'red', 'neutral', 'violet', 'sky'] as const).map(v => (
            <StatusPill key={v} variant={v}>{v}</StatusPill>
          ))}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Factures</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <StatusPill variant="neutral">Brouillon</StatusPill>
          <StatusPill variant="blue">Envoyée</StatusPill>
          <StatusPill variant="yellow">Partielle</StatusPill>
          <StatusPill variant="red">En retard</StatusPill>
          <StatusPill variant="green">Payée</StatusPill>
          <StatusPill variant="neutral">Annulée</StatusPill>
        </div>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Comptes</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <StatusPill variant="green">Actif</StatusPill>
          <StatusPill variant="neutral">Archivé</StatusPill>
        </div>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Matchs</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <StatusPill variant="blue">Planifié</StatusPill>
          <StatusPill variant="orange">À confirmer</StatusPill>
          <StatusPill variant="red">Annulé</StatusPill>
          <StatusPill variant="yellow">Reporté</StatusPill>
        </div>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Séances</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <StatusPill variant="orange">Brouillon</StatusPill>
          <StatusPill variant="green">Finalisé</StatusPill>
          <StatusPill variant="blue">Approuvé</StatusPill>
        </div>
      </DualTheme>

      <h3 style={groupTitle}>Match Status Pills</h3>
      <DualTheme label="MatchStatusPill">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <MatchStatusPill variant="confirmed" />
          <MatchStatusPill variant="absent" />
          <MatchStatusPill variant="not_convoked" />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <MatchStatusPill variant="absent" label="Décliné" />
        </div>
      </DualTheme>

      <h3 style={groupTitle}>Présences entraînement</h3>
      <DualTheme label="Présence">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
            background: 'var(--success-soft)', color: 'var(--success-text)',
          }}>Présent</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
            background: 'var(--danger-soft)', color: 'var(--danger-text)',
          }}>Absent</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
            background: 'var(--bg-hover)', color: 'var(--text-muted)',
          }}>Sans réponse</span>
        </div>
      </DualTheme>

      <h3 style={groupTitle}>Alertes / Bannières</h3>
      <DualTheme label="Alert">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Alert variant="success" title="Succès">Opération réalisée avec succès.</Alert>
          <Alert variant="warning" title="Attention">Brouillon non envoyé.</Alert>
          <Alert variant="danger" title="Erreur">Échec de la suppression.</Alert>
          <Alert variant="info" title="Information">Ce module est en mode test.</Alert>
        </div>
      </DualTheme>

      <h3 style={groupTitle}>Bannières spéciales</h3>
      <DualTheme label="Bannières">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{
            background: 'var(--warning-soft)', border: '1px solid var(--warning)',
            color: 'var(--warning-text)', padding: '10px 16px', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600,
          }}>MODE ESSAI — Données de test</div>
          <div style={{
            background: 'var(--danger-soft)', border: '1px solid var(--danger)',
            color: 'var(--danger-text)', padding: '10px 16px', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600,
          }}>ERREUR — Connexion impossible</div>
          <div style={{
            background: 'var(--info-soft)', border: '1px solid var(--info)',
            color: 'var(--info-text)', padding: '10px 16px', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600,
          }}>TEST — Environnement de développement</div>
        </div>
      </DualTheme>

      <h3 style={groupTitle}>Champs de formulaire</h3>
      <DualTheme label="Inputs">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '320px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Nom</label>
            <input type="text" defaultValue="Laurent Müller" readOnly style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-color)', background: 'var(--bg-input)',
              color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
            }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Email</label>
            <input type="email" placeholder="email@exemple.ch" readOnly style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-color)', background: 'var(--bg-input)',
              color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
            }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Champ désactivé</label>
            <input type="text" defaultValue="Non modifiable" disabled readOnly style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px',
              border: '1px solid var(--border-color)', background: 'var(--bg-hover)',
              color: 'var(--text-muted)', fontSize: '14px', outline: 'none', opacity: 0.7,
            }} />
          </div>
        </div>
      </DualTheme>

      <h3 style={groupTitle}>Ligne de tableau</h3>
      <DualTheme label="Table">
        <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-table-header)' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-table-header)', fontWeight: 600 }}>Joueur</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-table-header)', fontWeight: 600 }}>Équipe</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-table-header)', fontWeight: 600 }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'var(--bg-card)' }}>
                <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 500 }}>Lucas Martin</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>M15 A</td>
                <td style={{ padding: '10px 14px' }}><StatusPill variant="green">Actif</StatusPill></td>
              </tr>
              <tr style={{ background: 'var(--bg-row-alt)' }}>
                <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 500 }}>Emma Weber</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>F17</td>
                <td style={{ padding: '10px 14px' }}><StatusPill variant="neutral">Archivé</StatusPill></td>
              </tr>
            </tbody>
          </table>
        </div>
      </DualTheme>

      {/* Dynamic style block from editor values */}
      <style>{editor.generateStyleBlock()}</style>

      <CopyToast visible={editor.toastVisible} />
    </div>
  );
}
