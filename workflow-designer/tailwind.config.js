/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        glass: 'rgba(255,255,255,.12)',
        'glass-border': 'rgba(255,255,255,.18)',
      },
      backdropBlur: { glass: '12px' },
    },
  },
  plugins: [],
};
