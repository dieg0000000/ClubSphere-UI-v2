const LABELS: Record<string, string> = {
  invoice: 'Facture',
  cash_card: 'Sur place',
}

export function paymentModeLabel(code: string): string {
  return LABELS[code] || code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function paymentModeLabels(codes: string[]): string {
  return codes.map(paymentModeLabel).join(', ')
}
