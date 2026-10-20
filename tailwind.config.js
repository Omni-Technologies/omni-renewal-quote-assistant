/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdbff',
          300: '#8ec5ff',
          400: '#59a4ff',
          500: '#3382fb',
          600: '#1d63ef',
          700: '#184edc',
          800: '#1b41b2',
          900: '#1c3b8c',
          950: '#152556',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae2',
          300: '#b1bac7',
          400: '#8794a6',
          500: '#68778b',
          600: '#536073',
          700: '#444f60',
          800: '#3b4451',
          900: '#343b46',
          950: '#1c222b',
        },
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          '"Cascadia Mono"',
          '"Consolas"',
          '"SFMono-Regular"',
          'Menlo',
          'monospace',
        ],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        pop: '0 12px 32px -8px rgb(16 24 40 / 0.25)',
      },
    },
  },
  plugins: [],
};
