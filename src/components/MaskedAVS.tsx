import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MaskedAVSProps {
  avs: string;
  memberId: string;
  context: string;
}

function maskAvs(avs: string): string {
  const digits = avs.replace(/[^\d]/g, '');
  if (digits.length < 5) return avs;
  const last2 = digits.slice(-2);
  return `756.****.****.${last2}`;
}

export function MaskedAVS({ avs, memberId, context }: MaskedAVSProps) {
  const [revealed, setRevealed] = useState(false);

  const handleReveal = () => {
    if (!revealed) {
      supabase.rpc('log_avs_access', { p_member_id: memberId, p_action: 'AVS_REVEAL', p_context: context }).then(() => {});
    }
    setRevealed(!revealed);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono">{revealed ? avs : maskAvs(avs)}</span>
      <button
        type="button"
        onClick={handleReveal}
        className="inline-flex items-center justify-center rounded p-0.5 hover:bg-[var(--bg-secondary)] transition-colors"
        aria-label={revealed ? 'Masquer le numéro AVS' : 'Afficher le numéro AVS'}
      >
        {revealed ? <EyeOff size={15} style={{ color: 'var(--text-muted)' }} /> : <Eye size={15} style={{ color: 'var(--text-muted)' }} />}
      </button>
    </span>
  );
}
