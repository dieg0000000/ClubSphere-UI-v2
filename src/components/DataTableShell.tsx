import { ReactNode } from 'react';

interface DataTableShellProps {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
  /** When true, omits the outer card wrapper (use when the table is already inside a styled container). */
  bare?: boolean;
  /** When false the container has no fixed height / inner scroll — the page itself scrolls and thead sticks to the viewport. Default true. */
  scrollable?: boolean;
}

const SHELL_CLASS = 'dts';

function DataTableShell({
  children,
  maxHeight = 'calc(100vh - 240px)',
  className = '',
  bare = false,
  scrollable = true,
}: DataTableShellProps) {
  const scrollDiv = scrollable ? (
    <div style={{ maxHeight, overflowY: 'auto', overflowX: 'auto' }} className={SHELL_CLASS}>
      {children}
    </div>
  ) : (
    <div className={SHELL_CLASS}>
      {children}
    </div>
  );

  if (bare) return (
    <>
      <style>{SHELL_STYLES}</style>
      {scrollDiv}
    </>
  );

  return (
    <div
      className={`dts-card ${className}`.trim()}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <style>{SHELL_STYLES}</style>
      {scrollDiv}
    </div>
  );
}

const SHELL_STYLES = `
  .${SHELL_CLASS} thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--table-header-bg);
    border-bottom: 1px solid var(--border-color);
  }
  .${SHELL_CLASS} thead th::after {
    content: '';
    position: absolute;
    left: 0; right: 0; bottom: -8px;
    height: 8px;
    pointer-events: none;
    background: linear-gradient(to bottom, rgba(0,0,0,0.06), rgba(0,0,0,0));
  }
  .dark .${SHELL_CLASS} thead th::after {
    background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
  }
`;

export default DataTableShell;
