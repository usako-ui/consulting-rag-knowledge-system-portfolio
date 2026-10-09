import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0B2D4A',
          accent: '#266EB7',
          soft: '#E5EEF7',
        },
        surface: {
          app: '#F4F6FA',
          card: '#FFFFFF',
        },
        border: {
          DEFAULT: '#E1E6EE',
        },
        text: {
          primary: '#0F1E2E',
          muted: '#5A6879',
        },
        status: {
          success: '#2E9E6E',
          warning: '#D9A427',
          alert: '#E07A2C',
          danger: '#C5453C',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans-jp)', 'var(--font-sans-en)', 'system-ui', 'sans-serif'],
        en: ['var(--font-sans-en)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        inline: '6px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(11, 45, 74, 0.06)',
        'card-hover': '0 2px 8px rgba(11, 45, 74, 0.08)',
      },
      spacing: {
        section: '32px',
      },
      transitionDuration: {
        150: '150ms',
      },
    },
  },
  plugins: [],
};

export default config;
