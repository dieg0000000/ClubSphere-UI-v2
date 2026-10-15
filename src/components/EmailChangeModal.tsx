import { useState } from 'react';
import { X } from 'lucide-react';
import Button from './ui/Button';
import { Alert } from './ui/Alert';

interface EmailChangeModalProps {
  isOpen: boolean;
  currentEmail: string;
  onConfirm: (newEmail: string) => Promise<void>;
  onCancel: () => void;
}

export function EmailChangeModal({ isOpen, currentEmail, onConfirm, onCancel }: EmailChangeModalProps) {
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!newEmail.trim() || newEmail === currentEmail) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(newEmail.trim());
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setNewEmail('');
    setError(null);
    onCancel();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl w-full max-w-md shadow-2xl" style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-modal-header)' }}>Modifier l'adresse email</h2>
          <button onClick={handleClose} disabled={loading} className="hover:opacity-80 transition-opacity disabled:opacity-50" style={{ color: 'var(--text-modal-header)' }} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <Alert variant="warning">
            Attention&nbsp;: modifier l'email changera les identifiants de connexion. L'utilisateur devra se reconnecter avec le nouvel email.
          </Alert>

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Email actuel</label>
            <div className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              {currentEmail}
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Nouvel email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="nouveau@email.com"
              className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--danger-text)]">{error}</p>
          )}
        </div>

        <div className="flex justify-end p-6 pt-0" style={{ gap: '12px' }}>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={loading || !newEmail.trim() || newEmail === currentEmail}
          >
            {loading ? 'Modification...' : 'Confirmer la modification'}
          </Button>
        </div>
      </div>
    </div>
  );
}
