import { Search, X } from 'lucide-react';
import { useRef, type InputHTMLAttributes } from 'react';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  inputSize?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: { iconSize: 16, clearSize: 14, iconLeft: 10, padLeft: 32, padRight: 30, pyClass: 'py-1.5', textClass: 'text-sm' },
  md: { iconSize: 18, clearSize: 16, iconLeft: 12, padLeft: 38, padRight: 34, pyClass: 'py-2', textClass: 'text-sm' },
  lg: { iconSize: 20, clearSize: 18, iconLeft: 12, padLeft: 40, padRight: 38, pyClass: 'py-3', textClass: 'text-base' },
};

export default function SearchInput({
  value,
  onChange,
  onClear,
  inputSize = 'md',
  className = '',
  style,
  autoFocus,
  ...rest
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cfg = sizeConfig[inputSize];

  const handleClear = () => {
    onChange('');
    onClear?.();
    inputRef.current?.focus();
  };

  return (
    <div style={{ position: 'relative' }}>
      <Search
        size={cfg.iconSize}
        style={{
          position: 'absolute',
          left: cfg.iconLeft,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className={`w-full ${cfg.pyClass} ${cfg.textClass} rounded-lg focus:outline-none placeholder:text-[var(--text-muted)] ${className}`}
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          paddingLeft: cfg.padLeft,
          paddingRight: value ? cfg.padRight : 16,
          ...style,
        }}
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            padding: 2,
            borderRadius: 9999,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          aria-label="Effacer la recherche"
        >
          <X size={cfg.clearSize} />
        </button>
      )}
    </div>
  );
}
