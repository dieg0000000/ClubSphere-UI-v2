import { useState, InputHTMLAttributes, ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  wrapperClassName?: string
  leftIcon?: ReactNode
}

export default function PasswordInput({ wrapperClassName, leftIcon, className, style, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={`relative ${wrapperClassName || ''}`}>
      {leftIcon}
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className || ''} pr-10`}
        style={style}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        tabIndex={0}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
