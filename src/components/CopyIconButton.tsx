import { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyIconButtonProps {
  value: string;
  label: string;
  size?: number;
}

export default function CopyIconButton({ value, label, size = 14 }: CopyIconButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!value) return;
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Copier ${label}`}
      title={`Copier ${label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', padding: 4,
        cursor: value ? 'pointer' : 'not-allowed',
        color: copied ? 'var(--success)' : 'var(--text-muted)',
        opacity: value ? 1 : 0.4,
        transition: 'color 0.15s',
      }}
      onMouseEnter={(e) => { if (!copied && value) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
      onMouseLeave={(e) => { if (!copied) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}
