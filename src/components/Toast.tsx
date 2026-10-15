import type { ToastState } from '../hooks/useToast';

const bgColors: Record<string, string> = {
  success: 'var(--success)',
  error: 'var(--danger)',
  warning: 'var(--warning)',
};

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: '24px', right: '24px',
      background: bgColors[toast.type] ?? bgColors.success,
      color: 'var(--text-inverse)',
      borderRadius: '10px',
      padding: '14px 20px',
      fontWeight: '700',
      fontSize: '14px',
      zIndex: 9999,
      boxShadow: 'var(--shadow-lg)',
      maxWidth: '400px',
      wordBreak: 'break-word',
    }}>
      {toast.message}
    </div>
  );
}
