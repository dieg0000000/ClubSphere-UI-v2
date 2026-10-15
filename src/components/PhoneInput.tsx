import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import {
  getCountries,
  getCountryCallingCode,
  CountryCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';
import {
  TOP_COUNTRIES,
  formatAsYouType,
  isValidPhone,
  normalizePhone,
} from '../utils/phoneHelpers';

interface PhoneInputProps {
  value: string;
  onChange: (e164: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  label?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan', AL: 'Albanie', DZ: 'Algérie', AD: 'Andorre', AO: 'Angola',
  AR: 'Argentine', AM: 'Arménie', AU: 'Australie', AT: 'Autriche', AZ: 'Azerbaïdjan',
  BH: 'Bahreïn', BD: 'Bangladesh', BY: 'Biélorussie', BE: 'Belgique', BZ: 'Belize',
  BJ: 'Bénin', BT: 'Bhoutan', BO: 'Bolivie', BA: 'Bosnie-Herzégovine', BW: 'Botswana',
  BR: 'Brésil', BG: 'Bulgarie', BF: 'Burkina Faso', BI: 'Burundi', KH: 'Cambodge',
  CM: 'Cameroun', CA: 'Canada', CV: 'Cap-Vert', CF: 'République centrafricaine',
  TD: 'Tchad', CL: 'Chili', CN: 'Chine', CO: 'Colombie', KM: 'Comores', CG: 'Congo',
  CD: 'RD Congo', CR: 'Costa Rica', CI: "Côte d'Ivoire", HR: 'Croatie', CU: 'Cuba',
  CY: 'Chypre', CZ: 'Tchéquie', DK: 'Danemark', DJ: 'Djibouti', DM: 'Dominique',
  DO: 'Rép. dominicaine', EC: 'Équateur', EG: 'Égypte', SV: 'Salvador',
  GQ: 'Guinée équatoriale', ER: 'Érythrée', EE: 'Estonie', ET: 'Éthiopie',
  FI: 'Finlande', FR: 'France', GA: 'Gabon', GM: 'Gambie', GE: 'Géorgie',
  DE: 'Allemagne', GH: 'Ghana', GR: 'Grèce', GT: 'Guatemala', GN: 'Guinée',
  GW: 'Guinée-Bissau', GY: 'Guyana', HT: 'Haïti', HN: 'Honduras', HK: 'Hong Kong',
  HU: 'Hongrie', IS: 'Islande', IN: 'Inde', ID: 'Indonésie', IR: 'Iran', IQ: 'Iraq',
  IE: 'Irlande', IL: 'Israël', IT: 'Italie', JM: 'Jamaïque', JP: 'Japon', JO: 'Jordanie',
  KZ: 'Kazakhstan', KE: 'Kenya', KW: 'Koweït', KG: 'Kirghizistan', LA: 'Laos',
  LV: 'Lettonie', LB: 'Liban', LS: 'Lesotho', LR: 'Libéria', LY: 'Libye',
  LI: 'Liechtenstein', LT: 'Lituanie', LU: 'Luxembourg', MO: 'Macao', MG: 'Madagascar',
  MW: 'Malawi', MY: 'Malaisie', MV: 'Maldives', ML: 'Mali', MT: 'Malte', MR: 'Mauritanie',
  MU: 'Maurice', MX: 'Mexique', MD: 'Moldavie', MC: 'Monaco', MN: 'Mongolie',
  ME: 'Monténégro', MA: 'Maroc', MZ: 'Mozambique', MM: 'Myanmar', NA: 'Namibie',
  NP: 'Népal', NL: 'Pays-Bas', NZ: 'Nouvelle-Zélande', NI: 'Nicaragua', NE: 'Niger',
  NG: 'Nigeria', KP: 'Corée du Nord', MK: 'Macédoine du Nord', NO: 'Norvège',
  OM: 'Oman', PK: 'Pakistan', PA: 'Panama', PG: 'Papouasie-Nouvelle-Guinée',
  PY: 'Paraguay', PE: 'Pérou', PH: 'Philippines', PL: 'Pologne', PT: 'Portugal',
  QA: 'Qatar', RO: 'Roumanie', RU: 'Russie', RW: 'Rwanda', SA: 'Arabie saoudite',
  SN: 'Sénégal', RS: 'Serbie', SC: 'Seychelles', SL: 'Sierra Leone', SG: 'Singapour',
  SK: 'Slovaquie', SI: 'Slovénie', SO: 'Somalie', ZA: 'Afrique du Sud', KR: 'Corée du Sud',
  ES: 'Espagne', LK: 'Sri Lanka', SD: 'Soudan', SR: 'Suriname', SE: 'Suède',
  CH: 'Suisse', SY: 'Syrie', TW: 'Taïwan', TJ: 'Tadjikistan', TZ: 'Tanzanie',
  TH: 'Thaïlande', TG: 'Togo', TN: 'Tunisie', TR: 'Turquie', TM: 'Turkménistan',
  UG: 'Ouganda', UA: 'Ukraine', AE: 'Émirats arabes unis', GB: 'Royaume-Uni',
  US: 'États-Unis', UY: 'Uruguay', UZ: 'Ouzbékistan', VE: 'Venezuela', VN: 'Vietnam',
  YE: 'Yémen', ZM: 'Zambie', ZW: 'Zimbabwe',
};

function countryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '';
  const base = 127397;
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => c.charCodeAt(0) + base));
}

