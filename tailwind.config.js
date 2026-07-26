/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: '#0F0F10',
        surface: '#1A1A1C',
        surface2: '#222224',
        border: 'rgba(255,255,255,0.06)',
        text: '#E8E8EA',
        textMuted: '#6B6B70',
        accent: '#6366F1',
        accentHover: '#818CF8',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
