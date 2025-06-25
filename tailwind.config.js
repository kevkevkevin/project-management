module.exports = {
  darkMode: false, // or remove this line entirely
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
      primary: '#E4002B', // Monday.com sliders RED
      accent: '#00c875',  // Success green
      warning: '#ffcb00', // Yellow
      danger: '#e2445c',  // Red
      bg: '#f6f7fb',      // Light background
    },
    fontFamily: {
      sans: ['"Segoe UI"', 'Roboto', 'sans-serif']
    }

    },
  },
  plugins: [],
}
