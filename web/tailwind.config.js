export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0C10', panel: '#12151B', panel2: '#181C24', line: '#242A35',
        txt: '#EDF0F4', txt2: '#9AA4B2', muted: '#5C6573',
        mint: '#00E5A8', mint2: '#00C794', agent: '#7C5CFF', chain: '#34D2FF', amber: '#FFB020', coral: '#FF5A6E',
      },
      fontFamily: {
        display: ['"Clash Display"', 'system-ui', 'sans-serif'],
        sans: ['"General Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '15px', ctl: '10px' },
    },
  },
  plugins: [],
}
