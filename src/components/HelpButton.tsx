import { useState, type ReactNode } from 'react';
import { HelpModal } from './HelpModal';

interface HelpButtonProps {
  title: string;
  content: ReactNode;
}

export function HelpButton({ title, content }: HelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Aide"
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          border: 'none',
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent)';
          e.currentTarget.style.color = 'var(--text-inverse)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--accent-soft)';
          e.currentTarget.style.color = 'var(--accent)';
        }}
      >
        ?
      </button>
      <HelpModal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title}>
        {content}
      </HelpModal>
    </>
  );
}
