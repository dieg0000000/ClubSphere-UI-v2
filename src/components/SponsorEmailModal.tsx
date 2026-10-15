import { useState } from 'react';
import { StandardModal } from './StandardModal';
import Button from './ui/Button';

interface SponsorEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientEmail: string;
  defaultSubject: string;
  defaultMessage: string;
  onSend: (subject: string, message: string) => Promise<void>;
}

export function SponsorEmailModal({
  isOpen,
  onClose,
  recipientEmail,
  defaultSubject,
  defaultMessage,
  onSend
}: SponsorEmailModalProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend(subject, message);
      onClose();
    } finally {
      setSending(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    boxSizing: 'border-box'
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="Email au sponsor"
      width="560px"
    >
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '6px' }}>
          Destinataire
        </label>
        <div style={{
          ...inputStyle,
          background: 'var(--bg-hover)',
          color: 'var(--text-secondary)',
          cursor: 'default'
        }}>
          {recipientEmail}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '6px' }}>
          Objet
        </label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '6px' }}>
          Message
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={10}
          style={{
            ...inputStyle,
            minHeight: '200px',
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: '1.5'
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={sending}
          style={{ flex: 1 }}
        >
          Annuler
        </Button>
        <Button
          variant="primary"
          onClick={handleSend}
          loading={sending}
          disabled={sending || !subject.trim()}
          style={{ flex: 2 }}
        >
          Envoyer
        </Button>
      </div>
    </StandardModal>
  );
}
