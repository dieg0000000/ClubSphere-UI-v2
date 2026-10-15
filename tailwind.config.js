export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'app': 'var(--bg-app)',
        'sidebar': 'var(--bg-sidebar)',
        'card': 'var(--bg-card)',
        'card-hover': 'var(--bg-card-hover)',
        'hover': 'var(--bg-hover)',
        'input': 'var(--bg-input)',
        'modal': 'var(--bg-modal)',
        'table-header': 'var(--bg-table-header)',
        'row-alt': 'var(--bg-row-alt)',
        'primary-text': 'var(--text-primary)',
        'secondary-text': 'var(--text-secondary)',
        'muted-text': 'var(--text-muted)',
        'inverse-text': 'var(--text-inverse)',
        'border': 'var(--border-color)',
        'border-strong': 'var(--border-strong)',
        'accent': {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
          text: 'var(--accent-text)',
        },
        'success': {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
          text: 'var(--success-text)',
        },
        'warning': {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
          text: 'var(--warning-text)',
        },
        'info': {
          DEFAULT: 'var(--info)',
          soft: 'var(--info-soft)',
          text: 'var(--info-text)',
        },
        'danger': {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
          text: 'var(--danger-text)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'DEFAULT': 'var(--shadow)',
        'lg': 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
}
