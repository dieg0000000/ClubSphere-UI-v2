import {
  parsePhoneNumberFromString,
  AsYouType,
  CountryCode,
} from 'libphonenumber-js';

export const TOP_COUNTRIES: { code: CountryCode; name: string; dialCode: string; flag: string }[] = [
  { code: 'CH', name: 'Suisse', dialCode: '+41', flag: '🇨🇭' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'IT', name: 'Italie', dialCode: '+39', flag: '🇮🇹' },
  { code: 'DE', name: 'Allemagne', dialCode: '+49', flag: '🇩🇪' },
  { code: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { code: 'ES', name: 'Espagne', dialCode: '+34', flag: '🇪🇸' },
];

export function formatPhone(value: string, defaultCountry: CountryCode = 'CH'): string {
  if (!value?.trim()) return '';
  const parsed = parsePhoneNumberFromString(value, defaultCountry);
  return parsed?.isValid() ? parsed.formatInternational() : value;
}

export function normalizePhone(
  value: string | null | undefined,
  defaultCountry: CountryCode = 'CH'
): string | null {
  if (!value?.trim()) return null;
  const parsed = parsePhoneNumberFromString(value, defaultCountry);
  return parsed?.isValid() ? parsed.format('E.164') : value.trim();
}

export function isValidPhone(value: string, defaultCountry: CountryCode = 'CH'): boolean {
  if (!value?.trim()) return false;
  const parsed = parsePhoneNumberFromString(value, defaultCountry);
  return parsed?.isValid() ?? false;
}

export function formatAsYouType(value: string, country: CountryCode = 'CH'): string {
  const formatter = new AsYouType(country);
  return formatter.input(value);
}

