import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  // Absolute globs so class scanning works no matter the launch directory.
  content: [path.join(dir, 'index.html'), path.join(dir, 'src/**/*.{js,jsx}')],
  theme: {
    extend: {
      colors: {
        // Dark-mode (OLED) canvas
        ink: {
          950: '#05070D',
          900: '#0A0E1A',
          800: '#111726',
          700: '#1A2235',
          600: '#26314A',
        },
        // Brand blue (data)
        brand: {
          DEFAULT: '#3B82F6',
          deep: '#1E40AF',
          soft: '#60A5FA',
        },
        // Amber CTA / highlight
        amber: {
          DEFAULT: '#F59E0B',
          soft: '#FBBF24',
        },
        gain: '#22D3A5',
        loss: '#F87171',
      },
      fontFamily: {
        sans: ['"Fira Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(59,130,246,0.35)',
        'glow-amber': '0 0 24px -4px rgba(245,158,11,0.4)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        shimmer: 'shimmer 1.5s linear infinite',
      },
    },
  },
  plugins: [],
};
