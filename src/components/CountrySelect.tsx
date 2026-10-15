import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { X, ChevronDown } from 'lucide-react';

interface Country {
  code: string;
  name_fr: string;
}

let cachedCountries: Country[] | null = null;

function removeAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function CountrySelect({ value, onChange, placeholder = 'Rechercher un pays…', required, disabled }: CountrySelectProps) {
  const [countries, setCountries] = useState<Country[]>(cachedCountries || []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cachedCountries) return;
    (async () => {
      const { data } = await supabase
        .from('countries')
        .select('code, name_fr')
        .eq('active', true)
        .order('name_fr');
      if (data) {
        cachedCountries = data;
        setCountries(data);
      }
    })();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = query
    ? countries.filter(c => removeAccents(c.name_fr.toLowerCase()).includes(removeAccents(query.toLowerCase())))
    : countries;

  const handleSelect = useCallback((name: string) => {
    onChange(name);
    setOpen(false);
    setQuery('');
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  }, [onChange]);

  const displayValue = open ? query : (value || '');

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className="flex items-center w-full px-3 py-2 rounded-lg cursor-pointer"
        style={{
          background: disabled ? 'var(--bg-sidebar)' : 'var(--bg-input)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          opacity: disabled ? 0.6 : 1,
        }}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          setQuery('');
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: 'var(--text-primary)' }}
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => { if (!disabled) setOpen(true); }}
        />
        {value && !disabled && (
          <button type="button" onClick={handleClear} className="p-0.5 hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        )}
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', marginLeft: 4, flexShrink: 0 }} />
      </div>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg shadow-lg overflow-auto"
          style={{
            maxHeight: 200,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
          }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>Aucun résultat</div>
          ) : (
            filtered.map(c => (
              <div
                key={c.code}
                className="px-3 py-1.5 text-sm cursor-pointer"
                style={{
                  color: c.name_fr === value ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: c.name_fr === value ? 600 : 400,
                  background: 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(c.name_fr);
                }}
              >
                {c.name_fr}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
