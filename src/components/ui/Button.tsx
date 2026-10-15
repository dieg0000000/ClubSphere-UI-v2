import { ButtonHTMLAttributes, CSSProperties, ReactNode, forwardRef, useState } from 'react';
import { Loader as Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'danger' | 'warning' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const sizeStyles: Record<Size, { height: string; padding: string; fontSize: string; borderRadius: string }> = {
  sm: { height: '32px', padding: '7px 13px', fontSize: '13px', borderRadius: '8px' },
  md: { height: '40px', padding: '10px 18px', fontSize: '14px', borderRadius: '10px' },
  lg: { height: '48px', padding: '13px 24px', fontSize: '15px', borderRadius: '12px' },
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      style,
      disabled,
      children,
      ...rest
    },
    ref
  ) => {
    const [hover, setHover] = useState(false);
    const sz = sizeStyles[size];
    const isDisabled = disabled || loading;

    const base: CSSProperties = {
      height: sz.height,
      padding: sz.padding,
      fontSize: sz.fontSize,
      borderRadius: sz.borderRadius,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? 0.5 : 1,
      transition: 'transform 0.15s ease, filter 0.15s ease, opacity 0.15s ease, border-color 0.15s ease, background 0.15s ease',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      border: 'none',
      outline: 'none',
    };

    const v: Exclude<Variant, 'danger'> = variant === 'danger' ? 'destructive' : variant;

    let variantStyle: CSSProperties = {};
    if (v === 'primary') {
      variantStyle = {
        background: 'var(--grad)',
        color: 'var(--text-inverse)',
        fontWeight: 600,
        transform: hover && !isDisabled ? 'translateY(-1px)' : undefined,
        filter: hover && !isDisabled ? 'brightness(1.08)' : undefined,
      };
    } else if (v === 'destructive') {
      variantStyle = {
        background: 'var(--danger)',
        color: 'var(--text-inverse)',
        fontWeight: 600,
        opacity: isDisabled ? 0.5 : hover ? 0.88 : 1,
      };
    } else if (v === 'warning') {
      variantStyle = {
        background: 'var(--warning)',
        color: 'var(--text-primary)',
        fontWeight: 600,
        opacity: isDisabled ? 0.5 : hover ? 0.9 : 1,
      };
    } else if (v === 'ghost') {
      variantStyle = {
        background: hover && !isDisabled ? 'var(--bg-hover)' : 'transparent',
        color: hover && !isDisabled ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: 500,
      };
    } else {
      variantStyle = {
        background: hover && !isDisabled ? 'var(--bg-hover)' : 'var(--bg-app)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderColor: hover && !isDisabled ? 'var(--border-strong)' : undefined,
        fontWeight: 500,
      };
    }

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ ...base, ...variantStyle, ...style }}
        {...rest}
      >
        {loading && (
          <Loader2
            size={size === 'sm' ? 14 : 16}
            style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}
            aria-hidden="true"
          />
        )}
        {!loading && leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
