import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resizeAndCropImage } from '../../lib/imageProcessing';
import { useConfirmModal } from '../../hooks/useConfirmModal';
import ConfirmModal from '../ConfirmModal';

interface ProfilePhotoUploadProps {
  memberId: string;
  userId: string;
  currentPhotoUrl: string | null;
  onPhotoUpdated: (url: string | null) => void;
  variant?: 'full' | 'badge';
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export default function ProfilePhotoUpload({
  memberId,
  userId,
  currentPhotoUrl,
  onPhotoUpdated,
  variant = 'full',
}: ProfilePhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmState, showConfirm, hideConfirm } = useConfirmModal();

  const triggerFilePicker = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const resetInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Format non supporté. Utilisez JPG, PNG ou WebP.');
      resetInput();
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setError('Fichier trop volumineux (max 5 Mo).');
      resetInput();
      return;
    }

    setUploading(true);

    try {
      const blob = await resizeAndCropImage(file, 200, 0.85);

      const path = `${userId}/photo.webp`;
      const { error: uploadError } = await supabase.storage
        .from('member-photos')
        .upload(path, blob, {
          contentType: 'image/webp',
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('member-photos')
        .getPublicUrl(path);

      const versionedUrl = `${publicData.publicUrl}?v=${Date.now()}`;

      const { data: rpcData, error: rpcError } = await supabase
        .rpc('update_my_profile_photo', { p_photo_url: versionedUrl });

      if (rpcError) throw rpcError;
      if (!rpcData) throw new Error('Mise à jour photo échouée');

      await supabase.from('members').update({ photo_path: path }).eq('id', memberId);

      onPhotoUpdated(versionedUrl);
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      setError(err?.message || "Erreur lors de l'envoi de la photo.");
    } finally {
      setUploading(false);
      resetInput();
    }
  };

  const handleDelete = () => {
    setError(null);
    showConfirm({
      title: 'Supprimer la photo',
      message: 'Supprimer votre photo de profil ?',
      confirmStyle: 'danger',
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        hideConfirm();
        setUploading(true);
        try {
          const path = `${userId}/photo.webp`;
          const { error: removeError } = await supabase.storage
            .from('member-photos')
            .remove([path]);

          if (removeError) throw removeError;

          const { error: rpcError } = await supabase
            .rpc('update_my_profile_photo', { p_photo_url: null });

          if (rpcError) throw rpcError;

          await supabase.from('members').update({ photo_path: null }).eq('id', memberId);

          onPhotoUpdated(null);
        } catch (err: any) {
          console.error('Photo deletion failed:', err);
          setError(err?.message || 'Erreur lors de la suppression.');
        } finally {
          setUploading(false);
        }
      },
    });
  };

  if (variant === 'badge') {
    return (
      <>
        <button
          type="button"
          onClick={triggerFilePicker}
          disabled={uploading}
          aria-label={currentPhotoUrl ? 'Changer la photo' : 'Ajouter une photo'}
          className="absolute bottom-0 right-0 rounded-full flex items-center justify-center transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            width: 30,
            height: 30,
            background: 'var(--accent)',
            border: '2px solid var(--bg-app)',
            color: 'var(--text-inverse)',
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? (
            <span
              className="rounded-full border-2 animate-spin"
              style={{ width: 14, height: 14, borderColor: 'var(--text-inverse)', borderTopColor: 'transparent' }}
              aria-label="Envoi en cours"
            />
          ) : (
            <Camera size={15} />
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {error && (
          <div
            className="absolute left-0 text-xs rounded-md"
            style={{
              top: '100%',
              marginTop: 6,
              width: 200,
              padding: '6px 8px',
              background: 'var(--danger-soft)',
              color: 'var(--danger-text)',
              border: '1px solid var(--danger)',
              zIndex: 10,
            }}
          >
            {error}
          </div>
        )}

        <ConfirmModal {...confirmState} onCancel={hideConfirm} />
      </>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative w-32 h-32 rounded-full overflow-hidden border-2 flex items-center justify-center"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-hover)' }}
      >
        {currentPhotoUrl ? (
          <img
            src={currentPhotoUrl}
            alt="Photo de profil"
            className="w-full h-full object-cover"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-16 h-16"
            style={{ color: 'var(--text-muted)' }}
            aria-hidden="true"
          >
            <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-3.866 0-10 1.934-10 5.5V22h20v-2.5c0-3.566-6.134-5.5-10-5.5z" />
          </svg>
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--text-inverse)', borderTopColor: 'transparent' }}
              aria-label="Envoi en cours"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={triggerFilePicker}
          disabled={uploading}
          className="text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed rounded-lg px-4 py-2" style={{ backgroundColor: 'var(--accent)', color: 'var(--text-inverse)' }}
          onMouseEnter={(e) => {
            if (!uploading) e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
        >
          {currentPhotoUrl ? 'Changer la photo' : 'Ajouter une photo'}
        </button>

        {currentPhotoUrl && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={uploading}
            className="text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed rounded-lg px-4 py-2" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-inverse)' }}
            onMouseEnter={(e) => {
              if (!uploading) e.currentTarget.style.backgroundColor = 'var(--border-strong)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            }}
          >
            Supprimer
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-center" style={{ color: 'var(--danger-text)' }}>{error}</p>
      )}

      <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
        JPG, PNG ou WebP — max 5 Mo
        <br />
        Redimensionnée automatiquement en 200×200
      </p>
      <ConfirmModal {...confirmState} onCancel={hideConfirm} />
    </div>
  );
}