function inferCountry(e164: string): CountryCode | null {
  if (!e164) return null;
  const parsed = parsePhoneNumberFromString(e164);
  return (parsed?.country as CountryCode) || null;
}

function stripDialCode(value: string, country: CountryCode): string {
  try {
    const dial = '+' + getCountryCallingCode(country);
    if (value.startsWith(dial)) return value.slice(dial.length).trim();
  } catch {
    // ignore
  }
  return value;
}

export default function PhoneInput({
  value,
  onChange,
  placeholder,
  required,
  error,
  label,
  disabled,
  name,
  id,
}: PhoneInputProps) {
  const [country, setCountry] = useState<CountryCode>(() => inferCountry(value) || 'CH');
  const [localInput, setLocalInput] = useState<string>(() =>
    value ? formatAsYouType(stripDialCode(value, inferCountry(value) || 'CH'), inferCountry(value) || 'CH') : ''
  );
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastEmitRef = useRef<string>(value);

  useEffect(() => {
    if (value === lastEmitRef.current) return;
    const inferred = inferCountry(value);
    if (inferred) {
      setCountry(inferred);
      setLocalInput(formatAsYouType(stripDialCode(value, inferred), inferred));
    } else if (!value) {
      setLocalInput('');
    }
    lastEmitRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAll(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const emit = (raw: string, ctry: CountryCode) => {
    const dial = '+' + getCountryCallingCode(ctry);
    const candidate = raw.trim() ? `${dial} ${raw}` : '';
    const normalized = normalizePhone(candidate, ctry);
    const e164 = normalized ?? '';
    lastEmitRef.current = e164;
    onChange(e164);
  };

  const handleTextChange = (next: string) => {
    const formatted = formatAsYouType(next, country);
    setLocalInput(formatted);
    emit(formatted, country);
  };

  const handleCountryChange = (next: CountryCode) => {
    setCountry(next);
    setOpen(false);
    setShowAll(false);
    setSearch('');
    const formatted = formatAsYouType(localInput, next);
    setLocalInput(formatted);
    emit(formatted, next);
  };

  const allCountries = useMemo(() => {
    const topSet = new Set(TOP_COUNTRIES.map((c) => c.code));
    return getCountries()
      .filter((c) => !topSet.has(c))
      .map((c) => {
        let dial = '';
        try {
          dial = '+' + getCountryCallingCode(c);
        } catch {
          dial = '';
        }
        return { code: c, name: countryName(c), dialCode: dial, flag: flagEmoji(c) };
      })
      .filter((c) => c.dialCode)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, []);

  const filteredAll = useMemo(() => {
    if (!search.trim()) return allCountries;
    const q = search.trim().toLowerCase();
    return allCountries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dialCode.includes(q)
    );
  }, [allCountries, search]);

  const currentDial = useMemo(() => {
    try {
      return '+' + getCountryCallingCode(country);
    } catch {
      return '';
    }
  }, [country]);

  const currentFlag = flagEmoji(country);

  const valid = !value || isValidPhone(value, country);
  const showError = !!error || (!valid && !!value);
  const errorText =
    error || (!valid && value ? 'Numéro invalide pour le pays sélectionné.' : null);

  const borderError = showError ? 'border-[var(--danger)]' : 'border-[var(--border-color)]';

  return (
    <div ref={rootRef} className="relative w-full">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-[var(--text-primary)] mb-2"
        >
          {label}
          {required && <span className="text-[var(--danger)] ml-1">*</span>}
        </label>
      )}
      <div className="flex items-stretch w-full">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-2.5 py-2.5 min-w-[110px] text-sm rounded-l-lg border border-r-0 ${borderError} bg-[var(--bg-input)] text-[var(--text-primary)] ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} select-none`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="text-base leading-none">{currentFlag}</span>
          <span className="font-medium">{currentDial}</span>
          <ChevronDown size={14} className="ml-auto opacity-70" />
        </button>
        <input
          type="tel"
          id={id}
          name={name}
          disabled={disabled}
          value={localInput}
          placeholder={placeholder || '79 123 45 67'}
          onChange={(e) => handleTextChange(e.target.value)}
          className={`flex-1 px-3.5 py-2.5 text-sm rounded-r-lg border border-l-0 ${borderError} bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none`}
        />
      </div>
      {showError && errorText && (
        <p className="text-xs text-[var(--danger-text)] mt-1.5 leading-normal">{errorText}</p>
      )}
      {open && (
        <div
          className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-[280px] max-h-[340px] overflow-y-auto bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-[10px] shadow-lg p-1"
          role="listbox"
        >
          {!showAll ? (
            <>
              {TOP_COUNTRIES.map((c) => (
                <CountryRow
                  key={c.code}
                  flag={c.flag}
                  name={c.name}
                  dial={c.dialCode}
                  selected={c.code === country}
                  onClick={() => handleCountryChange(c.code)}
                />
              ))}
              <div className="h-px bg-[var(--border-color)] my-1" />
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex items-center gap-2 w-full px-2.5 py-2 bg-transparent border-none rounded-md text-[13px] cursor-pointer text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                <span className="opacity-80">Autre pays...</span>
                <ChevronDown size={14} className="ml-auto -rotate-90" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border-color)] mb-1">
                <Search size={14} className="opacity-60" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un pays..."
                  className="flex-1 border-none outline-none bg-transparent text-[var(--text-primary)] text-[13px] p-1 placeholder:text-[var(--text-muted)]"
                />
              </div>
              {filteredAll.length === 0 ? (
                <div className="p-2.5 text-[13px] opacity-70">
                  Aucun pays trouvé.
                </div>
              ) : (
                filteredAll.map((c) => (
                  <CountryRow
                    key={c.code}
                    flag={c.flag}
                    name={c.name}
                    dial={c.dialCode}
                    selected={c.code === country}
                    onClick={() => handleCountryChange(c.code as CountryCode)}
                  />
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CountryRow({
  flag,
  name,
  dial,
  selected,
  onClick,
}: {
  flag: string;
  name: string;
  dial: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2.5 py-2 border-none rounded-md text-[13px] cursor-pointer text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] ${selected ? 'bg-[var(--bg-hover)]' : 'bg-transparent'}`}
    >
      <span className="text-base">{flag}</span>
      <span className="flex-1">{name}</span>
      <span className="opacity-70">{dial}</span>
    </button>
  );
}
