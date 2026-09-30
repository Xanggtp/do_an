/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Sans"', 'sans-serif'],
        sans: ['"Manrope"', 'sans-serif']
      },
      colors: {
        ink: '#18211f',
        sage: '#7b9a86',
        coral: '#e9785f',
        cream: '#f6f4ed'
      }
    }
  },
  plugins: []
};
