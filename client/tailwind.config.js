/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        serif: ["Source Serif 4", "Georgia", "serif"],
      },
      colors: {
        ink: {
          950: "#121826",
          900: "#1b2437",
          800: "#243049",
          700: "#33415f",
        },
        paper: "#f4efe6",
        cream: "#fbf7f0",
        clay: {
          500: "#c45c26",
          600: "#a94b1c",
        },
        moss: {
          500: "#3d6b4f",
          600: "#2f5440",
        },
      },
    },
  },
  plugins: [],
};
