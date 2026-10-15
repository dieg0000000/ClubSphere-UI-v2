import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { FilterButtonGroup } from './FilterButtonGroup';
import ConfirmModal from './ConfirmModal';
import { Alert } from './ui/Alert';
import { useConfirmModal } from '../hooks/useConfirmModal';
import { consentWarningText, parseConsentWarnings, type ConsentWarning } from '../lib/galleries';

type Visibility = 'club' | 'public';

interface GalleryVisibilityControlProps {
  galleryId: string;
  visibility: Visibility;
  hasTeam: boolean;
  onChanged: (visibility: Visibility, warnings: ConsentWarning[]) => void;
  onError: (message: string) => void;
}

export async function fetchConsentWarnings(galleryId: string): Promise<ConsentWarning[] | null> {
  const { data, error } = await supabase.rpc('gallery_consent_warnings', { p_gallery: galleryId });
  if (error) return null;
  return parseConsentWarnings(data);
}

function visibilityErrorMessage(code: string | undefined) {
  if (code === '42501') return 'Réservé au comité (droit Galeries).';
  if (code === 'P0002') return 'Album introuvable dans votre club.';
  return "La visibilité de l'album n'a pas pu être modifiée.";
}

export default function GalleryVisibilityControl({
  galleryId, visibility, hasTeam, onChanged, onError,
}: GalleryVisibilityControlProps) {
  const [busy, setBusy] = useState(false);
  const { confirmState, showConfirm, hideConfirm } = useConfirmModal();

  const apply = async (next: Visibility) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('set_gallery_visibility', { p_gallery: galleryId, p_visibility: next });
    setBusy(false);
    hideConfirm();
    if (error) {
      onError(visibilityErrorMessage(error.code));
      return;
    }
    const result = (data ?? {}) as { visibility?: Visibility; consent_warnings?: unknown };
    onChanged(result.visibility === 'public' || result.visibility === 'club' ? result.visibility : next,
      parseConsentWarnings(result.consent_warnings));
  };

  const handleSelect = async (id: string) => {
    const next = id as Visibility;
    if (next === visibility || busy) return;
    if (next === 'club') {
      apply('club');
      return;
    }
    setBusy(true);
    const warnings = hasTeam ? await fetchConsentWarnings(galleryId) : [];
    setBusy(false);
    if (warnings === null) {
      onError('Impossible de vérifier les consentements photo.');
      return;
    }
    if (hasTeam && warnings.length === 0) {
      apply('public');
      return;
    }
    showConfirm({
      title: "Publier l'album",
      message: hasTeam ? (
        <div style={{ textAlign: 'left' }}>
          <Alert variant="warning" title="Attention">{consentWarningText(warnings)}</Alert>
        </div>
      ) : (
        'En publiant, vous confirmez que les personnes visibles ont accepté la diffusion de ces photos.'
      ),
      confirmLabel: 'Publier quand même',
      cancelLabel: 'Annuler',
      confirmStyle: 'primary',
      onConfirm: () => apply('public'),
    });
  };

  return (
    <>
      <div style={{ opacity: busy ? 0.6 : 1, pointerEvents: busy ? 'none' : undefined }} aria-busy={busy}>
        <FilterButtonGroup
          options={[{ id: 'club', label: 'Club' }, { id: 'public', label: 'Public' }]}
          selectedId={visibility}
          onChange={handleSelect}
        />
      </div>
      <ConfirmModal {...confirmState} loading={busy} onCancel={hideConfirm} />
    </>
  );
}
