/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#B00020',
          dark: '#8A0019',
          light: '#F6E4E7',
        },
        accent: {
          DEFAULT: '#FF6B00',
          dark: '#E05F00',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Tajawal', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};
