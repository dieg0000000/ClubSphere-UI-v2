interface AuthLikeError {
  code?: string
  message?: string
}

const LEAKED_PASSWORD_MESSAGE = 'Ce mot de passe est trop courant (il figure dans des listes de mots de passe piratés). Choisissez-en un autre, par exemple une phrase de 3 mots.'

const SHORT_PASSWORD_MESSAGE = 'Le mot de passe doit contenir au moins 10 caractères.'

function isLeakedPassword(code: string, msg: string): boolean {
  return msg.includes('known to be weak') || msg.includes('easy to guess') || msg.includes('leaked') || msg.includes('pwned')
}

export function translateAuthError(errorOrMessage: AuthLikeError | string): string {
  const code = typeof errorOrMessage === 'string' ? '' : (errorOrMessage.code ?? '')
  const raw = typeof errorOrMessage === 'string' ? errorOrMessage : (errorOrMessage.message ?? '')
  const msg = raw.toLowerCase()

  if (code === 'weak_password' || msg.includes('password should be at least') || msg.includes('known to be weak') || msg.includes('leaked') || msg.includes('easy to guess') || msg.includes('pwned')) {
    if (isLeakedPassword(code, msg)) {
      return LEAKED_PASSWORD_MESSAGE
    }
    return SHORT_PASSWORD_MESSAGE
  }

  if (code === 'same_password' || msg.includes('should be different from the old')) {
    return 'Le nouveau mot de passe doit être différent de l’ancien.'
  }

  if (code === 'over_email_send_rate_limit' || msg.includes('email rate limit exceeded')) {
    return 'Trop d’e-mails envoyés en ce moment. Réessayez dans une heure.'
  }

  if (code === 'over_request_rate_limit' || msg.includes('request rate limit reached')) {
    return 'Trop de tentatives depuis votre réseau. Attendez 5 minutes puis réessayez une seule fois.'
  }

  if (code === 'over_send_rate_limit' || msg.includes('for security purposes, you can only request this after')) {
    return 'Un e-mail vient d’être envoyé à cette adresse. Patientez une minute avant de redemander.'
  }

  if (code === 'user_already_exists' || msg.includes('user already registered')) {
    return 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou utilisez « Mot de passe oublié ».'
  }

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'E-mail ou mot de passe incorrect.'
  }

  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Votre adresse e-mail n’est pas encore confirmée. Ouvrez l’e-mail de confirmation que vous avez reçu.'
  }

  if (code === 'otp_expired' || msg.includes('link is invalid or has expired') || msg.includes('otp has expired')) {
    return 'Ce lien n’est plus valable. Demandez-en un nouveau.'
  }

  if (msg.includes('password') && msg.includes('at least') && /\d+\s*character/.test(msg)) {
    return SHORT_PASSWORD_MESSAGE
  }

  if (msg.includes('signup requires a valid password')) {
    return 'Veuillez saisir un mot de passe valide.'
  }

  if (msg.includes('invalid') && msg.includes('email')) {
    return 'Adresse e-mail invalide.'
  }

  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Trop de tentatives. Réessayez dans quelques minutes.'
  }

  console.error('[translateAuthError] unmapped auth error', { code, message: raw })
  return raw || 'Une erreur est survenue. Réessayez dans quelques instants.'
}

export function isRateLimitError(errorOrMessage: AuthLikeError | string): boolean {
  const code = typeof errorOrMessage === 'string' ? '' : (errorOrMessage.code ?? '')
  const raw = typeof errorOrMessage === 'string' ? errorOrMessage : (errorOrMessage.message ?? '')
  const msg = raw.toLowerCase()
  return (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    code === 'over_send_rate_limit' ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('for security purposes, you can only request this after')
  )
}
