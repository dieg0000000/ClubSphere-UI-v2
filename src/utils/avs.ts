export function formatAvsInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  let formatted = '';
  if (digits.length > 0) formatted = digits.slice(0, 3);
  if (digits.length > 3) formatted += '.' + digits.slice(3, 7);
  if (digits.length > 7) formatted += '.' + digits.slice(7, 11);
  if (digits.length > 11) formatted += '.' + digits.slice(11, 13);
  return formatted;
}

export function isCompleteAvs(value: string): boolean {
  return value.replace(/\D/g, '').length === 13;
}
