/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // UTC brand palette — white background, gold accent, near-black text.
        gold: {
          DEFAULT: '#C99700',
          50: '#FBF6E7',
          100: '#F6EBC4',
          200: '#E8D27E',
          300: '#DDBB47',
          400: '#D2A724',
          500: '#C99700',
          600: '#A87C00',
          700: '#856200',
          800: '#5E4500',
          900: '#3B2B00',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          soft: '#3F3F3F',
          muted: '#6B6B6B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
}
