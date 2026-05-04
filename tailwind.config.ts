import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        accent: '#6366f1'
      }
    }
  },
  plugins: []
} satisfies Config
