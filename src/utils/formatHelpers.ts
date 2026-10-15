export function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const formatAVS = (value: string) => {
  const digits = value.replace(/[^\d]/g, '');
  let formatted = '';
  if (digits.length > 0) formatted = digits.slice(0, 3);
  if (digits.length > 3) formatted += '.' + digits.slice(3, 7);
  if (digits.length > 7) formatted += '.' + digits.slice(7, 11);
  if (digits.length > 11) formatted += '.' + digits.slice(11, 13);
  return formatted;
};

export const validateAVS = (avs: string): boolean => {
  return /^756\.\d{4}\.\d{4}\.\d{2}$/.test(avs);
};
