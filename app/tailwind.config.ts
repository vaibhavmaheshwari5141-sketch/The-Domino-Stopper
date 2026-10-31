import type { Config } from 'tailwindcss';

// Colours, radii and fonts come from src/styles/tokens.css. The palette replaces Tailwind's default colours, so
// only design-token colours exist (bg-surface, text-ink, border-line, bg-amber-soft, text-critical, ...).
// Tokens are plain CSS variables, so opacity modifiers such as bg-navy/50 are not available; use the *-soft tints.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      bg: 'var(--color-bg)',
      surface: 'var(--color-surface)',
      ink: 'var(--color-ink)',
      muted: 'var(--color-muted)',
      line: 'var(--color-line)',
      navy: 'var(--color-navy)',
      tarmac: 'var(--color-tarmac)',
      amber: { DEFAULT: 'var(--color-amber)', soft: 'var(--color-amber-soft)' },
      teal: { DEFAULT: 'var(--color-teal)', soft: 'var(--color-teal-soft)' },
      success: { DEFAULT: 'var(--color-success)', soft: 'var(--color-success-soft)' },
      warning: { DEFAULT: 'var(--color-warning)', soft: 'var(--color-warning-soft)' },
      critical: { DEFAULT: 'var(--color-critical)', soft: 'var(--color-critical-soft)' },
    },
    extend: {
      keyframes: {
        'drawer-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
      },
      animation: { 'drawer-in': 'drawer-in 180ms ease-out' },
      screens: {
        // wide: two-column layouts. fit: big enough for fixed-height pages (Login, Overview) to fit without scrolling
        wide: '1100px',
        fit: { raw: '(min-width: 1100px) and (min-height: 680px)' },
      },
      borderColor: { DEFAULT: 'var(--color-line)' },
      ringColor: { DEFAULT: 'var(--color-teal)' },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
} satisfies Config;
