export function getPrimaryButtonStyle() {
  return {
    backgroundColor: 'var(--primary)',
    borderColor: 'var(--primary)',
  }
}

export function getPrimaryButtonHoverStyle() {
  return {
    backgroundColor: 'var(--primary-dark)',
    borderColor: 'var(--primary-dark)',
  }
}

export function handlePrimaryButtonMouseEnter(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.backgroundColor = 'var(--primary-dark)'
  e.currentTarget.style.borderColor = 'var(--primary-dark)'
}

export function handlePrimaryButtonMouseLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.backgroundColor = 'var(--primary)'
  e.currentTarget.style.borderColor = 'var(--primary)'
}

export function getPrimaryTextColor() {
  return {
    color: 'var(--primary)'
  }
}

export function getPrimaryBorderColor() {
  return {
    borderColor: 'var(--primary)'
  }
}
