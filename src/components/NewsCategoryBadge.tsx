const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'Actualité': { bg: 'var(--info-soft)', text: 'var(--info-text)', border: 'var(--info-soft)' },
  'Annonce officielle': { bg: 'var(--danger-soft)', text: 'var(--danger-text)', border: 'var(--danger-soft)' },
  'Repas de soutien': { bg: 'var(--success-soft)', text: 'var(--success-text)', border: 'var(--success-soft)' },
  'Événement': { bg: 'var(--purple-soft)', text: 'var(--purple-text)', border: 'var(--purple-soft)' },
}

const FALLBACK = { bg: 'var(--info-soft)', text: 'var(--info-text)', border: 'var(--info-soft)' }

export default function NewsCategoryBadge({ category }: { category: string }) {
  const style = CATEGORY_STYLES[category] || FALLBACK
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
    >
      {category}
    </span>
  )
}
