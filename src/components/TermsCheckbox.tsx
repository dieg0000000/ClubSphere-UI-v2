import { ExternalLink } from 'lucide-react'
import { PUBLIC_TERMS_URL } from '../lib/terms'

interface TermsCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  version?: string | null
  url?: string | null
  disabled?: boolean
}

export function TermsLink({ version, url }: { version?: string | null; url?: string | null }) {
  return (
    <a
      href={url || PUBLIC_TERMS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm underline underline-offset-2 transition-colors"
      style={{ color: 'var(--accent-text)' }}
    >
      {version ? `Lire les conditions complètes (version ${version})` : 'Lire les conditions complètes'}
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  )
}

export function TermsCheckbox({ checked, onChange, version, url, disabled }: TermsCheckboxProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded mt-0.5 shrink-0"
          style={{ accentColor: 'var(--accent)' }}
        />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {version
            ? `J'ai lu et j'accepte les conditions d'utilisation (version ${version}).`
            : "J'ai lu et j'accepte les conditions d'utilisation."}
        </span>
      </label>
      <div className="pl-6">
        <TermsLink version={version} url={url} />
      </div>
    </div>
  )
}
