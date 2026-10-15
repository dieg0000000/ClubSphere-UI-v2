interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const sizes = {
  sm: { track: { width: 36, height: 20 }, thumb: { size: 14, offset: 3, translate: 16 } },
  md: { track: { width: 46, height: 26 }, thumb: { size: 20, offset: 3, translate: 20 } },
};

export function Toggle({ checked, onChange, disabled = false, size = 'md' }: ToggleProps) {
  const s = sizes[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      style={{
        position: 'relative',
        width: s.track.width,
        height: s.track.height,
        borderRadius: 999,
        background: checked ? 'var(--success)' : 'var(--border-color)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: s.thumb.offset,
          left: checked ? s.thumb.translate + s.thumb.offset : s.thumb.offset,
          width: s.thumb.size,
          height: s.thumb.size,
          borderRadius: '50%',
          background: 'var(--text-inverse)',
          transition: 'left 0.2s',
          boxShadow: 'var(--shadow-sm)',
        }}
      />
    </button>
  );
}
