/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#070B14',
        bg2: '#0B1220',
        surface: 'rgba(14,22,38,.78)',
        line: 'rgba(148,170,210,.16)',
        'line-strong': 'rgba(148,170,210,.28)',
        text: '#EAF0FA',
        muted: '#9AA7BD',
        faint: '#7A89A3',
        safe: '#4FE3C1',
        accent: '#FFB547',
        danger: '#FF5A5F',
        info: '#7AA2FF',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"Inter Variable"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'console': '0 calc(24 * var(--u)) calc(60 * var(--u)) rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }
    },
  },
  plugins: [],
}
